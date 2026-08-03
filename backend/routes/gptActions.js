const express = require("express");
const Audience = require("../models/Audience");
const Organization = require("../models/Organization");
const MarketResearchJob = require("../models/MarketResearchJob");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Outreach = require("../models/Outreach");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const GrowthActionApproval = require("../models/GrowthActionApproval");
const McpAuditLog = require("../models/McpAuditLog");
const { requireMcpAuth } = require("../middleware/mcpAuth");
const { compileMarketQuestion } = require("../services/marketResearchService");
const { runMarketResearchJob } = require("../services/externalMarketResearchService");
const { effectiveTemplate } = require("../services/campaignMasterTemplate");
const { previewContactIngestion, ingestContacts } = require("../services/contactIngestionService");
const { sendEmail } = require("../services/email");

const router = express.Router();
const serverUrl = (req) => String(process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const hasScope = (req, scope) => req.mcpAuth?.scopes?.includes(scope);
const requireScope = (scope) => (req, res, next) => hasScope(req, scope) ? next() : res.status(403).json({ error: `The Growth Operator connection does not include ${scope}.` });
const confirmationExpiry = () => new Date(Date.now() + 15 * 60 * 1000);
async function requireOperator(req, res, next) {
  const membership = await WorkspaceMembership.findOne({ workspaceId: req.mcpAuth.workspaceId, userId: req.mcpAuth.userId, status: "active" }).lean();
  if (!membership || !["owner", "admin"].includes(membership.role)) return res.status(403).json({ error: "An Ellie owner or admin must perform this action." });
  req.operatorRole = membership.role;
  next();
}
async function approval(req, action, payload, summary, phrase) {
  return GrowthActionApproval.create({ workspaceId: req.mcpAuth.workspaceId, userId: req.mcpAuth.userId, action, payload, summary, confirmationPhrase: phrase, expiresAt: confirmationExpiry() });
}
async function consumeApproval(req, action) {
  const item = await GrowthActionApproval.findOne({ _id: req.body?.approvalId, workspaceId: req.mcpAuth.workspaceId, userId: req.mcpAuth.userId, action, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!item) throw new Error("This approval is missing, expired, already used, or belongs to another workspace.");
  if (String(req.body?.confirmation || "") !== item.confirmationPhrase) throw new Error(`Confirmation must exactly match: ${item.confirmationPhrase}`);
  item.usedAt = new Date();
  await item.save();
  return item;
}

function audit(req, action, success, detail = "") {
  McpAuditLog.create({ ...req.mcpAuth, tool: `gpt_action:${action}`, success, detail: String(detail).slice(0, 500) }).catch(() => {});
}

router.get("/gpt-actions/openapi.json", (req, res) => {
  const base = serverUrl(req);
  res.json({
    openapi: "3.1.0",
    info: { title: "Growth Operator", version: "1.1.1", description: "Research leads and prepare guarded CRM operations. High-impact changes require a short-lived approval and an exact second confirmation." },
    servers: [{ url: base }],
    components: {
      securitySchemes: { GrowthOperatorToken: { type: "http", scheme: "bearer", bearerFormat: "Growth Operator connection token" } },
      schemas: {
        ResearchRequest: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 8, maxLength: 1000, description: "Natural-language description of the businesses or leads to research." }, maxResults: { type: "integer", minimum: 1, maximum: 1000, default: 250 } } },
        ConfirmationRequest: { type: "object", required: ["approvalId", "confirmation"], properties: { approvalId: { type: "string" }, confirmation: { type: "string", description: "The exact confirmation phrase returned by the prepare action." } } },
        ConnectionRow: { type: "object", required: ["First Name", "Last Name"], additionalProperties: true, properties: { "First Name": { type: "string" }, "Last Name": { type: "string" }, "Email": { type: "string" }, "Company Name": { type: "string" }, "Title": { type: "string" }, "Person Linkedin Url": { type: "string" } } },
      },
    },
    security: [{ GrowthOperatorToken: [] }],
    paths: {
      "/gpt-actions/status": { get: { operationId: "getGrowthOperatorStatus", summary: "Check the Growth Operator connection and available capabilities", responses: { 200: { description: "Connection status" } } } },
      "/gpt-actions/prospect-lists": { get: { operationId: "listProspectLists", summary: "List saved research and prospect lists", parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }], responses: { 200: { description: "Prospect lists" } } } },
      "/gpt-actions/leads/search": { get: { operationId: "searchRankedLeads", summary: "Search ranked organizations already saved in the CRM", parameters: [{ name: "query", in: "query", schema: { type: "string", maxLength: 200 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }], responses: { 200: { description: "Ranked leads" } } } },
      "/gpt-actions/research/plan": { post: { operationId: "planLeadResearch", summary: "Create a reviewable lead-research plan without changing CRM data", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResearchRequest" } } } }, responses: { 200: { description: "Research plan" } } } },
      "/gpt-actions/research/run": { post: { operationId: "startLeadResearch", summary: "Create a prospect list and start approved evidence-backed research", description: "This changes workspace data by creating a list and queued research job. Ask the user for confirmation before calling.", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResearchRequest" } } } }, responses: { 202: { description: "Queued research job" } } } },
      "/gpt-actions/research/jobs/{jobId}": { get: { operationId: "getLeadResearchJob", summary: "Check a lead-research job and its progress", parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Research job" } } } },
      "/gpt-actions/campaigns": { get: { operationId: "listCampaigns", summary: "List campaigns and template status", responses: { 200: { description: "Campaigns" } } } },
      "/gpt-actions/templates/prepare": { post: { operationId: "prepareTemplateChange", summary: "Preview a campaign template change and create a confirmation", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["campaignId", "subject", "body"], properties: { campaignId: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, callToAction: { type: "string" }, callToActionUrl: { type: "string" }, topic: { type: "string", enum: ["event_invitations", "program_offers", "educational_newsletter"] } } } } } }, responses: { 200: { description: "Before/after diff and confirmation" } } } },
      "/gpt-actions/templates/apply": { post: { operationId: "applyTemplateChange", summary: "Apply a previously confirmed template as a draft", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmationRequest" } } } }, responses: { 200: { description: "Updated draft" } } } },
      "/gpt-actions/campaigns/prepare-send": { post: { operationId: "prepareCampaignSend", summary: "Check recipients and prepare a guarded campaign send", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["campaignId", "outreachIds"], properties: { campaignId: { type: "string" }, outreachIds: { type: "array", maxItems: 250, items: { type: "string" } } } } } } }, responses: { 200: { description: "Eligibility report and confirmation" } } } },
      "/gpt-actions/campaigns/send": { post: { operationId: "confirmCampaignSend", summary: "Send an approved campaign after exact confirmation", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmationRequest" } } } }, responses: { 200: { description: "Send receipt" } } } },
      "/gpt-actions/contacts/prepare-archive": { post: { operationId: "prepareContactArchive", summary: "Preview reversible contact archiving", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["contactIds"], properties: { contactIds: { type: "array", maxItems: 500, items: { type: "string" } } } } } } }, responses: { 200: { description: "Archive preview and confirmation" } } } },
      "/gpt-actions/contacts/archive": { post: { operationId: "confirmContactArchive", summary: "Archive contacts after exact confirmation", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmationRequest" } } } }, responses: { 200: { description: "Archive receipt" } } } },
      "/gpt-actions/linkedin/preview": { post: { operationId: "previewLinkedInConnections", summary: "Preview owner-provided LinkedIn connection rows", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["connections"], properties: { connections: { type: "array", maxItems: 500, items: { $ref: "#/components/schemas/ConnectionRow" } } } } } } }, responses: { 200: { description: "Deduplication preview" } } } },
      "/gpt-actions/linkedin/prepare-import": { post: { operationId: "prepareLinkedInImport", summary: "Prepare owner-provided LinkedIn rows for CRM review", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["connections"], properties: { connections: { type: "array", maxItems: 500, items: { $ref: "#/components/schemas/ConnectionRow" } } } } } } }, responses: { 200: { description: "Import confirmation" } } } },
      "/gpt-actions/linkedin/import": { post: { operationId: "confirmLinkedInImport", summary: "Import confirmed LinkedIn rows as unmarketable prospects", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmationRequest" } } } }, responses: { 200: { description: "Import receipt" } } } },
      "/gpt-actions/crm-fields/prepare": { post: { operationId: "prepareCrmField", summary: "Preview a new custom CRM field", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["label"], properties: { label: { type: "string" }, key: { type: "string" }, type: { type: "string", enum: ["text", "number", "date", "boolean"] } } } } } }, responses: { 200: { description: "Field proposal" } } } },
      "/gpt-actions/crm-fields/apply": { post: { operationId: "applyCrmField", summary: "Add a confirmed custom CRM field", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConfirmationRequest" } } } }, responses: { 200: { description: "Updated fields" } } } },
    },
  });
});

router.get("/gpt-actions/privacy", (_req, res) => res.type("html").send("<!doctype html><title>Growth Operator Privacy</title><main style='max-width:760px;margin:60px auto;font:16px system-ui;line-height:1.6'><h1>Growth Operator</h1><p>Growth Operator actions access only the authenticated workspace and only the permissions granted by its connection token. Tool calls are audit logged. Growth Operator does not expose passwords to ChatGPT.</p><p>High-impact operations use short-lived previews and exact second confirmations. Sending also enforces suppression, verification, consent, and unsubscribe rules. Contact removal is reversible archiving, not permanent deletion. Growth Operator never stores LinkedIn passwords, scrapes LinkedIn, or silently messages connections.</p><p>Revoke access at any time from Settings → AI connections. Do not share a connection token or publish a private GPT containing one.</p></main>"));

router.use("/gpt-actions", requireMcpAuth);
router.get("/gpt-actions/status", (req, res) => {
  audit(req, "status", true);
  res.json({ connected: true, workspaceScoped: true, capabilities: ["research planning", "ranked lead search", "prospect lists", "start research", "template drafts with approval", "guarded campaign sends", "reversible contact archiving", "custom CRM fields", "owner-provided LinkedIn connection imports"], safeguards: ["exact second confirmation", "15-minute approvals", "admin role checks", "suppression and consent enforcement", "audit logs"], unavailable: ["permanent deletion", "LinkedIn scraping or network access", "unconfirmed bulk sending", "guaranteed coverage of every US business"] });
});
router.get("/gpt-actions/prospect-lists", requireScope("research:read"), async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const lists = await Audience.find({ workspaceId: req.mcpAuth.workspaceId }).select("name status source totalOrgs createdAt").sort({ createdAt: -1 }).limit(limit).lean();
  audit(req, "list_prospect_lists", true);
  res.json({ lists });
});
router.get("/gpt-actions/leads/search", requireScope("crm:read"), async (req, res) => {
  const query = String(req.query.query || "").trim().slice(0, 200);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const filter = { workspaceId: req.mcpAuth.workspaceId };
  if (query) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["name", "industry", "location", "description"].map((field) => ({ [field]: { $regex: safe, $options: "i" } }));
  }
  const leads = await Organization.find(filter).select("name domain website industry location audienceScore audienceTier scoreReasons researchEvidence lastResearchVerifiedAt decisionMakers").sort({ audienceScore: -1 }).limit(limit).lean();
  audit(req, "search_ranked_leads", true);
  res.json({ leads, count: leads.length });
});
router.post("/gpt-actions/research/plan", requireScope("research:read"), async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (question.length < 8 || question.length > 1000) return res.status(400).json({ error: "Enter a research question between 8 and 1,000 characters." });
    const plan = await compileMarketQuestion(question);
    audit(req, "plan_research", true);
    res.json({ plan, confirmationRequiredBeforeStarting: true });
  } catch (error) { audit(req, "plan_research", false, error.message); res.status(400).json({ error: error.message }); }
});
router.post("/gpt-actions/research/run", requireScope("research:write"), async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (question.length < 8 || question.length > 1000) return res.status(400).json({ error: "Enter a research question between 8 and 1,000 characters." });
    const maxResults = Math.min(1000, Math.max(1, Number(req.body?.maxResults) || 250));
    const plan = await compileMarketQuestion(question);
    const audience = await Audience.create({ workspaceId: req.mcpAuth.workspaceId, name: String(plan.name || "Growth Operator market research").slice(0, 160), description: plan.summary || question, source: "ai", criteria: plan.criteria || {} });
    const job = await MarketResearchJob.create({ workspaceId: req.mcpAuth.workspaceId, userId: req.mcpAuth.userId, audienceId: audience._id, question, plan, sourceId: "ellie_business_data", status: "queued" });
    setImmediate(() => runMarketResearchJob(job._id, { maxResults }).catch(() => {}));
    audit(req, "start_research", true);
    res.status(202).json({ jobId: job._id, prospectListId: audience._id, status: "queued", maxResults });
  } catch (error) { audit(req, "start_research", false, error.message); res.status(400).json({ error: error.message }); }
});
router.get("/gpt-actions/research/jobs/:jobId", requireScope("research:read"), async (req, res) => {
  const job = await MarketResearchJob.findOne({ _id: req.params.jobId, workspaceId: req.mcpAuth.workspaceId }).lean();
  if (!job) return res.status(404).json({ error: "Research job not found." });
  audit(req, "get_research_job", true);
  res.json({ job });
});

router.get("/gpt-actions/campaigns", requireScope("campaigns:read"), async (req, res) => {
  const campaigns = await Campaign.find({}).select("name campaignKind emailTemplate.status emailTemplate.currentVersion createdAt").sort({ createdAt: -1 }).limit(100).lean();
  audit(req, "list_campaigns", true);
  res.json({ campaigns });
});

router.post("/gpt-actions/templates/prepare", requireScope("campaigns:write"), requireOperator, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.body?.campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const before = effectiveTemplate(campaign);
    const after = {
      subject: String(req.body?.subject || before.subject).trim().slice(0, 300),
      body: String(req.body?.body || before.body).trim().slice(0, 30000),
      callToAction: String(req.body?.callToAction || before.callToAction).trim().slice(0, 120),
      callToActionUrl: String(req.body?.callToActionUrl || before.callToActionUrl).trim().slice(0, 1000),
      topic: ["event_invitations", "program_offers", "educational_newsletter"].includes(req.body?.topic) ? req.body.topic : before.topic,
    };
    if (!after.subject || !after.body) return res.status(400).json({ error: "Subject and body are required." });
    const phrase = `APPLY TEMPLATE ${campaign._id}`;
    const item = await approval(req, "apply_template", { campaignId: campaign._id, after }, { campaign: campaign.name, before, after }, phrase);
    audit(req, "prepare_template", true);
    res.json({ approvalId: item._id, expiresAt: item.expiresAt, confirmationPhrase: phrase, before, after, note: "This will save a draft. It will not approve or send it." });
  } catch (error) { audit(req, "prepare_template", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/templates/apply", requireScope("campaigns:write"), requireOperator, async (req, res) => {
  try {
    const item = await consumeApproval(req, "apply_template");
    const campaign = await Campaign.findById(item.payload.campaignId);
    if (!campaign) throw new Error("Campaign no longer exists.");
    campaign.emailTemplate = { ...item.payload.after, status: "draft", currentVersion: campaign.emailTemplate?.currentVersion || 0, approvedAt: null };
    await campaign.save();
    audit(req, "apply_template", true);
    res.json({ campaignId: campaign._id, template: effectiveTemplate(campaign), requiresEllieApprovalBeforeSending: true });
  } catch (error) { audit(req, "apply_template", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/campaigns/prepare-send", requireScope("campaigns:write"), requireOperator, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.body?.campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.emailTemplate?.status !== "approved") return res.status(409).json({ error: "The campaign template must be approved in Ellie first." });
    const requested = [...new Set((Array.isArray(req.body?.outreachIds) ? req.body.outreachIds : []).map(String))].slice(0, 250);
    if (!requested.length) return res.status(400).json({ error: "Provide 1 to 250 outreachIds." });
    const items = await Outreach.find({ _id: { $in: requested }, campaignId: campaign._id, status: "approved" }).select("_id contactId contactEmail status").lean();
    const eligible = [];
    const blocked = [];
    for (const row of items) {
      const contact = row.contactId ? await Contact.findById(row.contactId).select("status emailStatus emailPreferences emailBounced").lean() : null;
      const reason = !contact ? "missing CRM contact" : contact.status === "unsubscribed" ? "unsubscribed" : contact.status === "archived" ? "archived" : contact.emailBounced ? "previously bounced" : contact.emailStatus !== "verified" ? "email not verified" : contact.emailPreferences?.marketingStatus !== "subscribed" || !contact.emailPreferences?.consentAt ? "no recorded marketing consent" : null;
      if (reason) blocked.push({ outreachId: row._id, reason }); else eligible.push(String(row._id));
    }
    const phrase = `SEND ${eligible.length} EMAILS`;
    const item = await approval(req, "send_campaign", { campaignId: campaign._id, outreachIds: eligible }, { campaign: campaign.name, requested: requested.length, eligible: eligible.length, blocked }, phrase);
    audit(req, "prepare_send", true);
    res.json({ approvalId: item._id, expiresAt: item.expiresAt, confirmationPhrase: phrase, requested: requested.length, eligible: eligible.length, blocked, warning: "Sending is irreversible. Review the blocked list and exact count." });
  } catch (error) { audit(req, "prepare_send", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/campaigns/send", requireScope("campaigns:write"), requireOperator, async (req, res) => {
  try {
    const item = await consumeApproval(req, "send_campaign");
    const receipts = [];
    for (const id of item.payload.outreachIds) {
      const outreach = await Outreach.findOne({ _id: id, campaignId: item.payload.campaignId, status: "approved" });
      if (!outreach) { receipts.push({ outreachId: id, success: false, message: "No longer approved." }); continue; }
      const result = await sendEmail(outreach);
      if (result.success) { outreach.status = "sent"; outreach.sentAt = new Date(); outreach.messageId = result.messageId || ""; outreach.errorMessage = ""; }
      else { outreach.status = "failed"; outreach.failedAt = new Date(); outreach.errorMessage = result.message || "Send failed"; }
      await outreach.save();
      receipts.push({ outreachId: id, success: Boolean(result.success), message: result.message });
    }
    audit(req, "send_campaign", true, `${receipts.filter((r) => r.success).length}/${receipts.length}`);
    res.json({ sent: receipts.filter((r) => r.success).length, failed: receipts.filter((r) => !r.success).length, receipts });
  } catch (error) { audit(req, "send_campaign", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/contacts/prepare-archive", requireScope("crm:write"), requireOperator, async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.contactIds) ? req.body.contactIds : []).map(String))].slice(0, 500);
    const contacts = await Contact.find({ _id: { $in: ids }, status: { $ne: "archived" } }).select("_id name email status").lean();
    const phrase = `ARCHIVE ${contacts.length} CONTACTS`;
    const item = await approval(req, "archive_contacts", { contactIds: contacts.map((c) => c._id) }, { contacts }, phrase);
    audit(req, "prepare_archive", true);
    res.json({ approvalId: item._id, expiresAt: item.expiresAt, confirmationPhrase: phrase, contacts, reversible: true });
  } catch (error) { audit(req, "prepare_archive", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/contacts/archive", requireScope("crm:write"), requireOperator, async (req, res) => {
  try {
    const item = await consumeApproval(req, "archive_contacts");
    const result = await Contact.updateMany({ _id: { $in: item.payload.contactIds }, status: { $ne: "archived" } }, { $set: { status: "archived" }, $addToSet: { tags: "archived-by-growth-operator" } });
    audit(req, "archive_contacts", true, result.modifiedCount);
    res.json({ archived: result.modifiedCount, permanentDeletion: false });
  } catch (error) { audit(req, "archive_contacts", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/linkedin/preview", requireScope("crm:read"), async (req, res) => {
  try { const preview = await previewContactIngestion({ contacts: req.body?.connections }); audit(req, "preview_linkedin", true); res.json({ ...preview, note: "Only owner-provided export rows are accepted. Ellie does not access or scrape LinkedIn." }); }
  catch (error) { audit(req, "preview_linkedin", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/linkedin/prepare-import", requireScope("imports:write"), requireOperator, async (req, res) => {
  try {
    const connections = (Array.isArray(req.body?.connections) ? req.body.connections : []).slice(0, 500).map((row) => ({ ...row, Tags: [...new Set([...(Array.isArray(row.Tags) ? row.Tags : []), "linkedin-owner-export", "needs-review"])] }));
    const preview = await previewContactIngestion({ contacts: connections });
    const phrase = `IMPORT ${connections.length} LINKEDIN CONTACTS`;
    const item = await approval(req, "import_linkedin_connections", { connections }, { total: preview.total, newContacts: preview.newContacts, existingContacts: preview.existingContacts, duplicatesInFile: preview.duplicatesInFile }, phrase);
    audit(req, "prepare_linkedin_import", true);
    res.json({ approvalId: item._id, expiresAt: item.expiresAt, confirmationPhrase: phrase, preview, marketingPermission: false });
  } catch (error) { audit(req, "prepare_linkedin_import", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/linkedin/import", requireScope("imports:write"), requireOperator, async (req, res) => {
  try {
    const item = await consumeApproval(req, "import_linkedin_connections");
    const result = await ingestContacts({ contacts: item.payload.connections, source: "linkedin_owner_export", marketingPermission: false, importBatchId: `growth-${item._id}`, importFileName: "ChatGPT LinkedIn owner export" });
    await Contact.updateMany({ lastImportBatchId: `growth-${item._id}` }, { $set: { status: "prospect" }, $addToSet: { tags: { $each: ["linkedin-owner-export", "needs-review"] } } });
    audit(req, "import_linkedin", true, result.mongoCreated + result.mongoUpdated);
    res.json({ ...result, marketingPermission: false, nextStep: "Review and qualify these prospects in Ellie before outreach." });
  } catch (error) { audit(req, "import_linkedin", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/crm-fields/prepare", requireScope("settings:write"), requireOperator, async (req, res) => {
  try {
    const label = String(req.body?.label || "").trim().slice(0, 80);
    const key = String(req.body?.key || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
    const type = ["text", "number", "date", "boolean"].includes(req.body?.type) ? req.body.type : "text";
    if (!label || !key) return res.status(400).json({ error: "A valid field label is required." });
    const phrase = `ADD CRM FIELD ${key}`;
    const item = await approval(req, "add_crm_field", { key, label, type }, { key, label, type }, phrase);
    audit(req, "prepare_crm_field", true);
    res.json({ approvalId: item._id, expiresAt: item.expiresAt, confirmationPhrase: phrase, field: { key, label, type } });
  } catch (error) { audit(req, "prepare_crm_field", false, error.message); res.status(400).json({ error: error.message }); }
});

router.post("/gpt-actions/crm-fields/apply", requireScope("settings:write"), requireOperator, async (req, res) => {
  try {
    const item = await consumeApproval(req, "add_crm_field");
    const config = await WorkspaceConfig.findOneAndUpdate({ key: "primary", "customContactFields.key": { $ne: item.payload.key } }, { $push: { customContactFields: item.payload } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    if (!config) throw new Error("A CRM field with this key already exists.");
    audit(req, "add_crm_field", true);
    res.json({ customContactFields: config.customContactFields });
  } catch (error) { audit(req, "add_crm_field", false, error.message); res.status(400).json({ error: error.message }); }
});

module.exports = router;
