const assert = require("assert");
const crypto = require("crypto");
const service = require("./services/skoolIntegrationService");

async function run() {
  const workspaceId = "64b000000000000000000001";
  let persisted;
  const models = {
    IntegrationConnection: {
      findOneAndUpdate: async (_filter, update) => {
        persisted = update.$set;
        return persisted;
      },
    },
  };
  const encrypted = { version: 1, ciphertext: "opaque" };
  const configured = await service.configure({ workspaceId, mode: "zapier", groupId: "group-1", groupName: "Coaching", groupUrl: "https://www.skool.com/example", zapierHookUrl: "https://hooks.zapier.com/example", adapterSecret: "secret" }, models, { encryptCredentials: (value) => { assert.equal(value.adapterSecret, "secret"); return encrypted; } });
  assert.equal(configured.configured, true);
  assert.equal(configured.connected, false, "configuration must not claim a live connection without a provider check");
  assert.deepEqual(persisted.credentialsEncrypted, encrypted);
  assert.equal(JSON.stringify(persisted).includes("hooks.zapier.com"), false, "hook URL must not be in public settings");

  const body = JSON.stringify({ providerEventId: "evt-1", eventType: "paid_member" });
  const signature = crypto.createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(service.verifyAdapter(body, "secret", signature), true);
  assert.equal(service.verifyAdapter(body, "wrong", signature), false);

  const request = { _id: "req-1", action: "invite", email: "student@example.com", groupId: "group-1", courseIds: ["course-1"], idempotencyKey: "key-1", attempts: 0, save: async () => {} };
  let sent;
  const dispatchModels = {
    IntegrationConnection: { findOne: () => ({ select: async () => ({ settings: { mode: "zapier" }, credentialsEncrypted: encrypted }) }) },
    CrmActivity: { create: async () => {} },
  };
  await service.dispatch(request, workspaceId, dispatchModels, async (_url, options) => { sent = JSON.parse(options.body); return { ok: true }; }, { decryptCredentials: () => ({ zapierHookUrl: "https://hooks.zapier.test", adapterSecret: "secret" }) });
  assert.equal(request.status, "dispatched");
  assert.deepEqual(sent, { requestId: "req-1", idempotencyKey: "key-1", action: "invite", email: "student@example.com", groupId: "group-1", courseIds: ["course-1"] });
  assert.equal(Object.hasOwn(sent, "notes"), false, "private coaching notes must never leave the application");

  const revoke = { action: "revoke", save: async () => {} };
  await service.dispatch(revoke, workspaceId, dispatchModels, async () => { throw new Error("must not call"); });
  assert.equal(revoke.status, "manual_required", "undocumented revocation must remain manual");
  console.log("Skool integration mocked tests passed");
}

run().catch((error) => { console.error(error); process.exit(1); });
