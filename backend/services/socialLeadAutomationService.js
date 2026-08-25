const crypto = require("crypto");
const Contact = require("../models/Contact");
const SocialIdentity = require("../models/SocialIdentity");
const SocialAutomation = require("../models/SocialAutomation");
const SocialProviderEvent = require("../models/SocialProviderEvent");
const TrackedLink = require("../models/TrackedLink");
const CrmActivity = require("../models/CrmActivity");
const ContentBrief = require("../models/ContentBrief");
const { ingestProviderMessage } = require("./conversations/conversationIngestionService");

const models = { Contact, SocialIdentity, SocialAutomation, SocialProviderEvent, TrackedLink, CrmActivity, ContentBrief };
const SUPPORTED_TRIGGERS = Object.freeze({
  instagram: ["dm_keyword", "story_reply", "comment_any", "comment_keyword"],
  facebook: ["dm_keyword", "comment_any", "comment_keyword"],
  tiktok: ["lead_form"],
  linkedin: [],
  x: [],
});
const UNSUPPORTED_ENGAGEMENTS = new Set(["like", "view", "save", "share", "reaction", "follow"]);

function clean(value, max = 500) { return String(value || "").trim().slice(0, max); }
function normalizedKeywords(values) { return [...new Set((values || []).map((v) => clean(v, 80).toLowerCase()).filter(Boolean))]; }
function containsKeyword(text, keywords) { const value = clean(text, 5000).toLowerCase(); return keywords.some((keyword) => value.includes(keyword)); }
function attributionFrom(event, automation) {
  return { provider: event.provider, campaignId: automation?.campaignId || event.campaignId || null, contentId: event.contentId || automation?.contentId || "", contentBriefId: event.contentBriefId || null, automationId: automation?._id || null, occurredAt: event.occurredAt || new Date(), utm: event.utm || {} };
}

async function reserveEvent(event, deps = models) {
  if (!event.providerEventId) throw new Error("A provider event ID is required");
  try {
    return { record: await deps.SocialProviderEvent.create({ provider: event.provider, providerEventId: event.providerEventId, eventType: event.eventType, payloadHash: crypto.createHash("sha256").update(JSON.stringify(event.raw || event)).digest("hex"), occurredAt: event.occurredAt || new Date() }), duplicate: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return { record: await deps.SocialProviderEvent.findOne({ provider: event.provider, providerEventId: event.providerEventId }), duplicate: true };
  }
}

async function resolveIdentity(event, deps = models) {
  const identityFilter = { provider: event.provider, providerAssetId: event.assetId || "", providerUserId: event.providerUserId };
  let identity = await deps.SocialIdentity.findOne(identityFilter);
  let contact = identity ? await deps.Contact.findById(identity.contactId) : null;
  let created = false;
  if (!contact) {
    const name = clean(event.displayName || event.username || `${event.provider} contact`, 180);
    contact = await deps.Contact.create({ name, firstName: name, sources: [`social:${event.provider}`], sourceProvider: `social:${event.provider}`, type: "lead", status: "active", tags: ["social-lead"] });
    identity = await deps.SocialIdentity.create({ contactId: contact._id, ...identityFilter, username: clean(event.username), displayName: clean(event.displayName), providerThreadId: clean(event.providerThreadId, 1000), sourceMetadata: event.sourceMetadata || {}, lastActivityAt: event.occurredAt || new Date() });
    created = true;
  } else {
    identity.username = clean(event.username) || identity.username;
    identity.displayName = clean(event.displayName) || identity.displayName;
    identity.providerThreadId = clean(event.providerThreadId, 1000) || identity.providerThreadId;
    identity.lastActivityAt = event.occurredAt || new Date();
    await identity.save();
  }
  return { contact, identity, created };
}

async function matchingAutomation(event, deps = models) {
  if (!SUPPORTED_TRIGGERS[event.provider]?.includes(event.triggerType)) return null;
  const candidates = await deps.SocialAutomation.find({ provider: event.provider, assetId: event.assetId, enabled: true, $or: [{ contentId: event.contentId || "" }, { contentId: "" }] }).sort({ createdAt: 1 });
  candidates.sort((a, b) => Number(Boolean(b.contentId)) - Number(Boolean(a.contentId)) || Number(["comment_keyword", "dm_keyword"].includes(b.triggerType)) - Number(["comment_keyword", "dm_keyword"].includes(a.triggerType)));
  return candidates.find((item) => {
    if (item.triggerType !== event.triggerType && !(event.triggerType === "comment_any" && item.triggerType === "comment_keyword")) return false;
    return !["comment_keyword", "dm_keyword"].includes(item.triggerType) || containsKeyword(event.text, item.keywords || []);
  }) || null;
}

async function applyAttribution(contact, event, automation) {
  const attribution = attributionFrom(event, automation);
  if (!contact.socialAttribution?.first?.provider) contact.set("socialAttribution.first", attribution);
  contact.set("socialAttribution.latest", attribution);
  contact.sources = [...new Set([...(contact.sources || []), `social:${event.provider}`])];
  const tags = automation?.tags || [];
  contact.tags = [...new Set([...(contact.tags || []), "social-lead", ...tags])];
  if (automation?.qualification?.length) contact.additionalFields = { ...(contact.additionalFields || {}), socialIntent: [...new Set([...(contact.additionalFields?.socialIntent || []), ...automation.qualification])] };
  await contact.save();
}

async function activity(deps, contact, event, automation, identityCreated) {
  const eventType = event.eventType === "comment_received" && automation?.triggerType === "comment_keyword" ? "social.keyword.matched" : `social.${event.eventType.replaceAll("_", ".")}`;
  await deps.CrmActivity.create({ contactId: contact._id, campaignId: automation?.campaignId || event.campaignId || null, type: "system", direction: event.eventType.includes("received") || event.eventType === "story_reply" ? "inbound" : "", title: identityCreated ? "Social lead created" : eventType, source: "integration", occurredAt: event.occurredAt || new Date(), metadata: { eventType: identityCreated ? "social.lead.created" : eventType, provider: event.provider, assetId: event.assetId, contentId: event.contentId || "", contentBriefId:event.contentBriefId||null, automationId: automation?._id || null, providerEventId: event.providerEventId } });
  if (identityCreated) await deps.CrmActivity.create({ contactId: contact._id, type: "system", title: "Social identity linked", source: "integration", metadata: { eventType: "social.identity.linked", provider: event.provider } });
}

async function ingestSocialEvent(event, options = {}) {
  const deps = options.models || models;
  if (UNSUPPORTED_ENGAGEMENTS.has(event.eventType) || UNSUPPORTED_ENGAGEMENTS.has(event.triggerType)) return { ignored: true, reason: "unsupported_engagement" };
  if (!SUPPORTED_TRIGGERS[event.provider]?.includes(event.triggerType) && event.eventType !== "dm_received") return { ignored: true, reason: "unsupported_provider_trigger" };
  const reserved = await reserveEvent(event, deps);
  if (reserved.duplicate) return { duplicate: true, event: reserved.record };
  if(event.contentId&&deps.ContentBrief){const published=await deps.ContentBrief.findOne({type:"social",status:"published",social:{ $exists:true },"social.publications":{$elemMatch:{provider:event.provider,assetId:String(event.assetId||""),providerPostId:String(event.contentId),status:"published"}}}).lean();if(published){event={...event,contentBriefId:published._id,campaignId:published.campaignId||event.campaignId||null};reserved.record.contentBriefId=published._id}}
  const { contact, identity, created } = await resolveIdentity(event, deps);
  const automation = await matchingAutomation(event, deps);
  await applyAttribution(contact, event, automation);
  await activity(deps, contact, event, automation, created);
  let conversation = null;
  if (["dm_received", "story_reply"].includes(event.eventType)) {
    conversation = await (options.ingestMessage || ingestProviderMessage)({ thread: { channel: event.provider, provider: "meta", providerThreadId: event.providerThreadId || `${event.provider}:${event.assetId}:${event.providerUserId}`, participants: [{ kind: "contact", role: "from", address: event.providerUserId, contactId: contact._id }], contactIds: [contact._id], metadata: { assetId: event.assetId, socialOrigin: true, contentId: event.contentId || "" } }, message: { providerMessageId: event.messageId || event.providerEventId, direction: "inbound", body: event.text || "", sender: { name: event.displayName || event.username || "", address: event.providerUserId }, recipients: [{ address: event.assetId, role: "to" }], contactId: contact._id, deliveryStatus: "received", sentAt: event.occurredAt || new Date(), metadata: { socialIdentityId: identity._id, automationId: automation?._id || null } } });
  }
  let responseTemplate = automation?.responseTemplate || "";
  const ctaDestination = clean(automation?.cta?.destination, 2000);
  if (ctaDestination) {
    let responseUrl = ctaDestination;
    if (allowedDestination(ctaDestination) && deps.TrackedLink) {
      const tracked = await createTrackedLink({ destination: ctaDestination, provider: event.provider, contactId: contact._id, campaignId: automation?.campaignId || null, automationId: automation?._id || null, assetId: event.assetId || "", contentId: event.contentId || "", utm: event.utm || {} }, null, deps);
      const base = String(process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
      if (base) responseUrl = `${base}/api/social-automation/t/${tracked.token}`;
    }
    responseTemplate = [responseTemplate, automation?.cta?.label, responseUrl].filter(Boolean).join("\n");
  }
  reserved.record.contactId = contact._id; reserved.record.socialIdentityId = identity._id; reserved.record.automationId = automation?._id || null; await reserved.record.save();
  return { duplicate: false, contact, identity, automation, conversation, responseTemplate };
}

function allowedDestination(value) {
  try { const url = new URL(value); return url.protocol === "https:" && ["elliescoaching.com", "www.elliescoaching.com", "eventbrite.com", "www.eventbrite.com"].includes(url.hostname.toLowerCase()); } catch { return false; }
}
async function createTrackedLink(values, actorUserId, deps = models) {
  if (!allowedDestination(values.destination)) throw new Error("Tracked links must use an approved HTTPS Ellie Coaching or Eventbrite destination");
  if (values.idempotencyKey) { const existing = await deps.TrackedLink.findOne({ idempotencyKey: values.idempotencyKey }); if (existing) return existing; }
  let link; try { link = await deps.TrackedLink.create({ ...values, token: crypto.randomBytes(18).toString("base64url"), createdBy: actorUserId }); } catch (error) { if (error.code === 11000 && values.idempotencyKey) return deps.TrackedLink.findOne({ idempotencyKey: values.idempotencyKey }); throw error; }
  await deps.CrmActivity.create({ contactId: values.contactId || null, campaignId: values.campaignId || null, type: "system", title: "Social tracked link generated", source: "integration", createdBy: actorUserId, metadata: { eventType: "social.link.generated", provider: values.provider, contentId: values.contentId || "", trackedLinkId: link._id } });
  return link;
}

module.exports = { SUPPORTED_TRIGGERS, allowedDestination, containsKeyword, createTrackedLink, ingestSocialEvent, normalizedKeywords };
