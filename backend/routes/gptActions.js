const express = require("express");
const Audience = require("../models/Audience");
const Organization = require("../models/Organization");
const MarketResearchJob = require("../models/MarketResearchJob");
const McpAuditLog = require("../models/McpAuditLog");
const { requireMcpAuth } = require("../middleware/mcpAuth");
const { compileMarketQuestion } = require("../services/marketResearchService");
const { runMarketResearchJob } = require("../services/externalMarketResearchService");

const router = express.Router();
const serverUrl = (req) => String(process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const hasScope = (req, scope) => req.mcpAuth?.scopes?.includes(scope);
const requireScope = (scope) => (req, res, next) => hasScope(req, scope) ? next() : res.status(403).json({ error: `The Ellie connection does not include ${scope}.` });

function audit(req, action, success, detail = "") {
  McpAuditLog.create({ ...req.mcpAuth, tool: `gpt_action:${action}`, success, detail: String(detail).slice(0, 500) }).catch(() => {});
}

router.get("/gpt-actions/openapi.json", (req, res) => {
  const base = serverUrl(req);
  res.json({
    openapi: "3.1.0",
    info: { title: "Growth Operator by Ellie", version: "1.0.0", description: "Securely search an Ellie workspace, review ranked leads, and create evidence-backed lead-research jobs. Never sends campaigns or deletes CRM data." },
    servers: [{ url: base }],
    components: {
      securitySchemes: { EllieToken: { type: "http", scheme: "bearer", bearerFormat: "Ellie connection token" } },
      schemas: {
        ResearchRequest: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 8, maxLength: 1000, description: "Natural-language description of the businesses or leads to research." }, maxResults: { type: "integer", minimum: 1, maximum: 1000, default: 250 } } },
      },
    },
    security: [{ EllieToken: [] }],
    paths: {
      "/gpt-actions/status": { get: { operationId: "getEllieStatus", summary: "Check the Ellie connection and available capabilities", responses: { 200: { description: "Connection status" } } } },
      "/gpt-actions/prospect-lists": { get: { operationId: "listProspectLists", summary: "List research and prospect lists saved in Ellie", parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }], responses: { 200: { description: "Prospect lists" } } } },
      "/gpt-actions/leads/search": { get: { operationId: "searchRankedLeads", summary: "Search ranked organizations already saved in Ellie", parameters: [{ name: "query", in: "query", schema: { type: "string", maxLength: 200 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } }], responses: { 200: { description: "Ranked leads" } } } },
      "/gpt-actions/research/plan": { post: { operationId: "planLeadResearch", summary: "Create a reviewable lead-research plan without changing CRM data", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResearchRequest" } } } }, responses: { 200: { description: "Research plan" } } } },
      "/gpt-actions/research/run": { post: { operationId: "startLeadResearch", summary: "Create a prospect list and start approved evidence-backed research", description: "This changes Ellie workspace data by creating a list and queued research job. Ask the user for confirmation before calling.", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ResearchRequest" } } } }, responses: { 202: { description: "Queued research job" } } } },
      "/gpt-actions/research/jobs/{jobId}": { get: { operationId: "getLeadResearchJob", summary: "Check a lead-research job and its progress", parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Research job" } } } },
    },
  });
});

router.get("/gpt-actions/privacy", (_req, res) => res.type("html").send("<!doctype html><title>Growth Operator Privacy</title><main style='max-width:760px;margin:60px auto;font:16px system-ui;line-height:1.6'><h1>Growth Operator by Ellie</h1><p>Growth Operator actions access only the authenticated Ellie workspace and only the permissions granted by its connection token. Tool calls are audit logged. Ellie does not expose passwords to ChatGPT and these actions do not send campaigns or delete CRM records.</p><p>Revoke access at any time from Ellie Settings → AI connections. Do not share an Ellie connection token or publish a private GPT containing one.</p></main>"));

router.use("/gpt-actions", requireMcpAuth);
router.get("/gpt-actions/status", (req, res) => {
  audit(req, "status", true);
  res.json({ connected: true, workspaceScoped: true, capabilities: ["research planning", "ranked lead search", "prospect lists", "start research"], unavailable: ["send campaign", "delete records", "change CRM schema"] });
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
    const audience = await Audience.create({ workspaceId: req.mcpAuth.workspaceId, name: String(plan.name || "Ellie market research").slice(0, 160), description: plan.summary || question, source: "ai", criteria: plan.criteria || {} });
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

module.exports = router;
