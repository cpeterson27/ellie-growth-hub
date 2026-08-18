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

console.log("CRM core dependency-free contracts passed: activities, tasks, stages, opportunities, tenancy, and API mounting.");
