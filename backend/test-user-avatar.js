const assert = require("node:assert/strict");
const fs = require("node:fs");
const service = require("./services/imageAssetService");
const User = require("./models/User");

async function run() {
  const tinyPng = `data:image/png;base64,${Buffer.from("avatar-fixture").toString("base64")}`;
  assert.deepEqual(service.validateDataImage(tinyPng), { mimeType: "image/png", bytes: 14 });
  assert.throws(() => service.validateDataImage("data:text/plain;base64,dGVzdA=="), (error) => error.code === "IMAGE_TYPE_INVALID");
  const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((service.MAX_IMAGE_BYTES + 1) * 4 / 3))}`;
  assert.throws(() => service.validateDataImage(tooLarge), (error) => error.code === "IMAGE_SIZE_INVALID");
  assert(User.schema.path("avatarUrl")); assert(User.schema.path("avatarPublicId")); assert.equal(User.schema.path("avatarPublicId").options.select, false);
  const auth = fs.readFileSync(require.resolve("./routes/auth"), "utf8");
  assert(auth.includes('router.post("/profile/avatar", requireAuth'));
  assert(auth.includes('router.delete("/profile/avatar", requireAuth'));
  assert(!auth.includes('/profile/:id/avatar'), "another user's avatar must not be editable");
  assert(auth.includes("avatarUrl") && !auth.includes("req.body?.userId"));
  console.log("Canonical user avatar validation, self-only RBAC surface, and hosted-reference storage checks passed.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
