const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

function includesAll(contents, expectations, label) {
  for (const expectation of expectations) assert(contents.includes(expectation), `${label} is missing contract: ${expectation}`);
}

const activityModel = source("models/CrmActivity.js");
includesAll(activityModel, [
  'collection: "crm_activities"',
  'type: String, enum: ["", "inbound", "outbound"]',
  '"note", "call", "meeting", "task", "status_change", "email", "campaign", "research", "system"',
  "contactId:", "organizationId:", "campaignId:", "dueAt:", "completedAt:", "workspacePlugin",
], "CRM activity model");

const opportunityModel = source("models/SalesOpportunity.js");
includesAll(opportunityModel, [
  'collection: "sales_opportunities"', "stageKey:", "organizationId:", "primaryContactId:", "ownerId:",
  "value:", "probability:", "expectedCloseAt:", "nextAction:", "nextActionAt:", "wonAt:", "lostAt:", "lostReason:", "workspacePlugin",
], "Sales opportunity model");

const stageModel = source("models/PipelineStage.js");
includesAll(stageModel, ['collection: "pipeline_stages"', "key:", "label:", "order:", "probability:", "terminal:", "workspacePlugin"], "Pipeline stage model");

const activityRoutes = source("routes/activities.js");
includesAll(activityRoutes, [
  'router.get("/tasks"', 'router.patch("/tasks/:origin/:id/complete"', 'router.get("/"', 'router.post("/"',
  'type: "task"', "completedAt", 'source: "manual"', "req.auth?.userId",
], "Activity API");

const opportunityRoutes = source("routes/opportunities.js");
includesAll(opportunityRoutes, [
  'router.get("/stages"', 'router.put("/stages"', 'router.get("/"', 'router.post("/"', 'router.patch("/:id"',
  'terminal: "won"', 'terminal: "lost"', "A loss reason is required", 'title: "Opportunity stage changed"',
], "Opportunity API");

const server = source("server.js");
includesAll(server, ['app.use("/api/activities", activitiesRouter)', 'app.use("/api/opportunities", opportunitiesRouter)'], "Authenticated API mounting");

const conversationThreadModel = source("models/ConversationThread.js");
includesAll(conversationThreadModel, [
  'collection: "conversation_threads"', "providerThreadId", "participants", "assignedTo", "snoozedUntil",
  "firstResponseDueAt", "nextResponseDueAt", "breachedAt", "attachments", "draft", "workspacePlugin",
], "Conversation thread model");

const conversationMessageModel = source("models/ConversationMessage.js");
includesAll(conversationMessageModel, [
  'collection: "conversation_messages"', "threadId", "providerMessageId", 'enum: ["inbound", "outbound", "internal"]',
  'enum: ["message", "note", "status", "assignment", "system"]', "attachments", "deliveryStatus", "workspacePlugin",
], "Conversation message model");

const conversationMailboxModel = source("models/ConversationMailbox.js");
includesAll(conversationMailboxModel, [
  'collection: "conversation_mailboxes"', '"gmail", "microsoft", "imap", "website_chat", "whatsapp", "facebook", "instagram", "linkedin_manual"', "shared", "assignmentMode",
  "defaultAssignee", "signature", "trackingPreferences", "templates", "lastSyncedAt", "workspacePlugin",
], "Shared conversation mailbox model");

const conversationRoutes = source("routes/conversations.js");
includesAll(conversationRoutes, [
  'router.get("/"', 'router.get("/:id"', 'router.patch("/:id"', 'router.put("/:id/draft"', 'router.post("/:id/notes"',
  'router.get("/mailboxes"', 'router.patch("/mailboxes/:id"', 'req.body.status === "snoozed"', "markRead", 'direction: "internal"',
], "Conversation architecture API");

const channelAdapters = source("services/conversations/channelAdapters.js");
includesAll(channelAdapters, ["ConversationChannelAdapter", "syncThreads", "fetchThread", "sendMessage", "saveDraft", "registerConversationAdapter"], "Conversation channel adapter contract");

const conversationIngestion = source("services/conversations/conversationIngestionService.js");
includesAll(conversationIngestion, [
  "ingestProviderMessage", "providerThreadId", "providerMessageId", "existingMessage", "$setOnInsert",
  'message.direction === "inbound"', "unreadCount", "lastInboundAt", "lastOutboundAt",
], "Idempotent conversation ingestion");

const gmailConversationAdapter = source("services/conversations/gmailConversationAdapter.js");
includesAll(gmailConversationAdapter, [
  "GmailConversationAdapter", "syncGmailThread", "ensureMailbox", "matchContacts", "ingestProviderMessage",
  'super("email", "gmail")', "gmailLabels", "mailboxAddress",
], "Gmail canonical conversation adapter");

const gmailRoutes = source("routes/gmail.js");
includesAll(gmailRoutes, [
  'router.post("/sync"', "gmailConversationAdapter.syncThreads", "canonicalThreadId", "syncGmailThread",
  "ConversationThread.updateOne",
], "Gmail canonical synchronization API");

includesAll(server, ['app.use("/api/conversations", conversationsRouter)'], "Authenticated conversation API mounting");

const companyCanonicalization = source("services/companyCanonicalizationService.js");
includesAll(companyCanonicalization, [
  "organizationId: null", "normalizedName", "companiesToCreate", "contactsLinked",
  "findOneAndUpdate", "$setOnInsert", "Contact.updateMany", "apply = false",
], "Contact company canonicalization");

const organizationModel = source("models/Organization.js");
includesAll(organizationModel, ["default: undefined", "legacy sparse unique index"], "Domain-less company persistence");

const organizationRoutes = source("routes/organizationRelationships.js");
includesAll(organizationRoutes, ['router.post("/canonicalize-contacts"', "req.body?.apply === true"], "Company canonicalization API");

const { companyKey, normalizeCompanyName, profileFromContacts } = require("./services/companyCanonicalizationService");
assert.equal(normalizeCompanyName("  Ellie   AI  "), "Ellie AI");
assert.equal(companyKey("ÉLLIE AI"), companyKey("éllie  ai"));
assert.deepEqual(
  profileFromContacts("Acme", [{ industry: "Real Estate", companyCity: "Austin", companyState: "TX" }]),
  {
    name: "Acme", normalizedName: "acme", source: "legacy", website: "", industry: "Real Estate",
    location: "Austin, TX", linkedinUrl: "", phone: "", employeeCount: null,
    externalSources: { crmCompanyText: true },
  },
);

console.log("CRM core dependency-free contracts passed: activities, tasks, stages, opportunities, tenancy, and API mounting.");
