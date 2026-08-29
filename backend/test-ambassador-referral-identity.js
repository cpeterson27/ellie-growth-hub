const assert = require("node:assert/strict");
const identity = require("./services/ambassadorReferralIdentityService");
const ambassadorService = require("./services/ambassadorService");
const referralService = require("./services/referralCommissionService");

function query(value) {
  const chain = { select() { return chain; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  return chain;
}
function lookup(rows) {
  return (filter) => query(rows.find((row) => String(row.workspaceId) === String(filter.workspaceId) && (!filter._id?.$ne || String(row._id) !== String(filter._id.$ne)) && filter.$or?.some((condition) => {
    const [key, matcher] = Object.entries(condition)[0]; return matcher.test(row[key]);
  })) || null);
}

async function generationAndCollisions() {
  assert.equal(identity.normalizeReferralCode("  Éllie Baxter!  "), "ellie-baxter");
  const ambassadors = [{ _id: "a1", workspaceId: "w1", referralCode: "ELLIE-BAXTER", referralSlug: "ELLIE-BAXTER" }];
  const models = { AmbassadorProfile: { findOne: lookup(ambassadors) }, CoachProfile: { findOne: () => query(null) } };
  assert.equal(await identity.availableCode({ workspaceId: "w1", name: "Ellie Baxter" }, models), "ellie-baxter-2");
  assert.equal(await identity.availableCode({ workspaceId: "w2", name: "Ellie Baxter" }, models), "ellie-baxter", "codes are unique per workspace, not globally");
}

async function validationAndUrls() {
  assert.equal(identity.validateCustomCode("Freedom-Lead"), "freedom-lead");
  await assert.rejects(async () => identity.validateCustomCode("bad code"), (error) => error.code === "AMBASSADOR_REFERRAL_CODE_INVALID");
  assert.equal(identity.validateCommunityUrl(""), "");
  assert.equal(identity.validateCommunityUrl("https://community.example/group"), "https://community.example/group");
  assert.throws(() => identity.validateCommunityUrl("javascript:alert(1)"), (error) => error.code === "AMBASSADOR_COMMUNITY_URL_INVALID");
  assert.equal(identity.referralUrl("freedom-lead", { PUBLIC_FRONTEND_URL: "https://app.example.com/" }), "https://app.example.com/ref/freedom-lead");
}

async function stableAndAuthorizedUpdates() {
  const profile = { _id: "a1", workspaceId: "w1", displayName: "New Name", referralCode: "original-code", referralSlug: "original-code", async save() { return this; } };
  const models = { AmbassadorProfile: { findOne: (filter) => filter._id === "a1" && filter.workspaceId === "w1" ? query(profile) : query(null) }, CoachProfile: { findOne: () => query(null) }, CrmActivity: { create: async (activity) => activity } };
  assert.equal(profile.referralCode, "original-code", "a name edit does not mutate an existing identity");
  const changed = await identity.updateIdentity({ workspaceId: "w1", profileId: "a1", referralCode: "Custom-Code", actorUserId: "owner" }, models);
  assert.equal(changed.profile.referralCode, "custom-code");
  await assert.rejects(() => identity.updateIdentity({ workspaceId: "w2", profileId: "a1", referralCode: "other-code", actorUserId: "owner" }, models), (error) => error.code === "AMBASSADOR_NOT_FOUND");
}

async function compatibility() {
  let update;
  const updated = await ambassadorService.updateProfile({ workspaceId: "w1", profileId: "legacy", changes: { communityUrl: "" } }, { AmbassadorProfile: { findOneAndUpdate: async (filter, value) => { update = { filter, value }; return { _id: "legacy", referralCode: "legacy-code", referralSlug: "legacy-code", communityUrl: "" }; } } });
  assert.deepEqual(update.filter, { _id: "legacy", workspaceId: "w1" });
  assert.match(updated.referralUrl, /\/ref\/legacy-code$/);
  const promoter = await referralService.resolvePromoterByCode({ workspaceId: "w1", referralCode: "LEGACY-CODE" }, { AmbassadorProfile: { findOne: (filter) => { assert.equal(filter.workspaceId, "w1"); return query({ _id: "legacy", referralCode: "legacy-code" }); } }, CoachProfile: { findOne: () => query(null) } });
  assert.equal(promoter.profile._id, "legacy", "existing attribution resolution remains compatible");
}

Promise.resolve().then(generationAndCollisions).then(validationAndUrls).then(stableAndAuthorizedUpdates).then(compatibility).then(() => console.log("Ambassador referral generation, uniqueness, validation, tenancy, URL construction, and legacy attribution compatibility passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
