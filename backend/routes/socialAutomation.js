const express = require("express");
const { requireCapability } = require("../middleware/auth");
const Contact = require("../models/Contact");
const SocialAutomation = require("../models/SocialAutomation");
const SocialIdentity = require("../models/SocialIdentity");
const SocialProviderEvent = require("../models/SocialProviderEvent");
const SocialConnection = require("../models/SocialConnection");
const TrackedLink = require("../models/TrackedLink");
const CrmActivity = require("../models/CrmActivity");
const Campaign = require("../models/Campaign");
const { runWithWorkspace } = require("../tenancy/workspaceContext");
const { SUPPORTED_TRIGGERS, createTrackedLink, normalizedKeywords } = require("../services/socialLeadAutomationService");

const router = express.Router();
const adminOnly = requireCapability("social.manage");
const CAPABILITIES = {
  instagram: { connection: "native_meta", inboundDm: true, outboundReply: true, commentTrigger: true, commentKeyword: true, storyReply: true, followToDm: false, leadForm: true, ctaAttribution: true, likesViewsSaves: false },
  facebook: { connection: "native_meta", inboundDm: true, outboundReply: true, commentTrigger: true, commentKeyword: true, storyReply: false, followToDm: false, leadForm: true, ctaAttribution: true, likesViewsSaves: false },
  tiktok: { connection: "not_configured", inboundDm: false, outboundReply: false, commentTrigger: false, commentKeyword: false, storyReply: false, followToDm: false, leadForm: true, ctaAttribution: true, likesViewsSaves: false },
  linkedin: { connection: "human_assisted", inboundDm: false, outboundReply: false, commentTrigger: false, commentKeyword: false, storyReply: false, followToDm: false, leadForm: "approved_marketing_partner_only", ctaAttribution: true, likesViewsSaves: false },
  x: { connection: "not_configured", inboundDm: false, outboundReply: false, commentTrigger: false, commentKeyword: false, storyReply: false, followToDm: false, leadForm: false, ctaAttribution: true, likesViewsSaves: false },
};

router.use((req, res, next) => req.path.startsWith("/t/") ? next() : adminOnly(req, res, next));

router.get("/overview", async (_req, res) => {
  const [connections, automationCount, leadCount, recentEvents] = await Promise.all([SocialConnection.find({}).lean(), SocialAutomation.countDocuments({}), SocialIdentity.countDocuments({}), SocialProviderEvent.find({}).select("provider eventType occurredAt processingStatus reply.status reply.error contactId").populate("contactId", "name").sort({ occurredAt: -1 }).limit(30).lean()]);
  res.json({ success: true, data: { capabilities: CAPABILITIES, supportedTriggers: SUPPORTED_TRIGGERS, manyChat: { required: false, reason: "Native Meta supports the Phase 7 DM, story reply, comment webhook, keyword, and permitted private-reply flows. Follow-to-DM remains unsupported and optional." }, connections, recentEvents, counts: { automations: automationCount, socialLeads: leadCount } } });
});

router.get("/automations", async (_req, res) => res.json({ success: true, data: await SocialAutomation.find({}).populate("campaignId", "name").sort({ updatedAt: -1 }).lean() }));
router.get("/history", async (_req, res) => res.json({ success: true, data: await SocialProviderEvent.find({}).select("provider eventType occurredAt processingStatus reply.status reply.error contactId").populate("contactId", "name").sort({ occurredAt: -1 }).limit(50).lean() }));

router.post("/automations", async (req, res) => {
  const provider = String(req.body?.provider || "").toLowerCase();
  const triggerType = String(req.body?.triggerType || "");
  if (!SUPPORTED_TRIGGERS[provider]?.includes(triggerType) || !["instagram", "facebook"].includes(provider)) return res.status(400).json({ error: "This provider trigger is not supported by the native connection", code: "TRIGGER_UNSUPPORTED" });
  if (!req.body?.assetId || !req.body?.name) return res.status(400).json({ error: "Name and connected asset are required" });
  if (["comment_keyword", "dm_keyword"].includes(triggerType) && !normalizedKeywords(req.body.keywords).length) return res.status(400).json({ error: "At least one keyword is required" });
  const asset = await SocialConnection.findOne({ provider: provider === "instagram" ? { $in: ["meta", "instagram"] } : "meta", status: "connected", selectedAssetIds: String(req.body.assetId), "assets": { $elemMatch: { id: String(req.body.assetId), type: provider === "instagram" ? "instagram_business" : "facebook_page" } } }).lean();
  if (!asset) return res.status(400).json({ error: "The selected Meta asset is not connected to this workspace" });
  if (req.body.campaignId && !await Campaign.exists({ _id: req.body.campaignId })) return res.status(400).json({ error: "Campaign is not in this workspace" });
  if (req.body.cta?.destination) { try { if (new URL(req.body.cta.destination).protocol !== "https:") throw new Error(); } catch { return res.status(400).json({ error: "CTA destination must be a valid HTTPS URL" }); } }
  const record = await SocialAutomation.create({ name: req.body.name, provider, assetId: String(req.body.assetId), contentId: String(req.body.contentId || ""), triggerType, keywords: normalizedKeywords(req.body.keywords), responseTemplate: String(req.body.responseTemplate || ""), cta: req.body.cta || {}, campaignId: req.body.campaignId || null, tags: normalizedKeywords(req.body.tags), qualification: normalizedKeywords(req.body.qualification), enabled: req.body.enabled === true, createdBy: req.auth.userId, updatedBy: req.auth.userId });
  res.status(201).json({ success: true, data: record });
});

router.patch("/automations/:id", async (req, res) => {
  const record = await SocialAutomation.findById(req.params.id);
  if (!record) return res.status(404).json({ error: "Social automation not found" });
  if (req.body.campaignId && !await Campaign.exists({ _id: req.body.campaignId })) return res.status(400).json({ error: "Campaign is not in this workspace" });
  if (req.body.cta?.destination) { try { if (new URL(req.body.cta.destination).protocol !== "https:") throw new Error(); } catch { return res.status(400).json({ error: "CTA destination must be a valid HTTPS URL" }); } }
  for (const key of ["name", "contentId", "responseTemplate", "campaignId", "enabled"]) if (req.body[key] !== undefined) record[key] = req.body[key];
  if (req.body.keywords) record.keywords = normalizedKeywords(req.body.keywords);
  if (req.body.tags) record.tags = normalizedKeywords(req.body.tags);
  if (req.body.qualification) record.qualification = normalizedKeywords(req.body.qualification);
  if (req.body.cta) record.cta = req.body.cta;
  record.updatedBy = req.auth.userId;
  await record.save();
  res.json({ success: true, data: record });
});

router.get("/leads", async (req, res) => {
  const identities = await require("../services/socialLeadInboxService").list(req.auth.workspaceId, req.query);
  res.json({ success: true, data: identities });
});

router.get("/leads/:contactId", async (req, res) => {
  const [contact, identities, events] = await Promise.all([Contact.findById(req.params.contactId).lean(), SocialIdentity.find({ contactId: req.params.contactId }).lean(), SocialProviderEvent.find({ contactId: req.params.contactId }).sort({ occurredAt: -1 }).limit(100).lean()]);
  if (!contact) return res.status(404).json({ error: "Social lead not found" });
  res.json({ success: true, data: { contact, identities, events } });
});

router.post("/tracked-links", async (req, res) => {
  if (req.body.contactId && !await Contact.exists({ _id: req.body.contactId })) return res.status(400).json({ error: "Contact is not in this workspace" });
  try {
    const link = await createTrackedLink({ destination: req.body.destination, provider: req.body.provider, contactId: req.body.contactId || null, campaignId: req.body.campaignId || null, automationId: req.body.automationId || null, assetId: String(req.body.assetId || ""), contentId: String(req.body.contentId || ""), referralCode: String(req.body.referralCode || ""), utm: req.body.utm || {} }, req.auth.userId);
    res.status(201).json({ success: true, data: { ...link.toObject(), url: `${String(process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "")}/api/social-automation/t/${link.token}` } });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// This handler is mounted before role middleware in server.js. The token is
// random, contains no PII, and redirects only to an allowlisted destination.
router.get("/t/:token", async (req, res) => {
  const link = await TrackedLink.findOne({ token: req.params.token }).lean();
  if (!link || (link.expiresAt && new Date(link.expiresAt) < new Date())) return res.status(404).send("Link unavailable");
  const clickedAt = new Date();
  await runWithWorkspace(link.workspaceId, async () => {
    await TrackedLink.updateOne({ _id: link._id }, { $inc: { clickCount: 1 }, $set: { lastClickedAt: clickedAt, ...(!link.firstClickedAt ? { firstClickedAt: clickedAt } : {}) } });
    await CrmActivity.create({ contactId: link.contactId || null, campaignId: link.campaignId || null, type: "system", title: "Social tracked link clicked", source: "integration", metadata: { eventType: "social.link.clicked", provider: link.provider, contentId: link.contentId || "", trackedLinkId: link._id, anonymous: !link.contactId } });
  });
  const destination = new URL(link.destination);
  const params = { utm_source: link.utm?.source || link.provider, utm_medium: link.utm?.medium || "social", utm_campaign: link.utm?.campaign || "", utm_content: link.utm?.content || link.contentId || "", utm_term: link.utm?.term || "", go_link: link.token, referral: link.referralCode || "" };
  for (const [key, value] of Object.entries(params)) if (value) destination.searchParams.set(key, value);
  res.redirect(302, destination.toString());
});

module.exports = router;
module.exports.CAPABILITIES = CAPABILITIES;
