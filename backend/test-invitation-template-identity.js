const assert = require("node:assert/strict");
const templates = require("./services/invitationTemplateService");

const query = (value) => ({ select() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

async function run() {
  const configs = { ellie: { workspaceName: "Ellie’s Coaching", invitationIdentity: { senderName: "Cassandra Peterson", replyToEmail: "hello@example.test" } }, review: { workspaceName: "Meta App Review", invitationIdentity: {} } };
  const variableModels = { WorkspaceConfig: { findOne: ({ workspaceId }) => query(configs[workspaceId] || null) }, User: { findById: () => query({ name: "Authenticated Owner" }) } };
  const ellie = await templates.variables({ workspaceId: "ellie", name: "Jordan Taylor", roles: ["coach"], inviteLink: "https://example.test/invite/unique", invitedByUserId: "owner" }, variableModels);
  const review = await templates.variables({ workspaceId: "review", name: "Alex Reviewer", roles: ["admin"], inviteLink: "https://example.test/invite/review", invitedByUserId: "owner" }, variableModels);
  assert.equal(ellie.workspaceName, "Ellie’s Coaching");
  assert.equal(ellie.invitedBy, "Cassandra Peterson");
  assert.equal(ellie.replyToEmail, "hello@example.test");
  assert.equal(review.workspaceName, "Meta App Review");
  assert.notEqual(review.workspaceName, ellie.workspaceName, "workspace identity remains isolated");

  const bracketTemplate = { subject: "Join [Business name]", body: "Hi [First name]\n[Secure invitation button]\nFrom [Invited by]" };
  const rendered = templates.render(bracketTemplate, ellie);
  assert.equal(rendered.subject, "Join Ellie’s Coaching");
  assert(rendered.body.includes("Jordan"));
  assert(rendered.body.includes("https://example.test/invite/unique"));
  assert(rendered.html.includes("<a href=\"https://example.test/invite/unique\""));
  assert(rendered.html.includes(">Accept invitation</a>"));
  assert(!rendered.html.includes("[Secure invitation button]"));

  const legacy = templates.render(templates.defaults.coach, ellie);
  assert(legacy.subject.includes("Ellie’s Coaching"));
  assert(!legacy.body.includes("{{"), "existing moustache templates remain compatible");

  const saved = [];
  const templateModels = { InvitationTemplate: {
    findOne: ({ workspaceId, roleKey }) => query(saved.find((row) => row.workspaceId === workspaceId && row.roleKey === roleKey) || null),
    findOneAndUpdate: async (filter, update) => { const row = { ...filter, ...update.$set }; saved.push(row); return row; },
  } };
  await templates.save({ workspaceId: "ellie", roleKey: "coach", subject: bracketTemplate.subject, body: bracketTemplate.body, actorUserId: "owner" }, templateModels);
  assert.equal(saved[0].body, bracketTemplate.body, "sample preview values are never persisted");
  assert(!saved[0].body.includes("Jordan"));
  assert.equal(saved[0].workspaceId, "ellie");

  await assert.rejects(templates.variables({ workspaceId: "missing", name: "Jordan", roles: ["coach"], inviteLink: "x", invitedByUserId: "owner" }, variableModels), (error) => error.code === "INVITATION_BUSINESS_NAME_REQUIRED" && error.message.includes("Organization Profile"));
  console.log("Workspace invitation identity, persistence, recipient rendering, secure button, missing-name validation, isolation, and legacy compatibility passed.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
