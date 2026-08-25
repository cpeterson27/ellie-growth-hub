const assert = require("node:assert/strict");
const templates = require("./services/invitationTemplateService");

async function run() {
  assert.deepEqual(Object.keys(templates.defaults), ["coach", "ambassador", "closer", "general"]);
  for (const template of Object.values(templates.defaults)) {
    assert(template.subject.length > 5); assert(template.body.includes("{{inviteLink}}"));
  }
  const rendered = templates.render(templates.defaults.coach, { firstName: "Ada", displayName: "Ada Lovelace", role: "Coach", workspaceName: "Ellie", inviteLink: "https://example.test/secure", invitedBy: "Owner" });
  assert(rendered.subject.includes("Ellie")); assert(rendered.body.includes("Ada")); assert(rendered.body.includes("https://example.test/secure")); assert(!rendered.body.includes("{{"));
  assert.equal(templates.roleKey(["ambassador", "member"]), "ambassador"); assert.equal(templates.roleKey(["closer"]), "closer"); assert.equal(templates.roleKey(["viewer"]), "general");
  await assert.rejects(() => templates.save({ workspaceId: "w1", roleKey: "owner", subject: "x", body: "y", actorUserId: "u1" }), /Valid invitation role/);
  console.log("Workspace invitation defaults, role selection, variables, and validation checks passed.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
