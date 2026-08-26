const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

process.env.META_APP_SECRET = "test-meta-secret";
const service = require("./services/metaDeauthorizationService");

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signedRequest(payload, secret = process.env.META_APP_SECRET) {
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

async function validRequestDisconnectsOnlyAuthorization() {
  let captured;
  const models = {
    SocialConnection: {
      async updateMany(filter, update) {
        captured = { filter, update };
        return { modifiedCount: 1 };
      },
    },
  };
  const result = await service.deauthorize(signedRequest({ algorithm: "HMAC-SHA256", user_id: "meta-user-1", issued_at: 123 }), models);
  assert.equal(result.disconnected, 1);
  assert.deepEqual(captured.filter.provider.$in, ["meta", "instagram"]);
  assert.equal(captured.filter.$or[0]["authorization.userId"], "meta-user-1");
  assert.equal(captured.update.$set.status, "disconnected");
  assert.equal(captured.update.$unset.credentialsEncrypted, 1);
  assert.equal(JSON.stringify(captured.update).includes("contact"), false);
}

async function invalidSignatureIsRejectedWithoutWrites() {
  let writes = 0;
  const models = { SocialConnection: { async updateMany() { writes += 1; } } };
  await assert.rejects(
    () => service.deauthorize(signedRequest({ algorithm: "HMAC-SHA256", user_id: "meta-user-1" }, "wrong-secret"), models),
    /Invalid signed_request signature/,
  );
  assert.equal(writes, 0);
}

async function malformedRequestsAreRejectedWithoutWrites() {
  let writes = 0;
  const models = { SocialConnection: { async updateMany() { writes += 1; } } };
  for (const value of [undefined, "", "one-part", "%%%.___", signedRequest({ algorithm: "HMAC-SHA256" })]) {
    await assert.rejects(() => service.deauthorize(value, models));
  }
  assert.equal(writes, 0);
}

function publicRouteContract() {
  const route = fs.readFileSync(path.join(__dirname, "routes/social.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert(route.includes('router.post("/meta/deauthorize"'));
  assert(server.includes('req.path === "/social/meta/deauthorize"'));
  assert.equal(route.includes("credentialsEncrypted"), false, "The public route must never read or return credentials");
}

(async () => {
  await validRequestDisconnectsOnlyAuthorization();
  await invalidSignatureIsRejectedWithoutWrites();
  await malformedRequestsAreRejectedWithoutWrites();
  publicRouteContract();
  console.log("Meta deauthorization signed_request validation and safe local disconnect checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
