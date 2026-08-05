const express = require("express");

const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const DiscoveryRun = require("../models/DiscoveryRun");
const MarketResearchJob = require("../models/MarketResearchJob");
const PeopleResearchPreview = require("../models/PeopleResearchPreview");
const IntentSignal = require("../models/IntentSignal");
const ResearchMonitor = require("../models/ResearchMonitor");
const MonitorActivity = require("../models/MonitorActivity");
const InAppNotification = require("../models/InAppNotification");
const IntentEmailDraft = require("../models/IntentEmailDraft");
const Campaign = require("../models/Campaign");
const Outreach = require("../models/Outreach");

const {
  discoverAudienceSources,
  discoverOrganizationsForAudience,
} = require("../services/audience");
const { previewOrganizationImport, importOrganizations } = require("../services/organizationImportService");
const { compileMarketQuestion } = require("../services/marketResearchService");
const { sourceStatus } = require("../services/businessDataSourceService");
const { runMarketResearchJob } = require("../services/externalMarketResearchService");
const { buyerIntentAssessment, requestResearchMonitorRun, runResearchMonitor, scoreSignal } = require("../services/researchMonitorService");
const { ensureLinks, generateIntentEmailDraft } = require("../services/intentEmailDraftService");

const AUGUST_22_PRESET = {
  id: "august-22-nationwide-online-event",
  name: "August 22 nationwide online event",
  query: "People across the United States showing current interest in starting, buying, growing, or systemizing a business or building wealth through real estate before the August 22 online event.",
  locations: ["United States"],
  negativeKeywords: ["student assignment", "homework", "hypothetical", "job seeker", "hiring", "my course", "promo code", "video game"],
  intentCategories: [
    { name: "Career transition", phrases: ["leave my W-2", "quit my job", "replace my income", "become my own boss"] },
    { name: "Business ownership", phrases: ["start a business", "buy a business", "first business", "entrepreneur community"] },
    { name: "Growth and systems", phrases: ["scale my business", "need business systems", "stuck in my business", "looking for a business coach"] },
    { name: "Real estate wealth", phrases: ["real estate investor", "multifamily investing", "grow my real estate portfolio", "start an investment company"] },
  ],
  feedUrls: ["https://www.biggerpockets.com/forums"],
  intervalMinutes: 30,
};

const router = express.Router();
const RECOMMENDED_MONITOR_SOURCES = ["bing_web", "bing_news", "sec_form_d", "hacker_news", "stack_exchange", "reddit_rss"];

router.get("/research/sources", (_req, res) => {
  return res.json({
    success: true,
    sources: [sourceStatus()],
    automaticSources: [
      { id: "google_web", name: "Google Programmable Search (entire public web)", accountRequired: true, configured: Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) },
      { id: "bing_web", name: "Open web (Bing RSS)", accountRequired: false },
      { id: "bing_news", name: "Bing News RSS", accountRequired: false },
      { id: "gdelt", name: "Worldwide news (GDELT)", accountRequired: false },
      { id: "sec_form_d", name: "SEC EDGAR Form D filings", accountRequired: false },
      { id: "bluesky", name: "Public Bluesky posts", accountRequired: false },
      { id: "hacker_news", name: "Hacker News discussions", accountRequired: false },
      { id: "stack_exchange", name: "Stack Exchange questions", accountRequired: false },
      { id: "reddit_rss", name: "Public Reddit search feeds", accountRequired: false, availability: "best_effort" },
      { id: "duckduckgo", name: "Open-web discovery (DuckDuckGo)", accountRequired: false, availability: "best_effort" },
      { id: "rss", name: "Public RSS and Atom feeds", accountRequired: false },
      { id: "discourse", name: "Public Discourse communities", accountRequired: false },
    ],
  });
});

router.get("/research/monitors", async (req, res) => {
  const monitors = await ResearchMonitor.find({ workspaceId: req.auth.workspaceId }).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, monitors });
});

router.get("/research/monitor-presets", (_req, res) => res.json({ success: true, presets: [AUGUST_22_PRESET] }));

router.post("/research/monitors", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    if (query.length < 5) return res.status(400).json({ success: false, error: "Describe the intent or audience to monitor." });
    const allowedSources = new Set(["google_web", "bing_web", "bing_news", "gdelt", "sec_form_d", "bluesky", "hacker_news", "stack_exchange", "discourse", "rss", "reddit_rss", "duckduckgo"]);
    const requestedSources = Array.isArray(req.body?.sources) ? req.body.sources.filter((source) => allowedSources.has(source)) : [];
    const monitor = await ResearchMonitor.create({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.user?._id || null,
      name: String(req.body?.name || query).trim().slice(0, 160),
      query,
      keywords: (req.body?.keywords || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 50),
      intentCategories: (req.body?.intentCategories || []).slice(0, 12).map((category) => ({ name: String(category.name || "Intent").trim().slice(0, 80), phrases: (category.phrases || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 30) })),
      negativeKeywords: (req.body?.negativeKeywords || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 50),
      locations: (req.body?.locations || []).map(String).map((value) => value.trim()).filter(Boolean).slice(0, 25),
      sources: requestedSources.length ? requestedSources : RECOMMENDED_MONITOR_SOURCES,
      feedUrls: (req.body?.feedUrls || []).map(String).filter((url) => /^https:\/\//i.test(url)).slice(0, 30),
      intervalMinutes: Math.min(10080, Math.max(15, Number(req.body?.intervalMinutes) || 60)),
      maxResultsPerSource: Math.min(100, Math.max(5, Number(req.body?.maxResultsPerSource) || 25)),
      nextRunAt: new Date(),
      runRequestedAt: new Date(),
      sourceHealth: (requestedSources.length ? requestedSources : RECOMMENDED_MONITOR_SOURCES).map((source) => ({ source, enabled: true, state: "never", nextScheduledAttempt: new Date() })),
    });
    // A new monitor always performs its first check immediately. The selected
    // interval controls subsequent checks, not the initial one.
    setImmediate(() => runResearchMonitor(monitor._id).catch((error) => {
      console.error("Immediate first monitor run failed:", error.message || error);
    }));
    return res.status(201).json({ success: true, monitor });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to create the monitor." });
  }
});

router.patch("/research/monitors/:monitorId", async (req, res) => {
  const allowed = ["name", "query", "keywords", "intentCategories", "negativeKeywords", "locations", "sources", "feedUrls", "enabled", "intervalMinutes", "maxResultsPerSource"];
  const update = Object.fromEntries(allowed.filter((key) => req.body?.[key] !== undefined).map((key) => [key, req.body[key]]));
  if (update.enabled === true) update.nextRunAt = new Date();
  const monitor = await ResearchMonitor.findOneAndUpdate({ _id: req.params.monitorId, workspaceId: req.auth.workspaceId }, { $set: update }, { new: true, runValidators: true });
  if (!monitor) return res.status(404).json({ success: false, error: "Monitor not found." });
  return res.json({ success: true, monitor });
});

router.delete("/research/monitors/:monitorId", async (req, res) => {
  const monitor = await ResearchMonitor.findOneAndDelete({ _id: req.params.monitorId, workspaceId: req.auth.workspaceId });
  if (!monitor) return res.status(404).json({ success: false, error: "Monitor not found." });
  await Promise.all([
    MonitorActivity.deleteMany({ workspaceId: req.auth.workspaceId, monitorId: monitor._id }),
    InAppNotification.deleteMany({ workspaceId: req.auth.workspaceId, monitorId: monitor._id }),
  ]);
  return res.json({ success: true, deleted: String(monitor._id) });
});

router.post("/research/monitors/:monitorId/run", async (req, res) => {
  const monitor = await ResearchMonitor.findOne({ _id: req.params.monitorId, workspaceId: req.auth.workspaceId });
  if (!monitor) return res.status(404).json({ success: false, error: "Monitor not found." });
  if (monitor.lastRunStatus === "running") return res.status(409).json({ success: false, error: "This monitor is already running." });
  const queued = await requestResearchMonitorRun(monitor._id);
  return res.status(202).json({ success: true, monitor: { ...queued.toObject(), lastRunStatus: "queued" } });
});

router.get("/research/activity", async (req, res) => {
  const filter = { workspaceId: req.auth.workspaceId };
  if (req.query.monitorId) filter.monitorId = req.query.monitorId;
  const activity = await MonitorActivity.find(filter).sort({ createdAt: -1 }).limit(Math.min(250, Number(req.query.limit) || 100)).lean();
  return res.json({ success: true, activity });
});

router.get("/research/notifications", async (req, res) => {
  const notifications = await InAppNotification.find({ workspaceId: req.auth.workspaceId }).sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, notifications, unread: notifications.filter((item) => !item.readAt).length });
});

router.patch("/research/notifications/:notificationId", async (req, res) => {
  const notification = await InAppNotification.findOneAndUpdate({ _id: req.params.notificationId, workspaceId: req.auth.workspaceId }, { $set: { readAt: req.body?.read === false ? null : new Date() } }, { new: true });
  if (!notification) return res.status(404).json({ success: false, error: "Notification not found." });
  return res.json({ success: true, notification });
});

router.delete("/research/notifications", async (req, res) => {
  const result = await InAppNotification.deleteMany({ workspaceId: req.auth.workspaceId });
  return res.json({ success: true, deleted: result.deletedCount || 0 });
});

router.get("/research/signals", async (req, res) => {
  const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
  const filter = { workspaceId: req.auth.workspaceId };
  if (req.query.monitorId) filter.monitorId = req.query.monitorId;
  if (req.query.status) filter.status = req.query.status;
  const signals = await IntentSignal.find(filter).sort({ score: -1, publishedAt: -1, discoveredAt: -1 }).limit(limit).lean();
  const monitorIds = [...new Set(signals.map((signal) => String(signal.monitorId || "")).filter(Boolean))];
  const monitorMap = new Map((await ResearchMonitor.find({ _id: { $in: monitorIds } }).lean()).map((monitor) => [String(monitor._id), monitor]));
  const assessed = signals.map((signal) => ({ signal, eligibility: buyerIntentAssessment(signal), ranking: monitorMap.has(String(signal.monitorId)) ? scoreSignal(signal, monitorMap.get(String(signal.monitorId))) : null }));
  const rejected = assessed.filter((item) => !item.eligibility.eligible || (item.ranking && item.ranking.score < 45));
  if (rejected.length) await Promise.all(rejected.map(({ signal, eligibility }) => IntentSignal.updateOne({ _id: signal._id }, { $set: { audienceEligible: false, audienceRejectionReason: eligibility.reason, status: "dismissed", classification: "irrelevant", classificationReason: eligibility.reason } })));
  const accepted = assessed.filter((item) => item.eligibility.eligible && (!item.ranking || item.ranking.score >= 45) && item.signal.audienceEligible !== false);
  if (accepted.length) await Promise.all(accepted.filter((item) => item.ranking && (item.signal.score !== item.ranking.score || JSON.stringify(item.signal.scoreReasons || []) !== JSON.stringify(item.ranking.reasons))).map(({ signal, ranking }) => IntentSignal.updateOne({ _id: signal._id }, { $set: { score: ranking.score, scoreReasons: ranking.reasons } })));
  const acceptedSignals = accepted.map(({ signal, ranking }) => ranking ? { ...signal, score: ranking.score, scoreReasons: ranking.reasons } : signal);
  const drafts = await IntentEmailDraft.find({ workspaceId: req.auth.workspaceId, signalId: { $in: acceptedSignals.map((signal) => signal._id) } }).sort({ updatedAt: -1 }).lean();
  const draftsBySignal = new Map();
  drafts.forEach((draft) => { const key = String(draft.signalId); draftsBySignal.set(key, [...(draftsBySignal.get(key) || []), draft]); });
  const contacts = await Contact.find({
    sourceProvider: "intent_monitor",
    providerContactId: { $in: acceptedSignals.map((signal) => String(signal._id)) },
  }).select("name email emailStatus company title researchStatus stage providerContactId website").lean();
  const contactsBySignal = new Map(contacts.map((contact) => [String(contact.providerContactId), contact]));
  return res.json({ success: true, signals: acceptedSignals.map((signal) => ({
    ...signal,
    emailDrafts: draftsBySignal.get(String(signal._id)) || [],
    crmContact: contactsBySignal.get(String(signal._id)) || null,
  })), automaticallyRejected: rejected.length });
});

router.patch("/research/signals/:signalId", async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["new", "reviewing", "qualified", "dismissed"].includes(status)) return res.status(400).json({ success: false, error: "Choose a valid review status." });
  const signal = await IntentSignal.findOneAndUpdate({ _id: req.params.signalId, workspaceId: req.auth.workspaceId }, { $set: { status } }, { new: true });
  if (!signal) return res.status(404).json({ success: false, error: "Signal not found." });
  if (status === "qualified") await InAppNotification.create({ workspaceId: req.auth.workspaceId, userId: req.auth.user?._id || null, monitorId: signal.monitorId, signalId: signal._id, type: "qualified_lead", title: "Qualified lead ready for review", message: `${signal.title || "A public lead"} was qualified. CRM import still requires individual approval.` });
  return res.json({ success: true, signal });
});

router.post("/research/signals/:signalId/convert", async (req, res) => {
  const signal = await IntentSignal.findOne({ _id: req.params.signalId, workspaceId: req.auth.workspaceId });
  if (!signal) return res.status(404).json({ success: false, error: "Signal not found." });
  const name = String(req.body?.name || signal.authorName || "").trim();
  if (!name) return res.status(400).json({ success: false, error: "Add the person's name before creating a CRM lead." });
  if (/^(?:\/?u\/|@|https?:\/\/)/i.test(name)) return res.status(400).json({ success: false, error: "A public username is not a verified real name. Research and enter the person's real name before creating the CRM record." });
  const organizationName = String(req.body?.company || signal.organizationName || signal.organizationDomain || "").trim();
  if (organizationName && signal.identityResolution?.status !== "supported") return res.status(400).json({ success: false, error: "The company connection is not supported by public evidence. Add this lead without a company or review the source first." });
  let organization = null;
  if (organizationName) {
    const identity = signal.organizationDomain ? { workspaceId: req.auth.workspaceId, domain: signal.organizationDomain } : { workspaceId: req.auth.workspaceId, name: organizationName };
    organization = await Organization.findOneAndUpdate(identity, { $set: { workspaceId: req.auth.workspaceId, name: organizationName, domain: signal.organizationDomain || null, source: "public_web", website: signal.organizationDomain ? `https://${signal.organizationDomain}` : "", lastResearchVerifiedAt: new Date() }, $addToSet: { researchEvidence: { sourceType: signal.source, sourceUrl: signal.sourceUrl, field: "intent_signal", observedValue: signal.title, observedAt: new Date() } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  const parts = name.split(/\s+/);
  const contact = await Contact.findOneAndUpdate(
    { sourceProvider: "intent_monitor", providerContactId: String(signal._id) },
    { $set: { name, firstName: parts[0] || "", lastName: parts.slice(1).join(" "), company: organizationName, organizationId: organization?._id || null, sourceProvider: "intent_monitor", providerContactId: String(signal._id), providerRecordId: signal.sourceId, sources: ["public_web", signal.source], status: "active", type: "lead", stage: "Needs Research", researchStatus: "needs_research", qualifyContact: true, tags: ["intent-signal", signal.source], website: signal.sourceUrl, notes: `Public intent signal: ${signal.title}\nSource: ${signal.sourceUrl}` } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  signal.status = "converted";
  await signal.save();
  return res.status(201).json({ success: true, contact, organization });
});

function campaignRegistrationLinks(campaign) {
  return {
    eventbriteUrl: String(campaign.registrationLinks?.eventbrite?.url || campaign.eventId?.integrations?.eventbrite?.url || "").trim(),
    meetupUrl: String(campaign.registrationLinks?.meetup?.url || campaign.eventId?.integrations?.meetup?.url || "").trim(),
  };
}

router.post("/research/signals/:signalId/email-drafts", async (req, res) => {
  try {
    const signal = await IntentSignal.findOne({ _id: req.params.signalId, workspaceId: req.auth.workspaceId });
    if (!signal) return res.status(404).json({ success: false, error: "Signal not found." });
    if (!['qualified', 'converted'].includes(signal.status)) return res.status(400).json({ success: false, error: "Save this as a possible lead before creating an email draft." });
    const campaign = await Campaign.findById(req.body?.campaignId).populate("eventId");
    if (!campaign) return res.status(404).json({ success: false, error: "Choose a valid event campaign." });
    const links = campaignRegistrationLinks(campaign);
    const missing = [!links.eventbriteUrl && "Eventbrite", !links.meetupUrl && "Meetup"].filter(Boolean);
    if (missing.length) return res.status(400).json({ success: false, error: `Add the ${missing.join(" and ")} link${missing.length === 1 ? "" : "s"} to this campaign before generating drafts. Every intent draft must include both registration links.` });
    const generated = await generateIntentEmailDraft(signal.toObject(), campaign.toObject(), links);
    const draft = await IntentEmailDraft.findOneAndUpdate(
      { workspaceId: req.auth.workspaceId, signalId: signal._id, campaignId: campaign._id },
      { $set: { ...generated, ...links, body: ensureLinks(generated.body, links.eventbriteUrl, links.meetupUrl), status: "draft", reviewedAt: null, outreachId: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return res.status(201).json({ success: true, draft });
  } catch (error) { return res.status(400).json({ success: false, error: error.message || "Unable to generate the personalized draft." }); }
});

router.patch("/research/signals/:signalId/email-drafts/:draftId", async (req, res) => {
  const existing = await IntentEmailDraft.findOne({ _id: req.params.draftId, signalId: req.params.signalId, workspaceId: req.auth.workspaceId });
  if (!existing) return res.status(404).json({ success: false, error: "Email draft not found." });
  if (existing.status === "transferred") return res.status(409).json({ success: false, error: "This draft is already in Outreach." });
  if (req.body?.subject !== undefined) existing.subject = String(req.body.subject).trim().slice(0, 300);
  if (req.body?.body !== undefined) existing.body = ensureLinks(String(req.body.body), existing.eventbriteUrl, existing.meetupUrl);
  if (!existing.subject || !existing.body) return res.status(400).json({ success: false, error: "The subject and email body are required." });
  if (req.body?.status === "reviewed") { existing.status = "reviewed"; existing.reviewedAt = new Date(); }
  else existing.status = "draft";
  await existing.save();
  return res.json({ success: true, draft: existing });
});

router.post("/research/signals/:signalId/email-drafts/:draftId/transfer", async (req, res) => {
  const draft = await IntentEmailDraft.findOne({ _id: req.params.draftId, signalId: req.params.signalId, workspaceId: req.auth.workspaceId });
  if (!draft) return res.status(404).json({ success: false, error: "Email draft not found." });
  if (draft.status !== "reviewed") return res.status(400).json({ success: false, error: "Review and save the draft before moving it to Outreach." });
  const contact = await Contact.findOne({ sourceProvider: "intent_monitor", providerContactId: String(req.params.signalId) });
  if (!contact) return res.status(400).json({ success: false, error: "Add this person to the CRM and complete identity research before moving the draft to Outreach." });
  if (!contact.email || contact.emailStatus !== "verified") return res.status(400).json({ success: false, error: "A verified email is required before a draft can enter Outreach. Published or guessed emails are not sufficient." });
  await Contact.updateOne({ _id: contact._id }, { $addToSet: { campaignIds: draft.campaignId } });
  const escapedBody = String(draft.body).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const outreach = await Outreach.findOneAndUpdate(
    { campaignId: draft.campaignId, contactEmail: contact.email.toLowerCase().trim() },
    { $set: { campaignId: draft.campaignId, contactId: contact._id, organization: contact.company || contact.name || "Individual lead", contactName: contact.name || contact.firstName || "", contactEmail: contact.email.toLowerCase().trim(), contactRole: contact.title || "", reason: "Evidence-backed public buyer-intent signal", subject: draft.subject, emailDraft: draft.body, htmlBody: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">${escapedBody}</div>`, eventLink: draft.eventbriteUrl, status: "pending", errorMessage: "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  draft.status = "transferred"; draft.outreachId = outreach._id; await draft.save();
  return res.status(201).json({ success: true, draft, outreach, message: "Draft moved to Outreach as pending review. Nothing was sent." });
});

router.post("/research/plan", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (question.length < 8 || question.length > 1000) {
      return res.status(400).json({ success: false, error: "Enter a market question between 8 and 1,000 characters." });
    }
    const plan = await compileMarketQuestion(question);
    return res.json({ success: true, plan });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to build a research plan." });
  }
});

router.get("/research/history", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const audiences = await Audience.find({ workspaceId: req.auth.workspaceId })
      .select("name description status source totalOrgs lastDiscoveredAt createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const audienceIds = audiences.map((audience) => audience._id);
    const jobs = await MarketResearchJob.find({ workspaceId: req.auth.workspaceId, audienceId: { $in: audienceIds } })
      .select("audienceId question sourceId status statistics error startedAt completedAt createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    const latestJobByAudience = new Map();
    jobs.forEach((job) => {
      const key = String(job.audienceId || "");
      if (key && !latestJobByAudience.has(key)) latestJobByAudience.set(key, job);
    });
    return res.json({
      success: true,
      history: audiences.map((audience) => ({
        ...audience,
        job: latestJobByAudience.get(String(audience._id)) || null,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, error: "Unable to load saved research history." });
  }
});

router.get("/research/people-previews", async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const previews = await PeopleResearchPreview.find({ workspaceId: req.auth.workspaceId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, previews });
  } catch (_error) {
    return res.status(500).json({ success: false, error: "Unable to load staged people research." });
  }
});

router.get("/research/results/:audienceId", async (req, res) => {
  try {
    const audience = await Audience.findOne({ _id: req.params.audienceId, workspaceId: req.auth.workspaceId }).lean();
    if (!audience) return res.status(404).json({ success: false, error: "Research list not found." });
    const organizations = await Organization.find({ _id: { $in: audience.organizationIds || [] }, workspaceId: req.auth.workspaceId })
      .sort({ audienceScore: -1, name: 1 })
      .limit(500)
      .lean();
    return res.json({ success: true, audience, organizations });
  } catch (error) {
    return res.status(400).json({ success: false, error: "Unable to load research results." });
  }
});

router.get("/research/results/:audienceId/people", async (req, res) => {
  const audience = await Audience.findOne({ _id: req.params.audienceId, workspaceId: req.auth.workspaceId }).lean();
  if (!audience) return res.status(404).json({ success: false, error: "Research list not found." });
  const organizations = await Organization.find({ _id: { $in: audience.organizationIds || [] }, workspaceId: req.auth.workspaceId })
    .select("name domain decisionMakers")
    .lean();
  const people = organizations.flatMap((organization) => (organization.decisionMakers || []).map((person) => ({
    ...person,
    organizationId: organization._id,
    company: organization.name,
    domain: organization.domain,
    verificationRequired: Boolean(person.email && person.emailStatus !== "verified"),
  })));
  return res.json({ success: true, people });
});

router.post("/research/run", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const plan = req.body?.plan || await compileMarketQuestion(question);
    const maxResults = Math.min(5000, Math.max(1, Number(req.body?.maxResults) || 1000));
    const status = sourceStatus();
    const audience = await Audience.create({
      workspaceId: req.auth.workspaceId,
      name: String(plan.name || "Growth Operator market research").slice(0, 160),
      description: String(plan.summary || question),
      source: "ai",
      criteria: plan.criteria || {},
    });
    const job = await MarketResearchJob.create({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.user?._id || null,
      audienceId: audience._id,
      question: question || plan.summary || plan.name,
      plan,
      sourceId: status.id,
      status: status.configured ? "queued" : "source_required",
      error: status.configured ? "" : status.message,
    });
    if (status.configured) setImmediate(() => runMarketResearchJob(job._id, { maxResults }).catch(() => {}));
    return res.status(202).json({ success: true, job, audience, source: status });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to start market research." });
  }
});

router.get("/research/jobs/:jobId", async (req, res) => {
  const job = await MarketResearchJob.findOne({ _id: req.params.jobId, workspaceId: req.auth.workspaceId }).lean();
  if (!job) return res.status(404).json({ success: false, error: "Research job not found." });
  return res.json({ success: true, job });
});

// ===================================================================
// AUDIENCE CRUD ROUTES
// ===================================================================

// ======================================
// LIST AUDIENCES
// ======================================

router.get("/", async (req, res) => {
  try {
    const {
      status,
      source,
      sort = "recent",
      page = "1",
      limit = "25",
    } = req.query;

    const filter = { workspaceId: req.auth.workspaceId };

    if (status) {
      const validStatuses = ["draft", "active", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      filter.status = status;
    }

    if (source) {
      const validSources = ["manual", "ai", "import"];
      if (!validSources.includes(source)) {
        return res.status(400).json({
          success: false,
          error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
        });
      }
      filter.source = source;
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Sort (newest first by default)
    const sortMap = {
      recent: { createdAt: -1 },
      name: { name: 1 },
    };
    const sortOrder = sortMap[sort] || sortMap.recent;

    const [audiences, totalResults] = await Promise.all([
      Audience.find(filter)
        .select(
          "name status source totalOrgs lastDiscoveredAt createdAt updatedAt",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Audience.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      audiences,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET / error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve audiences",
    });
  }
});

router.post("/imports/organizations/preview", async (req, res) => {
  try {
    const data = await previewOrganizationImport(req.body?.rows);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to preview organizations" });
  }
});

router.post("/imports/organizations", async (req, res) => {
  try {
    const data = await importOrganizations({ rows: req.body?.rows, name: req.body?.name });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to import organizations" });
  }
});

// ======================================
// GET AUDIENCE DETAILS
// ======================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const audience = await Audience.findById(id).lean();

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Get latest DiscoveryRun
    const latestDiscoveryRun = await DiscoveryRun.findOne({ audienceId: id })
      .sort({ createdAt: -1 })
      .select(
  "status statistics scoreDistribution completedAt startedAt errorDetails pagination",
      )
      .lean();

    return res.json({
      success: true,
      audience: {
        ...audience,
        organizationIdsCount: audience.organizationIds?.length || 0,
      },
      latestDiscoveryRun: latestDiscoveryRun || null,
    });
  } catch (error) {
    console.error("GET /:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve audience",
    });
  }
});

// ======================================
// CREATE AUDIENCE
// ======================================

router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      status = "draft",
      source = "manual",
      criteria,
    } = req.body;

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "name is required and must be a non-empty string",
      });
    }

    // Validate status
    const validStatuses = ["draft", "active", "archived"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate source
    const validSources = ["manual", "ai", "import"];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({
        success: false,
        error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
      });
    }

    // Validate criteria if provided
    if (criteria) {
      if (criteria.minimumScore !== undefined) {
        const score = Number(criteria.minimumScore);
        if (isNaN(score) || score < 0 || score > 100) {
          return res.status(400).json({
            success: false,
            error: "criteria.minimumScore must be a number between 0 and 100",
          });
        }
      }

      if (criteria.targetTier !== undefined && criteria.targetTier !== null) {
        const validTiers = ["high", "medium", "low", "unscored"];
        if (!validTiers.includes(criteria.targetTier)) {
          return res.status(400).json({
            success: false,
            error: `Invalid criteria.targetTier. Must be one of: ${validTiers.join(", ")}, or null`,
          });
        }
      }

      if (criteria.employeeRange) {
        const { min, max } = criteria.employeeRange;
        if (min !== null && max !== null && min > max) {
          return res.status(400).json({
            success: false,
            error: "criteria.employeeRange.min must be <= max",
          });
        }
      }
    }

    const audience = await Audience.create({
      workspaceId: req.auth.workspaceId,
      name: name.trim(),
      description: description ? description.trim() : "",
      status,
      source,
      criteria: criteria || {
        keywords: [],
        industries: [],
        locations: [],
        employeeRange: { min: null, max: null },
        minimumScore: 0,
        targetTier: null,
      },
    });

    return res.status(201).json({
      success: true,
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("POST / error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create audience",
    });
  }
});

// ======================================
// UPDATE AUDIENCE
// ======================================

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, criteria } = req.body;

    const audience = await Audience.findById(id);

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Do not allow updates to archived audiences
    if (audience.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "Cannot update archived audience",
      });
    }

    // Validate and update name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "name must be a non-empty string",
        });
      }
      audience.name = name.trim();
    }

    // Update description
    if (description !== undefined) {
      audience.description = description ? description.trim() : "";
    }

    // Validate and update status
    if (status !== undefined) {
      const validStatuses = ["draft", "active", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      audience.status = status;
    }

    // Validate and update criteria
    if (criteria !== undefined) {
      if (criteria.minimumScore !== undefined) {
        const score = Number(criteria.minimumScore);
        if (isNaN(score) || score < 0 || score > 100) {
          return res.status(400).json({
            success: false,
            error: "criteria.minimumScore must be a number between 0 and 100",
          });
        }
        audience.criteria.minimumScore = score;
      }

      if (criteria.targetTier !== undefined) {
        if (criteria.targetTier !== null) {
          const validTiers = ["high", "medium", "low", "unscored"];
          if (!validTiers.includes(criteria.targetTier)) {
            return res.status(400).json({
              success: false,
              error: `Invalid criteria.targetTier. Must be one of: ${validTiers.join(", ")}, or null`,
            });
          }
        }
        audience.criteria.targetTier = criteria.targetTier;
      }

      if (criteria.keywords !== undefined) {
        if (!Array.isArray(criteria.keywords)) {
          return res.status(400).json({
            success: false,
            error: "criteria.keywords must be an array",
          });
        }
        audience.criteria.keywords = criteria.keywords;
      }

      if (criteria.industries !== undefined) {
        if (!Array.isArray(criteria.industries)) {
          return res.status(400).json({
            success: false,
            error: "criteria.industries must be an array",
          });
        }
        audience.criteria.industries = criteria.industries;
      }

      if (criteria.locations !== undefined) {
        if (!Array.isArray(criteria.locations)) {
          return res.status(400).json({
            success: false,
            error: "criteria.locations must be an array",
          });
        }
        audience.criteria.locations = criteria.locations;
      }

      if (criteria.employeeRange !== undefined) {
        const { min, max } = criteria.employeeRange;
        if (min !== null && max !== null && min > max) {
          return res.status(400).json({
            success: false,
            error: "criteria.employeeRange.min must be <= max",
          });
        }
        audience.criteria.employeeRange = criteria.employeeRange;
      }
    }

    await audience.save();

    return res.json({
      success: true,
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("PATCH /:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update audience",
    });
  }
});

// ======================================
// ARCHIVE AUDIENCE
// ======================================

router.patch("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;

    const audience = await Audience.findById(id);

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    if (audience.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "Audience is already archived",
      });
    }

    audience.status = "archived";
    await audience.save();

    return res.json({
      success: true,
      message: "Audience archived successfully",
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("PATCH /:id/archive error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to archive audience",
    });
  }
});

// ===================================================================
// ANALYTICS ROUTES (READ-ONLY)
// ===================================================================

// ======================================
// GET AUDIENCE ANALYTICS SUMMARY
// Dashboard view: performance, quality, latest run
// ======================================

router.get("/:id/analytics", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Get all discovery runs for this audience
    const runs = await DiscoveryRun.find({ audienceId: id })
      .select(
  "status statistics scoreDistribution startedAt completedAt errorDetails",
      )
      .sort({ completedAt: -1 })
      .lean();

    // Aggregate run statistics
    const summary = {
      totalRuns: runs.length,
      successfulRuns: 0,
      partialRuns: 0,
      failedRuns: 0,
      totalOrganizationsFound: 0,
      totalOrganizationsCreated: 0,
      totalOrganizationsUpdated: 0,
    };

    runs.forEach((run) => {
      if (run.status === "success") summary.successfulRuns += 1;
      if (run.status === "partial") summary.partialRuns += 1;
      if (run.status === "failed") summary.failedRuns += 1;

      if (run.statistics) {
        summary.totalOrganizationsFound +=
          run.statistics.organizationsFound || 0;
        summary.totalOrganizationsCreated +=
          run.statistics.organizationsCreated || 0;
        summary.totalOrganizationsUpdated +=
          run.statistics.organizationsUpdated || 0;
      }
    });

    // Get organizations for this audience
    const organizations = await Organization.find({
      _id: { $in: audience.organizationIds || [] },
    })
      .select("audienceScore audienceTier")
      .lean();

    // Calculate quality metrics
    let totalScore = 0;
    const tierCounts = {
      high: 0,
      medium: 0,
      low: 0,
      unscored: 0,
    };

    organizations.forEach((org) => {
      totalScore += org.audienceScore || 0;
      tierCounts[org.audienceTier] = (tierCounts[org.audienceTier] || 0) + 1;
    });

    const quality = {
      averageScore:
        organizations.length > 0
          ? Math.round((totalScore / organizations.length) * 10) / 10
          : 0,
      highTierOrganizations: tierCounts.high,
      mediumTierOrganizations: tierCounts.medium,
      lowTierOrganizations: tierCounts.low,
      unscoredOrganizations: tierCounts.unscored,
    };

    // Format latest run
    const latestRun = runs.length > 0 ? runs[0] : null;
    const latestRunSummary = latestRun
      ? {
          id: latestRun._id,
          status: latestRun.status,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          organizationsCreated: latestRun.statistics?.organizationsCreated || 0,
          scoreDistribution: latestRun.scoreDistribution || {
            high: 0,
            medium: 0,
            low: 0,
            unscored: 0,
          },
        }
      : null;

    return res.json({
      success: true,
      analytics: {
        audienceId: audience._id,
        audienceName: audience.name,
        summary,
        quality,
        latestRun: latestRunSummary,
      },
    });
  } catch (error) {
    console.error("GET /:id/analytics error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve analytics",
    });
  }
});

// ======================================
// GET DISCOVERY RUN HISTORY
// List all discovery runs with pagination
// ======================================

router.get("/:id/runs", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = "1", limit = "25", status } = req.query;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate status filter
    const validStatuses = ["success", "partial", "failed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json({
        success: false,
        error: "page and limit must be numeric",
      });
    }

    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { audienceId: id };
    if (status) {
      filter.status = status;
    }

    // Query runs (newest first)
    const [runs, totalResults] = await Promise.all([
      DiscoveryRun.find(filter)
        .select(
  "status startedAt completedAt statistics scoreDistribution errorDetails pagination criteriaSnapshot",
        )
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DiscoveryRun.countDocuments(filter),
    ]);

    // Format runs with computed duration
    const formattedRuns = runs.map((run) => {
      const duration =
        run.completedAt && run.startedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : 0;

      return {
        id: run._id,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: duration,
        statistics: run.statistics || {},
        scoreDistribution: run.scoreDistribution || {
          high: 0,
          medium: 0,
          low: 0,
          unscored: 0,
        },
        pagination: run.pagination || {},
errorDetails: run.errorDetails || {},      };
    });

    return res.json({
      success: true,
      runs: formattedRuns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /:id/runs error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve discovery runs",
    });
  }
});

// ======================================
// GET ORGANIZATION INSIGHTS FOR AUDIENCE
// Analytics on discovered organizations
// ======================================

router.get("/:id/organizations/summary", async (req, res) => {
  try {
    const { id } = req.params;
    const { top = "5" } = req.query;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate top parameter
    const topNum = parseInt(top, 10);
    if (isNaN(topNum) || topNum < 1 || topNum > 100) {
      return res.status(400).json({
        success: false,
        error: "top must be numeric between 1 and 100",
      });
    }

    // Get organizations for this audience
    const organizations = await Organization.find({
      _id: { $in: audience.organizationIds || [] },
    })
      .select(
        "name audienceScore audienceTier industry location employeeCount keywords",
      )
      .lean();

    // Calculate score distribution and metrics
    let totalScore = 0;
    const tierCounts = {
      high: 0,
      medium: 0,
      low: 0,
      unscored: 0,
    };
    const industryCounts = {};
    const locationCounts = {};
    const employeeSizeCounts = {
      small: 0,
      medium: 0,
      large: 0,
    };

    organizations.forEach((org) => {
      // Score and tier
      totalScore += org.audienceScore || 0;
      tierCounts[org.audienceTier] = (tierCounts[org.audienceTier] || 0) + 1;

      // Industry
      if (org.industry) {
        industryCounts[org.industry] = (industryCounts[org.industry] || 0) + 1;
      }

      // Location
      if (org.location) {
        locationCounts[org.location] = (locationCounts[org.location] || 0) + 1;
      }

      // Employee size
      const count = org.employeeCount || 0;
      if (count <= 50) {
        employeeSizeCounts.small += 1;
      } else if (count <= 500) {
        employeeSizeCounts.medium += 1;
      } else {
        employeeSizeCounts.large += 1;
      }
    });

    // Sort and limit top industries
    const topIndustries = Object.entries(industryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topNum)
      .map(([industry, count]) => ({
        industry,
        count,
      }));

    // Sort and limit top locations
    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topNum)
      .map(([location, count]) => ({
        location,
        count,
      }));

    // Get top scoring organizations
    const topOrganizations = organizations
      .sort((a, b) => (b.audienceScore || 0) - (a.audienceScore || 0))
      .slice(0, topNum)
      .map((org) => ({
        name: org.name,
        score: org.audienceScore || 0,
        tier: org.audienceTier,
        industry: org.industry || "Unknown",
      }));

    return res.json({
      success: true,
      organizationSummary: {
        totalOrganizations: organizations.length,
        scoreDistribution: tierCounts,
        averageScore:
          organizations.length > 0
            ? Math.round((totalScore / organizations.length) * 10) / 10
            : 0,
      },
      topIndustries,
      topLocations,
      employeeSizeBreakdown: employeeSizeCounts,
      topOrganizations,
    });
  } catch (error) {
    console.error("GET /:id/organizations/summary error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve organization summary",
    });
  }
});

// ===================================================================
// DISCOVERY & ORGANIZATION ROUTES (EXISTING)
// ===================================================================

// ======================================
// GET SAVED ORGANIZATIONS
// Query saved orgs by tier, score, source,
// industry, or location.
// ======================================

router.get("/organizations", async (req, res) => {
  try {
    const {
      tier,
      minScore,
      source,
      industry,
      location,
      sort = "score",
      page = "1",
      limit = "25",
    } = req.query;

    const filter = {};

    if (tier) {
      const validTiers = ["high", "medium", "low", "unscored"];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({
          error: `Invalid tier. Must be one of: ${validTiers.join(", ")}`,
        });
      }
      filter.audienceTier = tier;
    }

    if (minScore !== undefined) {
      const parsed = Number(minScore);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return res
          .status(400)
          .json({ error: "minScore must be a number between 0 and 100" });
      }
      filter.audienceScore = { $gte: parsed };
    }

    if (source) filter.source = source;

    if (industry) {
      filter.industry = { $regex: industry, $options: "i" };
    }

    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortMap = {
      score: { audienceScore: -1 },
      name: { name: 1 },
      recent: { createdAt: -1 },
    };
    const sortOrder = sortMap[sort] || sortMap.score;

    const [organizations, totalResults] = await Promise.all([
      Organization.find(filter)
        .select(
          "name website industry employeeCount location audienceScore audienceTier scoreReasons domain source discoveredAt",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Organization.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      organizations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /organizations error:", error);
    return res.status(500).json({ error: "Failed to retrieve organizations" });
  }
});

// ======================================
// DISCOVER ORGANIZATIONS FOR AUDIENCE
// Triggers discovery flow for a given Audience:
// - Search Growth Operator's organization intelligence records
// - Enrich each organization
// - Score and filter by criteria
// - Save/update to MongoDB
// - Link to Audience.organizationIds
// ======================================

router.post("/:id/discover", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Audience ID is required",
      });
    }

    const result = await discoverOrganizationsForAudience(id);

    if (!result.success) {
      const status = result.status === 401 || result.status === 403 || result.status === 429
        ? result.status
        : 400;
      return res.status(status).json({
        success: false,
        error: result.error,
        code: result.errorCode || "organization_search_failed",
        retryAfter: result.retryAfter || null,
        action: "Review the research criteria, then retry.",
      });
    }

    return res.json({
      success: result.success,
      audienceId: result.audienceId,
      discoveryRunId: result.discoveryRunId,
      organizationsFound: result.organizationsFound,
      organizationsCreated: result.organizationsCreated,
      organizationsUpdated: result.organizationsUpdated,
      duplicatesSkipped: result.duplicatesSkipped,
      completedAt: result.completedAt,
      audience: result.audience,
    });
  } catch (error) {
    console.error("POST /:id/discover error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to discover organizations for audience",
    });
  }
});

// ======================================
// DISCOVER AUDIENCE
// Community and future first-party research sources
// ======================================

router.post("/discover", async (req, res) => {
  try {
    const { query, campaignId } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Audience query is required",
      });
    }

    const result = await discoverAudienceSources(query);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const contacts = [];

    for (const item of result.results) {
      // Prevent duplicate contacts
      const existing = await Contact.findOne({
        email: item.email || "",

        company: item.company || item.organization || "",
      });

      if (existing) {
        contacts.push(existing);

        continue;
      }

      const contact = await Contact.create({
        name: item.name || "",

        email: item.email || "",

        company: item.company || item.organization || "",

        role: item.role || item.contactRole || "",

        source: item.source || "manual",

        campaignId,

        tags: [query],

        status: "new",
      });

      contacts.push(contact);
    }

    res.json({
      success: true,

      contactsCreated: contacts.length,

      contacts,
    });
  } catch (error) {
    console.error("AUDIENCE DISCOVERY ERROR:", error);

    res.status(500).json({
      error: "Failed discovering audience",
    });
  }
});

// ===================================================================
// ORGANIZATION PRIORITIZATION RETRIEVAL ROUTES (READ-ONLY)
// ===================================================================

// ======================================
// GET PRIORITIZED ORGANIZATIONS FOR AUDIENCE
// Return organizations ranked by priorityScore
// with support for filtering by tier/score and sorting
// ======================================

router.get("/:id/organizations/prioritized", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = "1",
      limit = "25",
      tier,
      minScore,
      maxScore,
      sortBy = "priority",
    } = req.query;

    // Validate audience ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate and parse pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json({
        success: false,
        error: "page and limit must be numeric",
      });
    }

    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: "page must be >= 1",
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: "limit must be between 1 and 100",
      });
    }

    // Validate tier filter
    const validTiers = ["hot", "warm", "cold"];
    if (tier && !validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier value. Must be one of: ${validTiers.join(", ")}`,
      });
    }

    // Validate score filters
    let minScoreNum = null;
    let maxScoreNum = null;

    if (minScore !== undefined) {
      minScoreNum = Number(minScore);
      if (isNaN(minScoreNum) || minScoreNum < 0 || minScoreNum > 100) {
        return res.status(400).json({
          success: false,
          error: "minScore must be between 0 and 100",
        });
      }
    }

    if (maxScore !== undefined) {
      maxScoreNum = Number(maxScore);
      if (isNaN(maxScoreNum) || maxScoreNum < 0 || maxScoreNum > 100) {
        return res.status(400).json({
          success: false,
          error: "maxScore must be between 0 and 100",
        });
      }
    }

    // Validate sortBy
    const validSortOptions = [
      "priority",
      "score_asc",
      "score_desc",
      "recent",
      "name",
    ];
    if (!validSortOptions.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sortBy. Must be one of: ${validSortOptions.join(", ")}`,
      });
    }

    // Build filter for organizations
    const filter = { _id: { $in: audience.organizationIds || [] } };

    if (tier) {
      filter.priorityTier = tier;
    }

    if (minScoreNum !== null || maxScoreNum !== null) {
      filter.priorityScore = {};
      if (minScoreNum !== null) {
        filter.priorityScore.$gte = minScoreNum;
      }
      if (maxScoreNum !== null) {
        filter.priorityScore.$lte = maxScoreNum;
      }
    }

    // Build sort order
    const sortMap = {
      priority: { priorityScore: -1 },
      score_asc: { priorityScore: 1 },
      score_desc: { priorityScore: -1 },
      recent: { discoveredAt: -1 },
      name: { name: 1 },
    };
    const sortOrder = sortMap[sortBy];

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Query organizations
    const [organizations, totalResults] = await Promise.all([
      Organization.find(filter)
        .select(
          "name domain website industry employeeCount location linkedinUrl audienceScore audienceTier scoreReasons priorityScore priorityTier priorityReasons discoveredAt enrichedAt priorityCalculatedAt source keywords",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Organization.countDocuments(filter),
    ]);

    // Calculate tier counts and summary statistics
    let hotCount = 0;
    let warmCount = 0;
    let coldCount = 0;
    let totalPriorityScore = 0;

    const scoreDistribution = { "80-100": 0, "50-79": 0, "0-49": 0 };

    // Get all organizations for summary (not paginated)
    const allOrganizations = await Organization.find(filter)
      .select("priorityScore priorityTier")
      .lean();

    allOrganizations.forEach((org) => {
      const score = org.priorityScore || 0;
      totalPriorityScore += score;

      if (org.priorityTier === "hot") hotCount += 1;
      if (org.priorityTier === "warm") warmCount += 1;
      if (org.priorityTier === "cold") coldCount += 1;

      if (score >= 80) {
        scoreDistribution["80-100"] += 1;
      } else if (score >= 50) {
        scoreDistribution["50-79"] += 1;
      } else {
        scoreDistribution["0-49"] += 1;
      }
    });

    const averagePriorityScore =
      allOrganizations.length > 0
        ? Math.round((totalPriorityScore / allOrganizations.length) * 10) / 10
        : 0;

    return res.json({
      success: true,
      organizations,
      summary: {
        totalOrganizations: allOrganizations.length,
        byTier: {
          hot: hotCount,
          warm: warmCount,
          cold: coldCount,
        },
        averagePriorityScore,
        scoreDistribution,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /:id/organizations/prioritized error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve prioritized organizations",
    });
  }
});

// ======================================
// GET ORGANIZATION PRIORITY DETAILS
// Return single organization's priority breakdown
// ======================================

router.get("/organizations/:id/priority", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate organization ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Fetch organization
    const organization = await Organization.findById(id)
      .select(
        "name domain website industry employeeCount location linkedinUrl phone description audienceScore audienceTier scoreReasons priorityScore priorityTier priorityReasons prioritySignals priorityCalculatedAt discoveredAt enrichedAt source keywords",
      )
      .lean();

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Build detailed signal explanations
    const signals = organization.prioritySignals || {};
    const detailedSignals = {
      audienceFit: {
        points: signals.audienceFit || 0,
        explanation:
          signals.audienceFit >= 30
            ? "High audience fit"
            : signals.audienceFit >= 20
              ? "Good audience fit"
              : signals.audienceFit > 0
                ? "Moderate audience fit"
                : "Low audience fit",
        calculation: `audienceScore ${organization.audienceScore} → ${signals.audienceFit} points`,
      },
      industryMatch: {
        points: signals.industryMatch || 0,
        explanation:
          signals.industryMatch >= 15
            ? "Exact industry match"
            : signals.industryMatch > 0
              ? "Partial industry match"
              : "No industry match",
        calculation: `${organization.industry || "Unknown"} industry → ${signals.industryMatch} points`,
      },
      companySize: {
        points: signals.companySize || 0,
        explanation:
          signals.companySize >= 15
            ? "Ideal employee count"
            : signals.companySize > 0
              ? "Known employee count"
              : "Unknown employee count",
        calculation: `${organization.employeeCount || "Unknown"} employees → ${signals.companySize} points`,
      },
      keywordMatch: {
        points: signals.keywordMatch || 0,
        explanation:
          signals.keywordMatch >= 7
            ? "Strong keyword overlap"
            : signals.keywordMatch > 0
              ? "Some keyword match"
              : "No keyword match",
        calculation: `${(organization.keywords || []).length} keywords → ${signals.keywordMatch} points`,
      },
      dataQuality: {
        points: signals.dataQuality || 0,
        explanation:
          signals.dataQuality >= 8
            ? "Complete profile"
            : signals.dataQuality >= 5
              ? "Well-enriched profile"
              : "Minimal enrichment",
        calculation: `Profile completeness → ${signals.dataQuality} points`,
      },
      recency: {
        points: signals.recency || 0,
        explanation:
          signals.recency >= 10
            ? "Recently discovered"
            : signals.recency >= 6
              ? "Moderately recent"
              : signals.recency > 0
                ? "Older discovery"
                : "Very stale",
        calculation: `${
          organization.discoveredAt
            ? Math.floor(
                (Date.now() - new Date(organization.discoveredAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : "unknown"
        } days ago → ${signals.recency} points`,
      },
    };

    // Determine if recalculation recommended
    const recalculationRecommended =
      !organization.priorityCalculatedAt ||
      Date.now() - new Date(organization.priorityCalculatedAt).getTime() >
        30 * 24 * 60 * 60 * 1000; // 30 days

    return res.json({
      success: true,
      organization: {
        _id: organization._id,
        name: organization.name,
        domain: organization.domain,
        website: organization.website,
        industry: organization.industry,
        employeeCount: organization.employeeCount,
        location: organization.location,
        linkedinUrl: organization.linkedinUrl,
        phone: organization.phone,
        description: organization.description,
        audienceScore: organization.audienceScore,
        audienceTier: organization.audienceTier,
        scoreReasons: organization.scoreReasons,
        discoveredAt: organization.discoveredAt,
        enrichedAt: organization.enrichedAt,
        source: organization.source,
        keywords: organization.keywords,
      },
      priority: {
        score: organization.priorityScore || 0,
        tier: organization.priorityTier || "cold",
        reasons: organization.priorityReasons || [],
        signals: detailedSignals,
        calculatedAt: organization.priorityCalculatedAt,
        recalculationRecommended,
      },
    });
  } catch (error) {
    console.error("GET /organizations/:id/priority error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve organization priority details",
    });
  }
});

module.exports = router;
