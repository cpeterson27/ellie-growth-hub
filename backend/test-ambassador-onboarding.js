const assert = require("node:assert/strict");
const AmbassadorProfile = require("./models/AmbassadorProfile");
const ReferralAttribution = require("./models/ReferralAttribution");
const CommissionLedger = require("./models/CommissionLedger");
const { effectivePermissions } = require("./authorization/capabilities");
const { createAuthContext } = require("./middleware/auth");
const { restrictNewRoleSurface } = require("./middleware/authorization");
const workspaceMembers = require("./services/workspaceMemberService");
const referrals = require("./services/referralCommissionService");
const ambassadors = require("./services/ambassadorService");

function query(value) { const chain = { populate() { return chain; }, select() { return chain; }, sort() { return chain; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; return chain; }
function doc(value) { return { ...value, async save() { this.saved = true; return this; }, toObject() { return { ...this }; }, isModified() { return true; } }; }

function schemaAndRbac() {
  assert(AmbassadorProfile.schema.indexes().some(([fields, options]) => fields.workspaceId === 1 && fields.userId === 1 && options.unique));
  assert(ReferralAttribution.schema.path("ambassadorProfileId")); assert(CommissionLedger.schema.path("ambassadorProfileId"));
  const permissions = effectivePermissions({ role: "ambassador", roles: ["ambassador"] });
  for (const allowed of ["ambassadors.view_own", "referrals.view_own", "commissions.view_own", "community.view_ambassador"]) assert(permissions.includes(allowed));
  for (const denied of ["crm.view", "coaching.view", "coaching.view_assigned", "workspace.manage", "integrations.manage", "team.manage"]) assert(!permissions.includes(denied));
  const req = { path: "/contacts", auth: createAuthContext({ user: { _id: "u1" }, workspace: { _id: "w1" }, role: "ambassador", session: {} }) }; req.auth.effectivePermissions = permissions;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { return this; } }; let next = false; restrictNewRoleSurface(req, res, () => { next = true; }); assert.equal(res.statusCode, 403); assert.equal(next, false);
  req.path = "/ambassadors/me"; res.statusCode = 200; restrictNewRoleSurface(req, res, () => { next = true; }); assert.equal(next, true);
}

async function duplicateEmailLinksProfile() {
  const membership = doc({ _id: "m1", workspaceId: "w1", userId: "u1", role: "member", roles: ["member"], status: "active", responsibilities: {} });
  const profile = { _id: "a1", workspaceId: "w1", userId: "u1", displayName: "Partner", referralCode: "partner", referralSlug: "partner", status: "active" };
  let userCreates = 0, inviteCreates = 0;
  const result = await workspaceMembers.onboardAmbassador({ workspaceId: "w1", actorUserId: "owner", name: "Partner", email: "PARTNER@example.com", roles: ["ambassador"] }, {
    User: { findOne: async () => ({ _id: "u1", name: "Partner", email: "partner@example.com" }), create: async () => { userCreates += 1; } }, WorkspaceMembership: { findOne: async () => membership }, WorkspaceInvitation: { findOneAndUpdate: async () => { inviteCreates += 1; } }, Workspace: {}, integrationHub: {},
    AmbassadorProfile: { findOne: () => query(null), findOneAndUpdate: async () => profile }, CoachProfile: { findOne: () => query(null) },
  });
  assert.equal(userCreates, 0); assert.equal(inviteCreates, 0); assert.equal(result.alreadyActive, true); assert(membership.roles.includes("ambassador")); assert.equal(result.ambassadorProfile._id, "a1");
}

async function invitationActivatesAmbassadorProfile() {
  const membership = doc({ _id: "m2", workspaceId: "w1", userId: "u2", role: "ambassador", roles: ["ambassador"], status: "invited", responsibilities: {} });
  const invitation = doc({ _id: "i2", workspaceId: "w1", userId: "u2", email: "new@example.com", name: "New Ambassador", roles: ["ambassador"], roleKey: "ambassador", subject: "Welcome {{firstName}}", body: "Join {{workspaceName}}: {{inviteLink}}", status: "ready", deliveryStatus: "pending", expiresAt: new Date(Date.now() + 10000), invitedBy: "owner" });
  const profile = doc({ _id: "a2", workspaceId: "w1", userId: "u2", displayName: "New Ambassador", referralCode: "new-ambassador", referralSlug: "new-ambassador", status: "invited" });
  let providerCalls = 0;
  const models = { User: { findOne: async () => null, create: async () => ({ _id: "u2", name: "New Ambassador", email: "new@example.com" }), findById: () => query({ name: "Owner" }) }, WorkspaceMembership: { findOne: async () => null, findOneAndUpdate: async () => membership }, WorkspaceInvitation: { findOneAndUpdate: async () => invitation, findOne: async () => invitation }, Workspace: { findById: () => query({ name: "Workspace" }) }, integrationHub: { execute: async () => { providerCalls += 1; } }, AmbassadorProfile: { findOne: () => query(null), findOneAndUpdate: async (_filter, update) => Object.assign(profile, update.$set) }, CoachProfile: { findOne: () => query(null) } };
  const invited = await workspaceMembers.onboardAmbassador({ workspaceId: "w1", actorUserId: "owner", name: "New Ambassador", email: "new@example.com" }, models); assert.equal(invited.ambassadorProfile.status, "invited"); assert.equal(invited.delivery, null); assert.equal(providerCalls, 0, "draft creation does not send");
  await workspaceMembers.sendInvitation({ workspaceId: "w1", invitationId: "i2" }, models); assert.equal(providerCalls, 1, "explicit send uses mocked delivery only"); assert.equal(invitation.status, "pending");
  const user = doc({ _id: "u2", name: "New Ambassador", email: "new@example.com", status: "active" });
  await workspaceMembers.acceptInvitation({ token: "fixture-token", password: "secure-password-123", name: "New Ambassador" }, { WorkspaceInvitation: { findOne: () => query(invitation) }, User: { findById: () => query(user) }, WorkspaceMembership: { findOne: async () => membership }, CoachProfile: { findOneAndUpdate: async () => null }, AmbassadorProfile: { findOneAndUpdate: async (_filter, update) => Object.assign(profile, update.$set) } });
  assert.equal(membership.status, "active"); assert.equal(profile.status, "active"); assert.equal(invitation.status, "accepted");
}

async function attributionReusesCanonicalContact() {
  let created;
  const models = {
    Contact: { findOne: () => query({ _id: "contact1", workspaceId: "w1" }) }, AmbassadorProfile: { findOne: () => query({ _id: "a1", userId: "u1", referralCode: "partner", referralSlug: "partner", status: "active" }) }, CoachProfile: { findOne: () => query(null) },
    ReferralAttribution: { findOne: async () => null, create: async (value) => { created = { _id: "r1", ...value }; return created; } }, CrmActivity: { create: async () => ({}) },
  };
  await referrals.attributeReferral({ workspaceId: "w1", contactId: "contact1", referralCode: "partner", source: "public_application", state: "applied", applicationId: "app1" }, models);
  assert.equal(created.contactId, "contact1"); assert.equal(created.promoterType, "ambassador"); assert.equal(created.ambassadorProfileId, "a1"); assert.equal(created.state, "applied"); assert.equal(created.applicationId, "app1");
}

async function selfOnlyAndAdminPayout() {
  let referralFilter, payoutFilter, activityCount = 0;
  await ambassadors.referrals({ workspaceId: "w1", ambassadorProfileId: "a1" }, { ReferralAttribution: { find(filter) { referralFilter = filter; return query([]); } } });
  await ambassadors.payouts({ workspaceId: "w1", ambassadorProfileId: "a1" }, { CommissionLedger: { find(filter) { payoutFilter = filter; return query([]); } } });
  assert.deepEqual(referralFilter, { workspaceId: "w1", ambassadorProfileId: "a1", promoterType: "ambassador" }); assert.deepEqual(payoutFilter, { workspaceId: "w1", ambassadorProfileId: "a1", beneficiaryType: "ambassador" });
  const ledger = doc({ _id: "pay1", workspaceId: "w1", beneficiaryType: "ambassador", status: "pending", contactId: "contact1" });
  const models = { ReferralAttribution: { findOne: () => query({ _id: "r1", workspaceId: "w1", contactId: "contact1", ambassadorProfileId: "a1", promoterType: "ambassador" }) }, AmbassadorProfile: { findOne: () => query({ _id: "a1", userId: "u1", commissionConfig: { mode: "percent", rateBps: 1000, currency: "USD" } }) }, Enrollment: { findOne: () => query(null) }, CommissionLedger: { findOne: async () => null, create: async (value) => Object.assign(ledger, value) }, CrmActivity: { create: async () => { activityCount += 1; } } };
  const row = await ambassadors.createPayout({ workspaceId: "w1", referralAttributionId: "r1", grossAmountMinor: 10000, actorUserId: "owner" }, models); assert.equal(row.commissionAmountMinor, 1000); assert.equal(row.status, "pending");
  models.CommissionLedger.findOne = async () => ledger; await ambassadors.transitionPayout({ workspaceId: "w1", payoutId: "pay1", status: "approved", actorUserId: "owner" }, models); assert.equal(ledger.status, "approved"); await ambassadors.transitionPayout({ workspaceId: "w1", payoutId: "pay1", status: "paid", actorUserId: "owner" }, models); assert.equal(ledger.status, "paid"); assert(ledger.paidAt); assert.equal(activityCount, 3);
}

Promise.resolve().then(schemaAndRbac).then(duplicateEmailLinksProfile).then(invitationActivatesAmbassadorProfile).then(attributionReusesCanonicalContact).then(selfOnlyAndAdminPayout).then(() => console.log("Ambassador invitation lifecycle, duplicate reuse, RBAC, canonical attribution, self-only visibility, and payout controls passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
