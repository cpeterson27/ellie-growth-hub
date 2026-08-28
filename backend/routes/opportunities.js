const express = require("express");
const mongoose = require("mongoose");
const PipelineStage = require("../models/PipelineStage");
const SalesOpportunity = require("../models/SalesOpportunity");
const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const CrmActivity = require("../models/CrmActivity");
const { authenticatedUserId, salesOpportunityFilter } = require("../authorization/accessPolicy");
const referralCommissionService = require("../services/referralCommissionService");
const closerWorkflowService = require("../services/closerWorkflowService");
const leadQualificationService = require("../services/leadQualificationService");
const { requireCapability, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireCapability("sales.opportunities.view", "sales.opportunities.view_assigned"));
const defaultStages = [
  { key: "new", label: "New opportunity", order: 0, probability: 10, color: "neutral" },
  { key: "qualified", label: "Qualified", order: 1, probability: 25, color: "info" },
  { key: "conversation", label: "Conversation", order: 2, probability: 45, color: "info" },
  { key: "proposal", label: "Proposal", order: 3, probability: 70, color: "warning" },
  { key: "won", label: "Won", order: 4, probability: 100, color: "success", terminal: "won" },
  { key: "lost", label: "Lost", order: 5, probability: 0, color: "danger", terminal: "lost" },
];

async function getStages() {
  let stages = await PipelineStage.find({ active: true }).sort({ order: 1 }).lean();
  if (!stages.length) {
    await PipelineStage.insertMany(defaultStages);
    stages = await PipelineStage.find({ active: true }).sort({ order: 1 }).lean();
  }
  return stages;
}

router.get("/stages", async (_req, res) => {
  try { return res.json({ success: true, data: await getStages() }); }
  catch { return res.status(500).json({ success: false, error: "Failed to load pipeline stages" }); }
});

router.get("/closer-queue", async (req, res) => {
  try {
    const data = await closerWorkflowService.queue({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), auth: req.auth, view: req.query.view, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to load Closer Queue" }); }
});

router.get("/lead-workflow/analytics", async (req, res) => {
  try { return res.json({ success: true, data: await closerWorkflowService.analytics({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), auth: req.auth }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to load lead analytics" }); }
});

router.post("/lead-signals/:signalId/evaluate", requireCapability("discovery.manage"), async (req, res) => {
  try {
    const result = await leadQualificationService.evaluate({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), signalId: req.params.signalId, auth: req.auth, useAi: req.body?.useAi === true });
    const convergence = req.body?.convert === true ? await leadQualificationService.converge({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), signal: result.signal, qualification: result.qualification, input: req.body }) : null;
    return res.json({ success: true, qualification: result.qualification, aiCalled: result.aiCalled, convergence });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to evaluate lead" }); }
});

router.put("/stages", requireCapability("sales.opportunities.manage"), async (req, res) => {
  try {
    const stages = Array.isArray(req.body?.stages) ? req.body.stages.slice(0, 12) : [];
    if (stages.length < 2) return res.status(400).json({ success: false, error: "At least two stages are required" });
    const keys = new Set();
    for (const [order, item] of stages.entries()) {
      const key = String(item.key || item.label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
      if (!key || keys.has(key)) return res.status(400).json({ success: false, error: "Every stage needs a unique name" });
      keys.add(key);
      await PipelineStage.findOneAndUpdate({ key }, { key, label: String(item.label || key).trim().slice(0, 80), order, probability: Math.min(100, Math.max(0, Number(item.probability) || 0)), color: ["neutral", "info", "warning", "success", "danger"].includes(item.color) ? item.color : "neutral", terminal: ["won", "lost"].includes(item.terminal) ? item.terminal : "", active: true }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    await PipelineStage.updateMany({ key: { $nin: [...keys] } }, { active: false });
    return res.json({ success: true, data: await getStages() });
  } catch { return res.status(500).json({ success: false, error: "Failed to save pipeline stages" }); }
});

router.get("/", async (req, res) => {
  try {
    const query = salesOpportunityFilter(req);
    const search = String(req.query.search || "").trim().slice(0, 120);
    if (search) query.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (req.query.owner === "mine") query.ownerId = authenticatedUserId(req);
    const data = await SalesOpportunity.find(query).populate("organizationId", "name domain").populate("primaryContactId", "name email title").populate("campaignId", "name").populate("ownerId", "name email").sort({ updatedAt: -1 }).limit(500).lean();
    return res.json({ success: true, data, stages: await getStages() });
  } catch { return res.status(500).json({ success: false, error: "Failed to load opportunities" }); }
});

router.post("/", requireCapability("sales.opportunities.manage", "sales.opportunities.manage_assigned"), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, error: "Opportunity name is required" });
    const stages = await getStages();
    const stage = stages.find((item) => item.key === req.body?.stageKey) || stages[0];
    if (req.body?.organizationId && !mongoose.Types.ObjectId.isValid(req.body.organizationId)) return res.status(400).json({ success: false, error: "Invalid company" });
    if (req.body?.primaryContactId && !mongoose.Types.ObjectId.isValid(req.body.primaryContactId)) return res.status(400).json({ success: false, error: "Invalid contact" });
    let organizationId = req.body?.organizationId || null;
    if (req.body?.primaryContactId) {
      const contact = await Contact.findOne({ _id: req.body.primaryContactId, workspaceId: req.auth.workspaceId }).select("organizationId").lean();
      if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });
      organizationId ||= contact.organizationId || null;
    }
    if (organizationId && !await Organization.exists({ _id: organizationId, workspaceId: req.auth.workspaceId })) return res.status(404).json({ success: false, error: "Company not found" });
    const opportunity = await SalesOpportunity.create({ workspaceId: req.auth.workspaceId, name, stageKey: stage.key, organizationId, primaryContactId: req.body?.primaryContactId || null, campaignId: req.body?.campaignId || null, ownerId: authenticatedUserId(req), value: Math.max(0, Number(req.body?.value) || 0), probability: stage.probability, expectedCloseAt: req.body?.expectedCloseAt || null, nextAction: String(req.body?.nextAction || "").trim(), nextActionAt: req.body?.nextActionAt || null, notes: String(req.body?.notes || "").trim() });
    await CrmActivity.create({ workspaceId: req.auth.workspaceId, contactId: opportunity.primaryContactId, organizationId: opportunity.organizationId, campaignId: opportunity.campaignId, type: "status_change", title: "Opportunity created", body: `${opportunity.name} entered ${stage.label}.`, source: "crm", createdBy: authenticatedUserId(req), metadata: { opportunityId: opportunity._id, stageKey: stage.key, value: opportunity.value } });
    return res.status(201).json({ success: true, data: opportunity });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to create opportunity" }); }
});

router.patch("/:id", requireCapability("sales.opportunities.manage", "sales.opportunities.manage_assigned"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: "Invalid opportunity" });
    const opportunity = await SalesOpportunity.findOne(salesOpportunityFilter(req, { _id: req.params.id }));
    if (!opportunity) return res.status(404).json({ success: false, error: "Opportunity not found" });
    const oldStage = opportunity.stageKey;
    const stages = await getStages();
    let targetStage = stages.find((item) => item.key === opportunity.stageKey);
    if (req.body.stageKey !== undefined) {
      const stage = stages.find((item) => item.key === req.body.stageKey);
      if (!stage) return res.status(400).json({ success: false, error: "Unknown pipeline stage" });
      targetStage = stage;
      opportunity.stageKey = stage.key; opportunity.probability = stage.probability;
      opportunity.wonAt = stage.terminal === "won" ? new Date() : null;
      opportunity.lostAt = stage.terminal === "lost" ? new Date() : null;
      if (stage.terminal) opportunity.leadLifecycle = { ...(opportunity.leadLifecycle?.toObject?.() || opportunity.leadLifecycle || {}), status: stage.terminal, statusAt: new Date() };
    }
    for (const field of ["name", "nextAction", "notes", "lostReason", "currency"]) if (req.body[field] !== undefined) opportunity[field] = String(req.body[field]).trim();
    for (const field of ["value", "probability"]) if (req.body[field] !== undefined) opportunity[field] = Math.max(0, Number(req.body[field]) || 0);
    for (const field of ["expectedCloseAt", "nextActionAt"]) if (req.body[field] !== undefined) opportunity[field] = req.body[field] || null;
    if (targetStage?.terminal === "lost" && !opportunity.lostReason) return res.status(400).json({ success: false, error: "A loss reason is required before closing an opportunity as lost" });
    await opportunity.save();
    if (oldStage !== opportunity.stageKey) {
      const oldLabel = stages.find((item) => item.key === oldStage)?.label || oldStage;
      const newLabel = stages.find((item) => item.key === opportunity.stageKey)?.label || opportunity.stageKey;
      const eventType = targetStage?.terminal === "won" ? "opportunity.closed_won" : targetStage?.terminal === "lost" ? "opportunity.closed_lost" : "opportunity.stage_changed";
      await CrmActivity.create({ workspaceId: req.auth.workspaceId, contactId: opportunity.primaryContactId, organizationId: opportunity.organizationId, campaignId: opportunity.campaignId, type: "status_change", title: "Opportunity stage changed", body: `${opportunity.name}: ${oldLabel} → ${newLabel}${opportunity.lostReason ? `\nReason: ${opportunity.lostReason}` : ""}`, source: "crm", createdBy: authenticatedUserId(req), metadata: { eventType, opportunityId: opportunity._id, from: oldStage, to: opportunity.stageKey, value: opportunity.value, closerUserId: opportunity.ownerId || null } });
    }
    if (targetStage?.terminal === "won") await referralCommissionService.generateFromOpportunity({ workspaceId: req.auth.workspaceId, opportunity, actorUserId: authenticatedUserId(req) });
    return res.json({ success: true, data: opportunity });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to update opportunity" }); }
});

router.post("/:id/assign", requireRole("owner", "admin"), requireCapability("sales.opportunities.manage"), async (req, res) => {
  try { return res.json({ success: true, data: await closerWorkflowService.assign({ workspaceId: req.auth.workspaceId, opportunityId: req.params.id, closerUserId: req.body?.closerUserId, actorUserId: authenticatedUserId(req), source: req.body?.source, reason: req.body?.reason }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to assign Closer" }); }
});

router.post("/:id/activities", requireCapability("sales.opportunities.manage", "sales.opportunities.manage_assigned"), async (req, res) => {
  try { return res.status(201).json({ success: true, data: await closerWorkflowService.recordActivity({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), auth: req.auth, opportunityId: req.params.id, outcome: req.body?.outcome, channel: req.body?.channel, notes: req.body?.notes, nextFollowUpAt: req.body?.nextFollowUpAt }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || "Failed to record activity" }); }
});

// User-initiated only. The service serializes an explicit allowlisted DTO before
// any context reaches the shared AI Core; this route never executes outreach.
router.post("/:id/sales-assist", async (req, res) => {
  try { return res.json({ success: true, data: await closerWorkflowService.salesAssist({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), auth: req.auth, opportunityId: req.params.id, action: req.body?.action, objection: req.body?.objection }) }); }
  catch (error) { return res.status(error.code === "OPPORTUNITY_NOT_FOUND" ? 404 : 400).json({ success: false, error: error.message || "Sales Agent assistance failed" }); }
});

router.post("/:id/coaching-handoff/prepare", requireRole("owner", "admin"), requireCapability("sales.opportunities.manage"), async (req, res) => {
  try { return res.json({ success: true, data: await closerWorkflowService.prepareCoachingHandoff({ workspaceId: req.auth.workspaceId, userId: authenticatedUserId(req), auth: req.auth, opportunityId: req.params.id }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message || "Handoff is not ready" }); }
});

module.exports = router;
