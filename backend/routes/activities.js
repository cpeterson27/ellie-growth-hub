const express = require("express");
const mongoose = require("mongoose");
const CrmActivity = require("../models/CrmActivity");
const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const Outreach = require("../models/Outreach");
const SalesOpportunity = require("../models/SalesOpportunity");
const { authenticatedUserId } = require("../authorization/accessPolicy");

const router = express.Router();
const activityTypes = new Set(["note", "call", "meeting", "task", "status_change", "email", "campaign", "research", "system"]);

function validId(value) {
  return !value || mongoose.Types.ObjectId.isValid(value);
}

router.get("/tasks", async (req, res) => {
  try {
    const showCompleted = req.query.completed === "true";
    const [activities, opportunities] = await Promise.all([
      CrmActivity.find({ type: "task", completedAt: showCompleted ? { $ne: null } : null })
        .populate("contactId", "name company email")
        .populate("organizationId", "name domain")
        .sort({ dueAt: 1, createdAt: -1 }).limit(500).lean(),
      showCompleted ? [] : SalesOpportunity.find({ nextAction: { $ne: "" }, nextActionAt: { $ne: null } })
        .populate("primaryContactId", "name company email")
        .populate("organizationId", "name domain")
        .populate("ownerId", "name email")
        .sort({ nextActionAt: 1 }).limit(500).lean(),
    ]);
    const data = [
      ...activities.map((item) => ({ ...item, taskId: `activity:${item._id}`, dueAt: item.dueAt || item.occurredAt, origin: "activity" })),
      ...opportunities.map((item) => ({ _id: item._id, taskId: `opportunity:${item._id}`, type: "task", title: item.nextAction, body: `Opportunity: ${item.name}`, dueAt: item.nextActionAt, occurredAt: item.updatedAt, completedAt: null, contactId: item.primaryContactId, organizationId: item.organizationId, ownerId: item.ownerId, origin: "opportunity", metadata: { opportunityName: item.name, opportunityId: item._id } })),
    ].sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to load tasks" });
  }
});

router.patch("/tasks/:origin/:id/complete", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !["activity", "opportunity"].includes(req.params.origin)) return res.status(400).json({ success: false, error: "Invalid task" });
    if (req.params.origin === "activity") {
      const task = await CrmActivity.findOne({ _id: req.params.id, type: "task" });
      if (!task) return res.status(404).json({ success: false, error: "Task not found" });
      task.completedAt = new Date();
      await task.save();
      return res.json({ success: true, data: task });
    }
    const opportunity = await SalesOpportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ success: false, error: "Opportunity not found" });
    const completedAction = opportunity.nextAction;
    opportunity.nextAction = "";
    opportunity.nextActionAt = null;
    await opportunity.save();
    await CrmActivity.create({ contactId: opportunity.primaryContactId, organizationId: opportunity.organizationId, campaignId: opportunity.campaignId, type: "task", title: completedAction, body: `Completed for opportunity: ${opportunity.name}`, occurredAt: new Date(), completedAt: new Date(), source: "crm", createdBy: authenticatedUserId(req), metadata: { opportunityId: opportunity._id } });
    return res.json({ success: true, data: opportunity });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to complete task" });
  }
});

router.get("/", async (req, res) => {
  try {
    const contactId = String(req.query.contactId || "");
    const organizationId = String(req.query.organizationId || "");
    if ((!contactId && !organizationId) || !validId(contactId) || !validId(organizationId)) {
      return res.status(400).json({ success: false, error: "A valid contactId or organizationId is required" });
    }

    const filter = contactId ? { contactId } : { organizationId };
    const limit = Math.min(200, Math.max(10, Number.parseInt(req.query.limit, 10) || 100));
    const activities = await CrmActivity.find(filter).sort({ occurredAt: -1 }).limit(limit).lean();
    const contacts = contactId
      ? await Contact.find({ _id: contactId }).select("_id name email organizationId createdAt updatedAt lastContacted sourceProvider").lean()
      : await Contact.find({ organizationId, status: { $ne: "archived" } }).select("_id name email organizationId createdAt updatedAt lastContacted sourceProvider").lean();
    const contactIds = contacts.map((contact) => contact._id);
    const outreach = contactIds.length
      ? await Outreach.find({ contactId: { $in: contactIds } }).populate("campaignId", "name").sort({ updatedAt: -1 }).limit(limit).lean()
      : [];

    const derived = outreach.map((item) => ({
      _id: `outreach:${item._id}`,
      type: "email",
      direction: "outbound",
      title: item.repliedAt ? "Email reply received" : item.sentAt ? "Campaign email sent" : "Outreach prepared",
      body: item.subject || item.campaignId?.name || "Campaign outreach",
      occurredAt: item.repliedAt || item.sentAt || item.updatedAt || item.createdAt,
      source: "campaign",
      contactId: item.contactId,
      metadata: { status: item.status, deliveryStatus: item.deliveryStatus, campaignName: item.campaignId?.name || "" },
      derived: true,
    }));
    for (const contact of contacts) {
      derived.push({ _id: `contact-created:${contact._id}`, type: "system", title: "Contact added to CRM", body: `Source: ${contact.sourceProvider || "manual"}`, occurredAt: contact.createdAt, source: "crm", contactId: contact._id, derived: true });
      if (contact.lastContacted) derived.push({ _id: `last-contacted:${contact._id}`, type: "call", title: "Last contacted", body: "Recorded on the CRM relationship.", occurredAt: contact.lastContacted, source: "crm", contactId: contact._id, derived: true });
    }
    if (organizationId) {
      const organization = await Organization.findById(organizationId).select("createdAt updatedAt source").lean();
      if (organization) derived.push({ _id: `organization-created:${organization._id}`, type: "system", title: "Company added to CRM", body: `Source: ${organization.source || "manual"}`, occurredAt: organization.createdAt, source: "crm", organizationId: organization._id, derived: true });
    }

    const data = [...activities, ...derived]
      .filter((item) => item.occurredAt)
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, limit);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to load CRM activity" });
  }
});

router.post("/", async (req, res) => {
  try {
    const contactId = String(req.body?.contactId || "");
    let organizationId = String(req.body?.organizationId || "");
    const type = String(req.body?.type || "note");
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    if ((!contactId && !organizationId) || !validId(contactId) || !validId(organizationId)) return res.status(400).json({ success: false, error: "A valid contact or company is required" });
    if (!activityTypes.has(type)) return res.status(400).json({ success: false, error: "Unsupported activity type" });
    if (!title) return res.status(400).json({ success: false, error: "Activity title is required" });
    if (contactId) {
      const contact = await Contact.findById(contactId).select("organizationId").lean();
      if (!contact) return res.status(404).json({ success: false, error: "Contact not found" });
      organizationId ||= contact.organizationId ? String(contact.organizationId) : "";
    }
    if (organizationId && !await Organization.exists({ _id: organizationId })) return res.status(404).json({ success: false, error: "Company not found" });
    const activity = await CrmActivity.create({
      contactId: contactId || null,
      organizationId: organizationId || null,
      type,
      direction: ["inbound", "outbound"].includes(req.body?.direction) ? req.body.direction : "",
      title,
      body,
      occurredAt: req.body?.occurredAt || new Date(),
      dueAt: type === "task" ? (req.body?.dueAt || req.body?.occurredAt || new Date()) : null,
      source: "manual",
      createdBy: authenticatedUserId(req),
    });
    return res.status(201).json({ success: true, data: activity });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to record CRM activity" });
  }
});

module.exports = router;
