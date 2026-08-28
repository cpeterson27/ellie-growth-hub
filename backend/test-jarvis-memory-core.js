const assert = require("assert");
const memoryService = require("./services/jarvisMemoryService");
const knowledgeService = require("./services/knowledgeService");
const conversationService = require("./services/jarvisConversationService");
const captureService = require("./services/jarvisMemoryCaptureService");
const syncAuth = require("./services/jarvisVaultSyncAuthService");
const JarvisConversation = require("./models/JarvisConversation");
const JarvisMemoryNote = require("./models/JarvisMemoryNote");

const workspaceA = "6a69491ceb8b0a51048bd0cd";
const workspaceB = "6a69491ceb8b0a51048bd0ce";

function memoryModel(initial = []) {
  const rows = initial.map((row) => ({ ...row }));
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "path" && value?.$in) return value.$in.includes(row.path);
    if (key === "path" && value?.$nin) return !value.$nin.includes(row.path);
    if (key === "source" && value?.$in) return value.$in.includes(row.source);
    if (key === "category" && value?.$in) return value.$in.includes(row.category);
    return String(row[key]) === String(value);
  });
  return {
    rows,
    find(filter) {
      const result = rows.filter((row) => matches(row, filter));
      return { select() { return this; }, lean: async () => result.map((row) => ({ ...row })) };
    },
    async bulkWrite(operations) {
      for (const { updateOne } of operations) {
        const index = rows.findIndex((row) => matches(row, updateOne.filter));
        if (index >= 0) rows[index] = { ...rows[index], ...updateOne.update.$set };
        else rows.push({ ...updateOne.update.$set });
      }
    },
    async deleteMany(filter) {
      let deletedCount = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index], filter)) { rows.splice(index, 1); deletedCount += 1; }
      return { deletedCount };
    },
    async create(value) { rows.push({ ...value }); return value; },
  };
}

async function run() {
  const env = { JARVIS_MEMORY_SYNC_CREDENTIALS: JSON.stringify({ [workspaceA]: "workspace-a-secret-that-is-long", [workspaceB]: "workspace-b-secret-that-is-long" }) };
  assert.deepEqual(syncAuth.resolveWorkspace({ authorization: "Bearer workspace-a-secret-that-is-long" }, env), { workspaceId: workspaceA, mode: "workspace_bound" });
  assert.equal(syncAuth.resolveWorkspace({ authorization: "Bearer incorrect" }, env), null);
  assert.equal(syncAuth.resolveWorkspace({ authorization: "Bearer workspace-a-secret-that-is-long", workspaceId: workspaceB }, env).workspaceId, workspaceA);
  assert.equal(syncAuth.configuredCredentials({ JARVIS_MEMORY_SYNC_SECRET: "global-secret-that-is-long-enough" }).length, 0);
  assert.equal(syncAuth.configuredCredentials({ JARVIS_MEMORY_SYNC_SECRET: "global-secret-that-is-long-enough", JARVIS_MEMORY_SYNC_WORKSPACE_ID: workspaceA })[0].workspaceId, workspaceA);

  const Model = memoryModel([
    { workspaceId: workspaceA, source: "obsidian_bridge", category: "sops", path: "07 SOPs/old.md", content: "old", contentHash: "old" },
    { workspaceId: workspaceB, source: "obsidian_bridge", category: "sops", path: "07 SOPs/private.md", content: "workspace b private", contentHash: "private" },
    { workspaceId: workspaceA, source: "approved_memory", category: "decisions", path: "08 Decisions/approved.md", content: "keep approved", contentHash: "approved" },
  ]);
  const note = { path: "07 SOPs/sales.md", content: "Always verify operational facts.", updatedAt: "2026-08-27T12:00:00.000Z" };
  const first = await memoryService.syncCloudNotes(workspaceA, [note], { JarvisMemoryNote: Model });
  assert.equal(first.createdOrUpdatedCount, 1);
  assert.equal(first.removedCount, 1);
  assert(Model.rows.some((row) => row.workspaceId === workspaceB && row.path === "07 SOPs/private.md"));
  assert(Model.rows.some((row) => row.workspaceId === workspaceA && row.source === "approved_memory"));
  const repeated = await memoryService.syncCloudNotes(workspaceA, [note], { JarvisMemoryNote: Model });
  assert.equal(repeated.createdOrUpdatedCount, 0);
  assert.equal(repeated.unchangedCount, 1);
  const changed = await memoryService.syncCloudNotes(workspaceA, [{ ...note, content: "Updated approved SOP." }], { JarvisMemoryNote: Model });
  assert.equal(changed.createdOrUpdatedCount, 1);
  assert.equal(Model.rows.find((row) => row.workspaceId === workspaceA && row.path === note.path).content, "Updated approved SOP.");
  await assert.rejects(() => memoryService.syncCloudNotes(workspaceA, [{ path: "01 Inbox/private.md", content: "no" }], { JarvisMemoryNote: Model }), /invalid approved note/);
  await assert.rejects(() => memoryService.syncCloudNotes(workspaceA, [{ path: "../secret.md", content: "no" }], { JarvisMemoryNote: Model }), /invalid approved note/);

  const cloudA = await memoryService.retrieveCloudNotes("updated sop", { workspaceId: workspaceA }, Model);
  assert(cloudA.sources.includes("07 SOPs/sales.md"));
  assert(!cloudA.context.includes("workspace b private"));
  let knowledgeArgs;
  const knowledge = await knowledgeService.retrieveKnowledge({ workspaceId: workspaceA, query: "ICP", agent: "social", categories: ["contacts-icp"], limit: 2 }, { jarvisMemoryService: { async retrieveRelevantNotes(query, options) { knowledgeArgs = { query, options }; return { available: true, sources: ["03 Contacts & ICP/ICP.md"], context: "Approved ICP" }; } } });
  assert.equal(knowledgeArgs.options.workspaceId, workspaceA);
  assert.equal(knowledge.agent, "social");
  assert.equal(knowledge.authority, "approved_business_knowledge");
  assert(knowledge.operationalTruthPolicy.includes("authoritative"));

  const longMessages = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `message-${index}-${"x".repeat(900)}` }));
  const bounded = conversationService.boundedHistory(longMessages);
  assert(bounded.length <= conversationService.HISTORY_MESSAGE_LIMIT);
  assert(bounded.reduce((sum, item) => sum + item.content.length, 0) <= conversationService.HISTORY_CHARACTER_LIMIT);
  const conversation = { _id: "conversation-a", workspaceId: workspaceA, userId: "user-a", archived: false, messages: [{ role: "user", content: "Earlier question" }], async save() { this.saved = true; } };
  const ConversationModel = {
    async findOne(filter) { return filter._id === conversation._id && filter.workspaceId === workspaceA && filter.userId === "user-a" ? conversation : null; },
    async create(value) { return { _id: "new-conversation", ...value, async save() {} }; },
  };
  const resumed = await conversationService.history({ workspaceId: workspaceA, userId: "user-a", conversationId: conversation._id }, ConversationModel);
  assert.equal(resumed.messages[0].content, "Earlier question");
  await conversationService.appendTurn({ workspaceId: workspaceA, userId: "user-a", conversationId: conversation._id, userMessage: "Continue", assistantMessage: "Continued" }, ConversationModel);
  assert.equal(conversation.messages.at(-1).content, "Continued");
  assert.equal(await conversationService.get({ workspaceId: workspaceB, userId: "user-a", conversationId: conversation._id }, ConversationModel), null);
  assert.deepEqual(conversationService.boundedHistory([]), []);

  let approval;
  const ApprovalModel = {
    async create(value) { approval = { _id: "approval-a", ...value, async save() { this.saved = true; } }; return approval; },
    async findOne(filter) { return filter.workspaceId === workspaceA && filter._id === approval?._id && approval.usedAt == null ? approval : null; },
  };
  const prepared = await captureService.prepare({ workspaceId: workspaceA, userId: "owner-a", title: "Approved sales guidance", content: "Use verified facts.", category: "sops" }, { GrowthActionApproval: ApprovalModel });
  assert.equal(prepared.stored, false);
  let savedMemory;
  const confirmed = await captureService.confirm({ workspaceId: workspaceA, userId: "owner-a", approvalId: prepared.id, confirmationPhrase: prepared.confirmationPhrase }, { GrowthActionApproval: ApprovalModel, jarvisMemoryService: { async saveApprovedMemory(value) { savedMemory = value; return { stored: true, source: "growth_operator_cloud_memory", path: "07 SOPs/a.md", synchronizedToObsidian: false }; } } });
  assert.equal(savedMemory.workspaceId, workspaceA);
  assert.equal(savedMemory.category, "sops");
  assert.equal(confirmed.synchronizedToObsidian, false);
  await assert.rejects(() => captureService.confirm({ workspaceId: workspaceB, userId: "owner-b", approvalId: prepared.id, confirmationPhrase: prepared.confirmationPhrase }, { GrowthActionApproval: ApprovalModel, jarvisMemoryService: {} }), (error) => error.code === "MEMORY_APPROVAL_NOT_FOUND");

  for (const schema of [JarvisConversation.schema, JarvisMemoryNote.schema]) {
    const paths = Object.keys(schema.paths);
    for (const forbidden of ["apiKey", "accessToken", "credentials", "syncSecret", "systemPrompt", "providerPayload"]) assert(!paths.includes(forbidden));
    assert(paths.includes("workspaceId"));
  }
  assert(!require("fs").readFileSync(require.resolve("./services/jarvisService"), "utf8").includes("retrieveRelevantNotes(message)"));
  assert(require("fs").readFileSync(require.resolve("./services/jarvisService"), "utf8").includes("retrieveKnowledge"));

  const jarvisService = require("./services/jarvisService");
  const profileService = require("./services/jarvisProfileService");
  const originalKnowledge = knowledgeService.retrieveKnowledge;
  const originalProfile = profileService.getProfile;
  const originalHistory = conversationService.history;
  const originalAppend = conversationService.appendTurn;
  const previousAiFlag = process.env.JARVIS_OPENAI_ENABLED;
  let retrievedWorkspace, appended = 0;
  knowledgeService.retrieveKnowledge = async ({ workspaceId }) => { retrievedWorkspace = workspaceId; return { available: true, sources: ["07 SOPs/sales.md"], context: "Approved SOP" }; };
  profileService.getProfile = async () => ({ name: "Jarvis", responseStyle: "concise" });
  conversationService.history = async () => ({ conversation: { _id: "conversation-a" }, messages: [{ role: "user", content: "Earlier bounded context" }] });
  conversationService.appendTurn = async () => { appended += 1; return { _id: "conversation-a" }; };
  const originalGeneral = jarvisService.handleGeneralQuery;
  jarvisService.handleGeneralQuery = async () => ({ answer: "Verified operational response", data: {}, actionsAvailable: [] });
  process.env.JARVIS_OPENAI_ENABLED = "false";
  try {
    const continued = await jarvisService.processQuery("Continue our plan", { workspaceId: workspaceA, userId: "user-a", conversationId: "conversation-a" });
    assert.equal(retrievedWorkspace, workspaceA);
    assert.equal(continued.conversationId, "conversation-a");
    assert.equal(appended, 1);
    const legacy = await jarvisService.processQuery("A standalone question", { workspaceId: workspaceA, userId: "user-a" });
    assert.equal(legacy.answer, "Verified operational response");
    assert.equal(appended, 1);
  } finally {
    knowledgeService.retrieveKnowledge = originalKnowledge;
    profileService.getProfile = originalProfile;
    conversationService.history = originalHistory;
    conversationService.appendTurn = originalAppend;
    jarvisService.handleGeneralQuery = originalGeneral;
    if (previousAiFlag === undefined) delete process.env.JARVIS_OPENAI_ENABLED; else process.env.JARVIS_OPENAI_ENABLED = previousAiFlag;
  }
  console.log("Jarvis workspace memory, conversation, sync security, and approval tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
