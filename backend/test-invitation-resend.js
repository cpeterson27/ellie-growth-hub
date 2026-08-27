const assert = require("node:assert/strict");
const service = require("./services/workspaceMemberService");

const query = (value) => ({ select() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const doc = (values) => ({ ...values, deliveryHistory: [], async save() { return this; } });

async function run() {
  const invitation = doc({ _id: "invite-1", workspaceId: "workspace-1", userId: "user-1", email: "pending@example.test", name: "Pending Person", roles: ["member"], roleKey: "general", subject: "Join {{workspaceName}}", body: "Hi {{firstName}}\n{{inviteLink}}", tokenHash: "original-hash", status: "pending", deliveryStatus: "sent", expiresAt: new Date(Date.now() + 60_000), invitedBy: "owner-1" });
  const membership = doc({ workspaceId: "workspace-1", userId: "user-1", roles: ["member"], role: "member", status: "invited" });
  const user = doc({ _id: "user-1", name: "Pending Person", email: invitation.email, status: "invited" });
  let providerCalls = 0;
  let providerFailure = false;
  const models = {
    WorkspaceInvitation: { findOne: (filter) => query(filter.tokenHash ? filter.tokenHash === invitation.tokenHash && invitation.status === "pending" && invitation.expiresAt > new Date() ? invitation : null : filter.workspaceId === invitation.workspaceId ? invitation : null) },
    Workspace: { findById: () => query({ name: "Fixture Workspace" }) },
    User: { findById: () => query(user) },
    WorkspaceMembership: { findOne: async () => membership },
    CoachProfile: { findOneAndUpdate: async () => null }, AmbassadorProfile: { findOneAndUpdate: async () => null },
    CrmActivity: { create: async () => ({}) },
    integrationHub: { execute: async () => { providerCalls += 1; if (providerFailure) throw new Error("mock provider unavailable"); return { messageId: `mock-${providerCalls}` }; } },
  };

  const first = await service.sendInvitation({ workspaceId: "workspace-1", invitationId: "invite-1", actorUserId: "owner-1" }, models);
  const firstHash = invitation.tokenHash;
  assert.equal(first.deliveryStatus, "sent"); assert.equal(providerCalls, 1);

  const second = await service.sendInvitation({ workspaceId: "workspace-1", invitationId: "invite-1", actorUserId: "owner-1" }, models);
  assert.equal(second.deliveryStatus, "sent"); assert.equal(providerCalls, 2); assert.notEqual(invitation.tokenHash, firstHash, "an intentional later resend gets a fresh token");

  invitation.expiresAt = new Date(Date.now() - 60_000);
  const refreshed = await service.sendInvitation({ workspaceId: "workspace-1", invitationId: "invite-1", actorUserId: "owner-1" }, models);
  assert(invitation.expiresAt > new Date());
  const refreshedToken = new URL(refreshed.acceptUrl).pathname.split("/").at(-1);
  await service.acceptInvitation({ token: refreshedToken, password: "fixture-password-123", name: "Pending Person" }, models);
  assert.equal(invitation.status, "accepted", "the refreshed invitation link remains usable");

  invitation.status = "pending"; membership.status = "invited"; invitation.tokenHash = "known-good-hash"; invitation.expiresAt = new Date(Date.now() + 60_000); providerFailure = true;
  await assert.rejects(service.sendInvitation({ workspaceId: "workspace-1", invitationId: "invite-1", actorUserId: "owner-1" }, models), (error) => error.code === "INVITATION_DELIVERY_FAILED" && !error.message.includes("mock provider"));
  assert.equal(invitation.tokenHash, "known-good-hash", "a provider failure does not invalidate the previously delivered link");
  assert.equal(invitation.deliveryStatus, "failed");
  console.log("Repeated resend, fresh expired token, usable acceptance, and provider-failure behavior passed with mocked email delivery.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
