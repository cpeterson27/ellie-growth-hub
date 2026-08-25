const assert = require("assert");
const Contact = require("./models/Contact");
const User = require("./models/User");
const { runWithWorkspace } = require("./tenancy/workspaceContext");
const { scopeWorkspaceUpdate } = require("./tenancy/workspacePlugin");

const workspaceId = "6a69491ceb8b0a51048bd0cd";
const otherWorkspaceId = "6a69491ceb8b0a51048bd0ce";

async function runPre(_model, _operation, query) {
  query.model.db.config.bufferCommands = false;
  await query.exec().catch(() => {});
}

async function main() {
  const upsert = scopeWorkspaceUpdate({ $setOnInsert: { workspaceId: otherWorkspaceId, name: "New" }, $set: { score: 75 } }, workspaceId);
  assert.strictEqual(String(upsert.$setOnInsert.workspaceId), workspaceId, "upsert ownership must be normalized");
  assert.strictEqual(upsert.$set.workspaceId, undefined, "workspaceId cannot be placed in both $set and $setOnInsert");
  assert.strictEqual(User.schema.path("workspaceId"), undefined, "global users must remain global");
  assert(Contact.schema.path("workspaceId"), "contacts must be workspace-owned");

  const unscoped = Contact.find({ name: "Example" });
  await runPre(Contact, "find", unscoped);
  assert.strictEqual(unscoped.getFilter().workspaceId, undefined, "background work requires an explicit workspace");

  await runWithWorkspace(workspaceId, async () => {
    const read = Contact.find({ name: "Example", workspaceId: otherWorkspaceId });
    await runPre(Contact, "find", read);
    assert.strictEqual(String(read.getFilter().workspaceId), workspaceId, "request scope must override caller input");

    const update = Contact.updateOne(
      { _id: "6a69491ceb8b0a51048bd0cf", workspaceId: otherWorkspaceId },
      { $set: { name: "Changed", workspaceId: otherWorkspaceId } },
    );
    await runPre(Contact, "updateOne", update);
    assert.strictEqual(String(update.getFilter().workspaceId), workspaceId, "updates must target the active workspace");
    assert.strictEqual(String(update.getUpdate().$set.workspaceId), workspaceId, "updates cannot transfer ownership");

    const contact = new Contact({ name: "New lead", workspaceId: otherWorkspaceId });
    await contact.validate();
    assert.strictEqual(String(contact.workspaceId), workspaceId, "new documents must inherit the active workspace");
  });

  console.log("Workspace isolation security checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
