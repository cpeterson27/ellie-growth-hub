const assert = require("node:assert/strict");
const { notify, recipients } = require("./services/applicationNotificationService");

function query(value) { return { select() { return this; }, lean: async () => value }; }

(async () => {
  const memberships = [{ userId: "closer" }, { userId: "operations" }, { userId: "owner" }];
  const models = {
    WorkspaceMembership: { find: (filter) => query(filter.userId?.$in ? memberships.filter((row) => filter.userId.$in.includes(row.userId)) : [{ userId: "owner" }]) },
  };
  assert.deepEqual(await recipients({ workspaceId: "workspace", assignedUserId: "closer", configuredUserIds: ["operations", "closer"] }, models), ["closer", "operations"], "assigned and configured recipients must be deduplicated");
  assert.deepEqual(await recipients({ workspaceId: "workspace" }, models), ["owner"], "owner/admin fallback must be used when nobody is configured or assigned");

  const writes = [];
  await notify({ workspaceId: "workspace", application: { _id: "application", assignedUserId: "closer" }, contact: { _id: "contact", name: "Applicant" }, program: { name: "Program" }, config: { publicApplication: { notificationRecipientUserIds: ["closer", "operations"] } }, attribution: { provider: "instagram" } }, {
    ...models,
    InAppNotification: { findOneAndUpdate: async (filter, update) => { writes.push({ filter, update }); return update.$setOnInsert; } },
  });
  assert.equal(writes.length, 2);
  assert(writes.every((row) => row.filter.eventKey === "coaching-application:application"));
  assert(writes.every((row) => row.update.$setOnInsert.actionUrl.includes("contact")));
  assert(writes.every((row) => row.update.$setOnInsert.title.includes("Program")));
  console.log("Application notification recipient deduplication, fallback, program/source content and idempotent event keys passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
