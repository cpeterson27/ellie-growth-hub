const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const Audience = require("../models/Audience");
const Organization = require("../models/Organization");
const MarketResearchJob = require("../models/MarketResearchJob");
const McpAuditLog = require("../models/McpAuditLog");
const { compileMarketQuestion } = require("./marketResearchService");
const { runMarketResearchJob } = require("./externalMarketResearchService");

function jsonResult(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value }; }

function createServer(auth) {
  const server = new McpServer({ name: "Growth Operator", version: "1.0.1" });
  const hasScope = (scope) => auth.scopes?.includes(scope);
  const audited = (tool, handler) => async (args) => {
    try {
      const result = await handler(args);
      McpAuditLog.create({ ...auth, tool, success: true }).catch(() => {});
      return jsonResult(result);
    } catch (error) {
      McpAuditLog.create({ ...auth, tool, success: false, detail: String(error.message || error).slice(0, 500) }).catch(() => {});
      return { isError: true, content: [{ type: "text", text: error.message || "Growth Operator could not complete this tool call." }] };
    }
  };

  server.registerTool("growth_operator_status", { title: "Growth Operator status", description: "Check the connected workspace and available capabilities.", inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false } }, audited("growth_operator_status", async () => ({ connected: true, capabilities: ["market research", "ranked lead lists", "CRM search", "email risk evidence"], emailSendingAvailable: false })));
  if (hasScope("research:read")) server.registerTool("list_prospect_lists", { title: "List prospect lists", description: "List research and prospect lists in this Growth Operator workspace.", inputSchema: { limit: z.number().int().min(1).max(100).optional() }, annotations: { readOnlyHint: true, openWorldHint: false } }, audited("list_prospect_lists", async ({ limit = 25 }) => Audience.find({ workspaceId: auth.workspaceId }).select("name status source totalOrgs createdAt").sort({ createdAt: -1 }).limit(limit).lean()));
  if (hasScope("crm:read")) server.registerTool("search_ranked_leads", { title: "Search ranked leads", description: "Search organizations already researched and saved in Growth Operator.", inputSchema: { query: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }, annotations: { readOnlyHint: true, openWorldHint: false } }, audited("search_ranked_leads", async ({ query = "", limit = 25 }) => {
    const filter = { workspaceId: auth.workspaceId };
    if (query.trim()) filter.$or = ["name", "industry", "location", "description"].map((field) => ({ [field]: { $regex: query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
    return Organization.find(filter).select("name domain website industry location audienceScore audienceTier scoreReasons decisionMakers").sort({ audienceScore: -1 }).limit(limit).lean();
  }));
  if (hasScope("research:read")) server.registerTool("plan_market_research", { title: "Plan market research", description: "Turn a natural-language market question into a reviewable Growth Operator research plan without changing CRM data.", inputSchema: { question: z.string().min(8).max(1000) }, annotations: { readOnlyHint: true, openWorldHint: true } }, audited("plan_market_research", ({ question }) => compileMarketQuestion(question)));
  if (hasScope("research:write")) server.registerTool("start_market_research", { title: "Start market research", description: "Create a prospect list and queue evidence-backed business research in Growth Operator. This changes workspace data.", inputSchema: { question: z.string().min(8).max(1000), maxResults: z.number().int().min(1).max(5000).optional() }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } }, audited("start_market_research", async ({ question, maxResults = 250 }) => {
    const plan = await compileMarketQuestion(question);
    const audience = await Audience.create({ workspaceId: auth.workspaceId, name: String(plan.name || "Growth Operator market research").slice(0, 160), description: plan.summary || question, source: "ai", criteria: plan.criteria || {} });
    const job = await MarketResearchJob.create({ workspaceId: auth.workspaceId, userId: auth.userId, audienceId: audience._id, question, plan, sourceId: "ellie_business_data", status: "queued" });
    setImmediate(() => runMarketResearchJob(job._id, { maxResults }).catch(() => {}));
    return { jobId: job._id, prospectListId: audience._id, status: "queued", maxResults };
  }));
  return server;
}

async function handleMcpRequest(req, res) {
  const server = createServer(req.mcpAuth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

module.exports = { handleMcpRequest };
