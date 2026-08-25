const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const service = require("./services/workspaceMemberService");
const { validateMembershipChange } = require("./authorization/capabilities");

function query(value) { return { select() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
function doc(value) { return { ...value, async save() { this.saved = true; return this; }, toObject() { return { ...this }; } }; }

async function existingUserIsReused() {
  const membership = doc({ _id: "m1", workspaceId: "w1", userId: "u1", role: "member", roles: ["member"], status: "active", responsibilities: {} });
  let createdUsers = 0, invitationWrites = 0;
  const models = {
    User: { findOne: async () => ({ _id: "u1", name: "Ada", email: "ada@example.com" }), create: async () => { createdUsers += 1; } },
    WorkspaceMembership: { findOne: async () => membership },
    WorkspaceInvitation: { findOneAndUpdate: async () => { invitationWrites += 1; } },
    Workspace: {}, integrationHub: {},
    CoachingProgram: { find: () => query([{ _id: "p1" }]) },
    CoachProfile: { findOneAndUpdate: async (_filter, update) => ({ _id: "c1", ...update.$set }) },
  };
  const result = await service.onboardCoach({ workspaceId: "w1", actorUserId: "owner1", name: "Ada", email: " ADA@example.com ", timezone: "UTC", capacity: 10, programIds: ["p1"] }, models);
  assert.equal(createdUsers, 0); assert.equal(invitationWrites, 0); assert.equal(result.alreadyActive, true);
  assert.deepEqual(membership.roles, ["member", "coach"]); assert.equal(result.coachProfile.status, "active");
  assert.deepEqual(membership.responsibilities.programIds, ["p1"]);
}

async function invitationCreatesInactiveProfileWithoutRealEmail() {
  const membership = doc({ _id: "m2", workspaceId: "w1", userId: "u2", role: "coach", roles: ["coach"], status: "invited", responsibilities: {} });
  const invitation = doc({ _id: "i1", workspaceId: "w1", userId: "u2", email: "new@example.com", name: "New Coach", roles: ["coach"], roleKey: "coach", subject: "Welcome {{firstName}}", body: "Join {{workspaceName}}: {{inviteLink}}", expiresAt: new Date(), status: "ready", deliveryStatus: "pending", invitedBy: "owner1" });
  let providerCalls = 0;
  const models = {
    User: { findOne: async () => null, create: async () => ({ _id: "u2", name: "New Coach", email: "new@example.com" }), findById: () => query({ name: "Owner" }) },
    WorkspaceMembership: { findOne: async () => null, findOneAndUpdate: async () => membership },
    WorkspaceInvitation: { findOneAndUpdate: async () => invitation },
    Workspace: { findById: () => query({ name: "Fixture Workspace" }) },
    integrationHub: { execute: async () => { providerCalls += 1; return { messageId: "mock-only" }; } },
    CoachingProgram: { find: () => query([]) },
    CoachProfile: { findOneAndUpdate: async (_filter, update) => ({ _id: "c2", ...update.$set }) },
  };
  const result = await service.onboardCoach({ workspaceId: "w1", actorUserId: "owner1", name: "New Coach", email: "new@example.com", programIds: [] }, models);
  assert.equal(providerCalls, 0, "creating the draft never sends email"); assert.equal(invitation.deliveryStatus, "pending");
  assert.equal(result.membership.status, "invited"); assert.equal(result.coachProfile.status, "inactive");
  const delivery = await service.sendInvitation({ workspaceId: "w1", invitationId: "i1" }, { ...models, WorkspaceInvitation: { ...models.WorkspaceInvitation, findOne: async () => invitation } });
  assert.equal(delivery.deliveryStatus, "sent"); assert.equal(providerCalls, 1, "explicit send uses only the mocked provider"); assert.equal(invitation.status, "pending"); assert(invitation.renderedBody.includes("Fixture Workspace"));
}

async function crossWorkspaceProgramsFailClosed() {
  await assert.rejects(() => service.onboardCoach({ workspaceId: "w1", actorUserId: "owner1", name: "Coach", email: "coach@example.com", programIds: ["foreign"] }, { CoachingProgram: { find: () => query([]) } }), (error) => error.code === "PROGRAM_WORKSPACE_MISMATCH");
}

async function invitationAcceptanceActivatesCoach() {
  const token = crypto.randomBytes(32).toString("base64url");
  const invitation = doc({ workspaceId: "w1", userId: "u1", name: "Coach", status: "pending" });
  const user = doc({ _id: "u1", name: "Coach", email: "coach@example.com", status: "active" });
  const membership = doc({ workspaceId: "w1", userId: "u1", role: "coach", roles: ["coach"], status: "invited" });
  let profileStatus = "inactive";
  await service.acceptInvitation({ token, password: "a-secure-password", name: "Coach Name" }, {
    WorkspaceInvitation: { findOne: () => query(invitation) }, User: { findById: () => query(user) }, WorkspaceMembership: { findOne: async () => membership },
    CoachProfile: { findOneAndUpdate: async (_filter, update) => { profileStatus = update.$set.status; } },
  });
  assert.equal(membership.status, "active"); assert.equal(invitation.status, "accepted"); assert.equal(profileStatus, "active"); assert.equal(user.name, "Coach Name");
}

function roleSafety() {
  assert.throws(() => validateMembershipChange({ currentRoles: ["admin"], requestedRoles: ["owner"], actorRoles: ["admin"], activeOwnerCount: 1 }), (error) => error.code === "OWNER_ESCALATION_BLOCKED");
  assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["admin"], actorRoles: ["owner"], activeOwnerCount: 1 }), (error) => error.code === "OWNER_LOCKOUT_BLOCKED");
  assert.doesNotThrow(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["admin"], actorRoles: ["owner"], activeOwnerCount: 2 }));
  assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["owner"], requestedStatus: "suspended", self: true, actorRoles: ["owner"], activeOwnerCount: 2 }), (error) => error.code === "OWNER_LOCKOUT_BLOCKED");
}

Promise.resolve().then(existingUserIsReused).then(invitationCreatesInactiveProfileWithoutRealEmail).then(crossWorkspaceProgramsFailClosed).then(invitationAcceptanceActivatesCoach).then(roleSafety).then(() => console.log("Coach invitation, profile linkage, workspace validation, duplicate reuse, and owner safety checks passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
