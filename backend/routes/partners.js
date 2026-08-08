const express = require("express");
const Partner = require("../models/Partner");
const Event = require("../models/Event");
const AffiliateSale = require("../models/AffiliateSale");
const { syncEvent } = require("../services/eventbriteLogisticsService");
const router = express.Router();

function trackingCode(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function eventbriteAffiliateUrl(rawUrl, code) {
  const url = new URL(rawUrl);
  if (!/(^|\.)eventbrite\.com$/i.test(url.hostname)) throw new Error("This event does not have a valid Eventbrite registration URL.");
  url.searchParams.set("aff", code);
  return url.toString();
}

router.get("/", async (_req, res) => { try { res.json(await Partner.find().sort({ createdAt: -1 })); } catch { res.status(500).json({ message: "Unable to load partners" }); } });
router.get("/eventbrite-sales", async (req, res) => {
  try {
    const partners = await Partner.find({ $or: [{ workspaceId: req.auth.workspaceId }, { workspaceId: null }] }).select("_id").lean();
    const sales = await AffiliateSale.find({ partnerId: { $in: partners.map((partner) => partner._id) } }).populate("partnerId", "name commissionRate").sort({ purchasedAt: -1, createdAt: -1 }).limit(Math.min(100, Number(req.query.limit) || 25)).lean();
    return res.json(sales);
  } catch (_error) { return res.status(500).json({ message: "Unable to load affiliate sales." }); }
});
router.post("/eventbrite-links", async (req, res) => {
  try {
    const event = await Event.findById(req.body?.localEventId);
    if (!event) return res.status(404).json({ message: "Choose a valid event." });
    const eventbriteEventId = String(event.integrations?.eventbrite?.eventId || "").trim();
    const eventUrl = String(event.integrations?.eventbrite?.url || "").trim();
    if (!eventbriteEventId || !eventUrl) return res.status(400).json({ message: "Choose an event that is connected to Eventbrite." });
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Partner name is required." });
    const referralCode = trackingCode(req.body?.referralCode || name);
    if (referralCode.length < 3) return res.status(400).json({ message: "Use an affiliate code with at least 3 letters or numbers." });
    const duplicate = await Partner.findOne({ eventbriteEventId, referralCode: new RegExp(`^${referralCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (duplicate) return res.status(409).json({ message: "That affiliate code is already being used for this event." });
    const referralLink = eventbriteAffiliateUrl(eventUrl, referralCode);
    const partner = await Partner.create({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.user?._id || null,
      name,
      company: String(req.body?.company || "").trim(),
      email: String(req.body?.email || "").trim(),
      phone: String(req.body?.phone || "").trim(),
      type: "affiliate",
      localEventId: event._id,
      eventbriteEventId,
      eventName: event.name,
      trackingProvider: "eventbrite",
      referralCode,
      referralLink,
      commissionRate: Math.min(100, Math.max(0, Number(req.body?.commissionRate) || 0)),
      notes: String(req.body?.notes || "").trim(),
    });
    return res.status(201).json(partner);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to create the Eventbrite affiliate link." });
  }
});
router.post("/eventbrite-links/:id/sync", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    if (!partner.localEventId || partner.trackingProvider !== "eventbrite") return res.status(400).json({ message: "This partner is not linked to an Eventbrite event." });
    await syncEvent(partner.localEventId);
    return res.json(await Partner.findById(partner._id));
  } catch (error) {
    await Partner.updateOne({ _id: req.params.id }, { $set: { lastSyncedAt: new Date(), lastSyncStatus: "failed", lastSyncError: error.response?.data?.error_description || error.message || "Unable to sync affiliate sales." } }).catch(() => {});
    return res.status(400).json({ message: error.response?.data?.error_description || error.message || "Unable to sync affiliate sales." });
  }
});
router.post("/", async (req, res) => { try { const partner = await Partner.create(req.body); res.status(201).json(partner); } catch (err) { res.status(400).json({ message: err.message || "Unable to create partner" }); } });
router.patch("/:id", async (req, res) => { try { const partner = await Partner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!partner) return res.status(404).json({ message: "Partner not found" }); res.json(partner); } catch { res.status(400).json({ message: "Unable to update partner" }); } });
module.exports = router;
