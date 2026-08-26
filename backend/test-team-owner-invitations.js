const assert = require("node:assert/strict");
const service = require("./services/workspaceMemberService");
const { validateMembershipChange } = require("./authorization/capabilities");
const query = value => ({ select() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const doc = values => ({ ...values, save: async function () { return this; } });
async function run() {
  let actorRole = "owner", writes = 0, sent = 0, membership, invitation;
  const user = doc({ _id: "ellie", name: "Ellie", email: "ellie@example.test" });
  const models = {
    User: { findOne: async () => user, findById: () => query(user) },
    Workspace: { findById: () => query({ name: "Existing Ellie workspace" }) },
    WorkspaceMembership: {
      findOne: async filter => {
        if (filter.userId === "actor") return filter.workspaceId === "existing" ? doc({ roles: [actorRole], role: actorRole, status: "active" }) : null;
        if (filter.workspaceId !== "existing") return null;
        return membership || null;
      },
      findOneAndUpdate: async (filter, update) => { writes++; assert.equal(filter.workspaceId, "existing"); membership = doc({ ...filter, ...update.$set }); return membership; },
    },
    WorkspaceInvitation: {
      findOneAndUpdate: async (filter, update) => { assert.equal(filter.workspaceId, "existing"); invitation = doc({ _id: "invite", ...filter, ...update.$set }); return invitation; },
      findOne: filter => query(filter.tokenHash ? filter.tokenHash === invitation.tokenHash && invitation.status === "pending" ? invitation : null : filter.workspaceId === "existing" ? invitation : null),
    },
    integrationHub: { execute: async () => { sent++; } },
  };
  const input = { workspaceId: "existing", actorUserId: "actor", roles: ["owner"], name: "Ellie", email: user.email };
  for (const role of ["admin", "coach", "closer", "ambassador", "member", "viewer"]) {
    actorRole = role;
    await assert.rejects(service.inviteMember(input, models), error => error.code === "OWNER_ESCALATION_BLOCKED");
  }
  assert.equal(writes, 0);
  actorRole = "owner";
  await assert.rejects(service.inviteMember({ ...input, workspaceId: "foreign" }, models), /Only an active/);
  const result = await service.inviteMember(input, models);
  assert.deepEqual(result.membership.roles, ["owner"]); assert.equal(result.membership.status, "invited");
  assert.equal(sent, 0); assert.notEqual(invitation.tokenHash, result.invitationToken);
  actorRole = "admin";
  await assert.rejects(service.sendInvitation({ workspaceId: "existing", actorUserId: "actor", invitationId: "invite" }, models), /Only an active/);
  assert.equal(sent, 0);
  actorRole = "owner";
  const delivery = await service.sendInvitation({ workspaceId: "existing", actorUserId: "actor", invitationId: "invite" }, models);
  assert.equal(sent, 1, "Only a mocked provider is used");
  const token = new URL(delivery.acceptUrl).pathname.split("/").at(-1);
  const accepted = await service.acceptInvitation({ token, password: "Local-fixture-password-123", name: "Ellie" }, models);
  assert.equal(accepted.workspaceId, "existing"); assert.equal(membership.status, "active"); assert.deepEqual(membership.roles, ["owner"]);
  await assert.rejects(service.acceptInvitation({ token, password: "unused" }, models), /invalid or has expired/);
  assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["member"], actorRoles: ["owner"], activeOwnerCount: 1 }), /last active/);
  assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["owner"], actorRoles: ["admin"] }), /Only an owner/);
  console.log("Owner invitation, non-owner denial, same-workspace activation, secure single-use token, resend authorization and owner protection passed (mocked).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
