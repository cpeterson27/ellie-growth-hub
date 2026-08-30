const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.META_APP_ID = "2045149436121955";
process.env.META_APP_SECRET = "fixture-secret";
process.env.META_REDIRECT_URI = "https://backend.example.test/api/social/meta/oauth/callback";
process.env.FACEBOOK_LOGIN_CONFIG_ID = "1975661086479076";
process.env.META_GRAPH_API_VERSION = "v26.0";

const provisioning = require("./services/workspaceProvisioningService");
const authRoutes = require("./routes/auth");
const workspaceMembers = require("./services/workspaceMemberService");
const socialOAuth = require("./services/socialOAuthService");
const { createAuthContext, isPlatformOwner } = require("./middleware/auth");
const { CAPABILITIES, effectivePermissions } = require("./authorization/capabilities");

function doc(values) { return { ...values, async save() { return this; } }; }
function query(value) { return { select() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }

async function atomicProvisioning() {
  const transactionSession = { ended: false, async withTransaction(callback) { await callback(); }, async endSession() { this.ended = true; } };
  let workspaceOptions, membershipOptions, membershipValues;
  const workspace = { _id: "review-workspace", name: "Meta App Review", slug: "meta-app-review", status: "active", billingStatus: "setup" };
  const result = await provisioning.createWorkspace({ name: " Meta App Review ", slug: "Meta App Review", ownerUserId: "platform-owner" }, {
    mongoose: { startSession: async () => transactionSession },
    Workspace: { create: async (values, options) => { workspaceOptions = options; assert.equal(values.length, 1); return [workspace]; } },
    WorkspaceMembership: { create: async (values, options) => { membershipValues = values[0]; membershipOptions = options; } },
  });
  assert.equal(result._id, "review-workspace");
  assert.equal(workspaceOptions.session, transactionSession); assert.equal(membershipOptions.session, transactionSession);
  assert.deepEqual(membershipValues.roles, ["owner"]); assert.equal(membershipValues.workspaceId, "review-workspace"); assert.equal(membershipValues.userId, "platform-owner");
  assert.equal(transactionSession.ended, true);
  assert.deepEqual(Object.keys(workspace).sort(), ["_id", "billingStatus", "name", "slug", "status"], "new workspace contains no copied customer/provider configuration");
}

function deterministicLoginSelection() {
  const ellie = { _id: "membership-ellie", workspaceId: { _id: "ellie", name: "Ellie", slug: "ellie" }, role: "owner", roles: ["owner"] };
  const review = { _id: "membership-review", workspaceId: { _id: "review", name: "Meta App Review", slug: "meta-app-review" }, role: "admin", roles: ["admin"], permissionOverrides: { deny: ["crm.view"] } };
  assert.equal(authRoutes.selectLoginMembership([ellie]).workspaceId._id, "ellie", "single-workspace login remains unchanged");
  assert.throws(() => authRoutes.selectLoginMembership([ellie, review]), error => error.code === "WORKSPACE_SELECTION_REQUIRED" && error.workspaces.length === 2);
  assert.equal(authRoutes.selectLoginMembership([ellie, review], "review"), review, "explicit workspace is selected");
  assert.deepEqual(authRoutes.selectLoginMembership([ellie, review], "review").permissionOverrides, { deny: ["crm.view"] }, "membership overrides are preserved");
  assert.throws(() => authRoutes.selectLoginMembership([review], "ellie"), error => error.code === "WORKSPACE_FORBIDDEN");
}

async function secureSessionRotation() {
  let capturedFilter, capturedUpdate;
  const SessionModel = { findOneAndUpdate(filter, update) { capturedFilter = filter; capturedUpdate = update; return query({ _id: "session", ...update.$set }); } };
  const first = await authRoutes.rotateSession({ req: { headers: { "user-agent": "fixture" } }, sessionId: "session", userId: "reviewer", workspaceId: "review" }, SessionModel);
  const second = await authRoutes.rotateSession({ req: { headers: {} }, sessionId: "session", userId: "reviewer", workspaceId: "review" }, SessionModel);
  assert.deepEqual(capturedFilter, { _id: "session", userId: "reviewer" });
  assert.equal(capturedUpdate.$set.workspaceId, "review");
  assert.notEqual(first.token, second.token); assert.notEqual(first.csrfToken, second.csrfToken);
  assert.equal(first.token.length >= 40, true); assert.equal(first.session.workspaceId, "review");
}

async function existingUserPasswordIsPreserved() {
  const originalHash = "existing-password-hash";
  const invitation = doc({ _id: "invite", workspaceId: "review", userId: "reviewer", name: "Meta Reviewer", email: "cpeterson.dev+meta@gmail.com", roles: ["admin"], status: "pending", expiresAt: new Date(Date.now() + 60000), requiresAccountActivation: false });
  const user = doc({ _id: "reviewer", name: "Meta Reviewer", email: invitation.email, passwordHash: originalHash, status: "active" });
  const membership = doc({ _id: "review-membership", workspaceId: "review", userId: user._id, role: "admin", roles: ["admin"], status: "invited", permissionOverrides: { deny: ["crm.view"] } });
  await workspaceMembers.acceptInvitation({ token: "fixture", password: "must-not-replace-existing", name: user.name }, {
    WorkspaceInvitation: { findOne: () => query(invitation) },
    User: { findById: () => query(user) },
    WorkspaceMembership: { findOne: async () => membership, exists: async () => ({ _id: "ellie-membership" }) },
    CoachProfile: {}, AmbassadorProfile: {}, CrmActivity: { create: async () => ({}) },
  });
  assert.equal(user.passwordHash, originalHash); assert.equal(membership.status, "active"); assert.deepEqual(membership.permissionOverrides, { deny: ["crm.view"] });
}

function reviewerIsNotPlatformOwner() {
  const previous = process.env.PLATFORM_OWNER_EMAILS;
  process.env.PLATFORM_OWNER_EMAILS = "cassandra@example.test";
  const auth = createAuthContext({ user: { _id: "reviewer", email: "cpeterson.dev+meta@gmail.com" }, workspace: { _id: "review" }, membership: { role: "admin", roles: ["admin"] }, session: {} });
  assert.equal(auth.isPlatformOwner, false);
  process.env.PLATFORM_OWNER_EMAILS = previous;
}

function platformOwnerEmailNormalization() {
  const previous = process.env.PLATFORM_OWNER_EMAILS;
  process.env.PLATFORM_OWNER_EMAILS = " first@example.test,  Cassandra@Example.Test ,third@example.test ";
  assert.equal(isPlatformOwner({ email: "cassandra@example.test" }), true);
  assert.equal(isPlatformOwner({ email: " CASSANDRA@EXAMPLE.TEST " }), true);
  assert.equal(isPlatformOwner({ email: "reviewer@example.test" }), false);
  process.env.PLATFORM_OWNER_EMAILS = previous;
}

function minimumReviewerPermissions() {
  const workspace = { _id: "review", status: "active" };
  const reviewer = { role: "viewer", roles: ["viewer"], permissionOverrides: { allow: ["social.manage"], deny: CAPABILITIES.filter((item) => item !== "social.manage") } };
  assert.deepEqual(effectivePermissions(reviewer, workspace), ["social.manage"]);
  for (const forbidden of ["crm.view", "sales.opportunities.view", "coaching.view", "team.view", "team.manage", "ambassadors.view", "workspace.manage", "integrations.manage", "communications.view", "campaigns.manage", "analytics.view"]) assert.equal(effectivePermissions(reviewer, workspace).includes(forbidden), false, forbidden);
}

function oauthBindsSelectedWorkspace() {
  const url = new URL(socialOAuth.authorizationUrl("meta", { workspaceId: "review", user: { _id: "reviewer" } }));
  const state = socialOAuth.verifyState(url.searchParams.get("state"), "meta");
  assert.equal(state.workspaceId, "review"); assert.equal(state.userId, "reviewer");
}

Promise.resolve()
  .then(atomicProvisioning)
  .then(deterministicLoginSelection)
  .then(secureSessionRotation)
  .then(existingUserPasswordIsPreserved)
  .then(reviewerIsNotPlatformOwner)
  .then(platformOwnerEmailNormalization)
  .then(minimumReviewerPermissions)
  .then(oauthBindsSelectedWorkspace)
  .then(() => console.log("Workspace atomic provisioning, deterministic selection, secure session rotation, invitation password safety, platform isolation, and OAuth workspace binding passed."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
