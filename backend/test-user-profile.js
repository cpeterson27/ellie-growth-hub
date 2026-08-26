const assert = require("node:assert/strict");
const profile = require("./services/userProfileService");
const welcome = require("./services/ambassadorWelcomeService");
const auth = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");
const query = (value) => ({ select() { return this; }, lean: async () => value });
async function run() {
  let user = { name: "Existing User", email: "fixture@example.test", avatarUrl: "", passwordHash: "never returned" };
  const legacy = { bio: "Legacy biography", company: "Old company", socialProfiles: { linkedin: "https://linkedin.com/in/fixture" } };
  const models = {
    User: { findById: (id) => { assert.equal(id, "self"); return query(user); }, updateOne: async (filter, update) => { assert.deepEqual(filter, { _id: "self" }); for (const [key, value] of Object.entries(update.$set)) { if (key.startsWith("socialProfiles.")) user.socialProfiles = { ...user.socialProfiles, [key.split(".")[1]]: value }; else user[key] = value; } } },
    AmbassadorProfile: { findOne: (filter) => { assert.deepEqual(filter, { userId: "self", workspaceId: "own-workspace" }); return query(legacy); } },
  };
  const context = { userId: "self", workspaceId: "own-workspace" };
  const before = await profile.load(context, models);
  assert.equal(before.bio, legacy.bio); assert(!("passwordHash" in before)); assert(!("_id" in before));
  await assert.rejects(profile.load({}, models), /Authentication required/);
  for (const changes of [{ userId: "other" }, { workspaceId: "other" }, { email: "changed@example.test" }, { roles: ["owner"] }, { avatarUrl: "https://unsafe" }, { name: "" }, { bio: "x".repeat(3001) }, { timezone: "invalid zone" }, { socialProfiles: { x: "javascript:alert(1)" } }, { company: {} }]) assert.throws(() => profile.validate(changes));
  const saved = await profile.save(context, { name: "Updated User", bio: "Canonical biography", timezone: "America/Los_Angeles", socialProfiles: { linkedin: "https://linkedin.com/in/new" } }, models);
  assert.equal(saved.company, legacy.company); assert.equal(saved.bio, "Canonical biography"); assert.equal(saved.email, user.email);
  assert.equal(welcome.variables(legacy, user, {}).bio, "Canonical biography");
  await profile.save(context, { bio: "" }, models);
  assert.equal((await profile.load(context, models)).bio, "", "cleared canonical values must not resurrect legacy data");
  assert.equal(welcome.completeness(legacy, user, ["bio"]).complete, false);
  for (const method of ["get", "patch"]) {
    const route = auth.stack.find((layer) => layer.route?.path === "/profile" && layer.route.methods[method]).route;
    assert.equal(route.stack[0].handle, requireAuth);
  }
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await requireAuth({ headers: {} }, response, () => assert.fail("unauthenticated user passed"));
  assert.equal(response.code, 401);
  const User = require("./models/User");
  const imageAsset = require("./services/imageAssetService");
  const activity = require("./services/ambassadorProfileActivity");
  const originals = [User.findById, imageAsset.uploadImage, activity.recordHeadshot];
  try {
    const ownUser = { _id: "self", name: "Self", email: "self@example.test", async save() {} };
    User.findById = (id) => { assert.equal(id, "self"); return { select: async () => ownUser }; };
    imageAsset.uploadImage = async () => ({ url: "https://res.cloudinary.com/fixture/avatar.png", publicId: "fixture/avatar" });
    activity.recordHeadshot = async () => {};
    const handler = auth.stack.find((layer) => layer.route?.path === "/profile/avatar" && layer.route.methods.post).route.stack.at(-1).handle;
    await handler({ auth: { user: { _id: "self" }, workspaceId: "own-workspace" }, body: { userId: "someone-else", file: "mocked" } }, response);
    assert.equal(response.code, 201);
    assert.equal(response.data.user.avatarUrl, ownUser.avatarUrl);
    assert.equal(ownUser.avatarPublicId, "fixture/avatar");
  } finally { [User.findById, imageAsset.uploadImage, activity.recordHeadshot] = originals; }
  console.log("User profile: own loading/editing, legacy fallback, safe clearing, immutable identity/roles, URL/timezone validation, no secret disclosure, auth protection, and Ambassador canonical reuse passed.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
