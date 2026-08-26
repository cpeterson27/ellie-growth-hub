const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SocialIdentity = require("./models/SocialIdentity");
const SocialProviderEvent = require("./models/SocialProviderEvent");
const { CAPABILITIES } = require("./routes/socialAutomation");
const { SUPPORTED_TRIGGERS, allowedDestination, containsKeyword, ingestSocialEvent, normalizedKeywords } = require("./services/socialLeadAutomationService");

function source(file) { return fs.readFileSync(path.join(__dirname, file), "utf8"); }
function includesAll(contents, expected, label) { for (const value of expected) assert.ok(contents.includes(value), `${label} missing ${value}`); }

assert.deepEqual(normalizedKeywords([" DEAL ", "deal", "Underwriting", ""]), ["deal", "underwriting"]);
assert.equal(containsKeyword("I want the DEAL guide", ["deal"]), true);
assert.equal(containsKeyword("Just saying hello", ["deal"]), false);
assert.equal(allowedDestination("https://elliescoaching.com/apply"), true);
assert.equal(allowedDestination("https://www.eventbrite.com/e/example"), true);
assert.equal(allowedDestination("http://elliescoaching.com/apply"), false);
assert.equal(allowedDestination("https://evil.example/elliescoaching.com"), false);

assert.deepEqual(SUPPORTED_TRIGGERS.instagram, ["dm_keyword", "story_reply", "comment_any", "comment_keyword"]);
assert.equal(CAPABILITIES.instagram.commentKeyword, true);
assert.equal(CAPABILITIES.instagram.followToDm, false);
assert.equal(CAPABILITIES.facebook.inboundDm, true);
assert.equal(CAPABILITIES.tiktok.leadForm, true);
assert.equal(CAPABILITIES.tiktok.inboundDm, false);
assert.equal(CAPABILITIES.linkedin.connection, "human_assisted");
assert.equal(CAPABILITIES.x.connection, "not_configured");
for (const capability of Object.values(CAPABILITIES)) assert.equal(capability.likesViewsSaves, false);

const identityIndex = SocialIdentity.schema.indexes().find(([fields, options]) => fields.workspaceId === 1 && fields.provider === 1 && fields.providerAssetId === 1 && fields.providerUserId === 1 && options.unique);
assert.ok(identityIndex, "Social identities must be unique by workspace/provider/asset/user");
const eventIndex = SocialProviderEvent.schema.indexes().find(([fields, options]) => fields.workspaceId === 1 && fields.provider === 1 && fields.providerEventId === 1 && options.unique);
assert.ok(eventIndex, "Provider events must be idempotent inside a workspace");

const service = source("services/socialLeadAutomationService.js");
includesAll(service, ["unsupported_engagement", "socialAttribution.first", "socialAttribution.latest", "social-lead", "ingestProviderMessage", "social.identity.linked", "social.lead.created"], "social service");
assert.equal(service.includes("ReferralAttribution.findOneAndUpdate"), false, "Social attribution must not overwrite Phase 3 referral attribution");

const webhook = source("routes/webhooks.js");
includesAll(webhook, ["validateMetaSignature", "ingestMetaComment", "sendCommentPrivateReply", "entry.messaging", "entry.changes"], "Meta webhook");
const route = source("routes/socialAutomation.js");
includesAll(route, ['requireCapability("social.manage")', 'router.get("/leads"', 'router.post("/automations"', 'router.post("/tracked-links"', "TRIGGER_UNSUPPORTED", "selectedAssetIds"], "social API");
const server = source("server.js");
includesAll(server, ['req.path.startsWith("/social-automation/t/")', 'app.use("/api/social-automation", socialAutomationRouter)'], "server mounting");
const authorization = source("middleware/authorization.js");
assert.ok(authorization.includes('roles.every') && authorization.includes('allowed.push("/coaching")'), "Coach must be denied from global social APIs");
assert.ok(authorization.includes('allowed.push("/opportunities")'), "Closer must be denied from social APIs");

const conversation = source("services/conversations/conversationIngestionService.js");
includesAll(conversation, ["ConversationThread", "ConversationMessage", "providerMessageId", "created: false"], "canonical conversation ingestion");
const contactModel = source("models/Contact.js");
includesAll(contactModel, ["socialAttribution", "first:", "latest:"], "Contact attribution");

function document(values) {
  return { ...values, _id: values._id || `id-${Math.random()}`, set(pathName, value) { const [group, field] = pathName.split("."); if (field) { this[group] ||= {}; this[group][field] = value; } else this[group] = value; }, async save() { return this; } };
}

async function behaviorChecks() {
  const contacts = new Map(); const identities = []; const providerEvents = new Map(); const activities = []; const conversations = [];
  const automation = document({ _id: "auto-1", provider: "instagram", assetId: "ig-asset", contentId: "reel-1", triggerType: "comment_keyword", keywords: ["deal"], tags: ["underwriting"], qualification: ["requested-resource"], campaignId: "campaign-1", enabled: true, createdAt: new Date() });
  const fakeModels = {
    Contact: { async create(values) { const item = document(values); contacts.set(String(item._id), item); return item; }, async findById(id) { return contacts.get(String(id)) || null; } },
    SocialIdentity: { async findOne(filter) { return identities.find((item) => item.provider === filter.provider && item.providerAssetId === filter.providerAssetId && item.providerUserId === filter.providerUserId) || null; }, async create(values) { const item = document(values); identities.push(item); return item; } },
    SocialAutomation: { find() { return { async sort() { return [automation]; } }; } },
    SocialProviderEvent: { async create(values) { const key = `${values.provider}:${values.providerEventId}`; if (providerEvents.has(key)) { const error = new Error("duplicate"); error.code = 11000; throw error; } const item = document(values); providerEvents.set(key, item); return item; }, async findOne(filter) { return providerEvents.get(`${filter.provider}:${filter.providerEventId}`); } },
    CrmActivity: { async create(values) { activities.push(values); return values; } },
  };
  const base = { provider: "instagram", providerEventId: "comment-1", eventType: "comment_received", triggerType: "comment_any", assetId: "ig-asset", providerUserId: "ig-user", contentId: "reel-1", username: "investor", text: "Please send the DEAL guide" };
  const first = await ingestSocialEvent(base, { models: fakeModels, ingestMessage: async (payload) => { conversations.push(payload); return payload; } });
  assert.equal(first.duplicate, false); assert.equal(contacts.size, 1); assert.equal(identities.length, 1); assert.equal(first.automation._id, "auto-1");
  assert.equal(first.contact.socialAttribution.first.provider, "instagram"); assert.equal(first.contact.socialAttribution.latest.contentId, "reel-1");
  assert.ok(first.contact.tags.includes("underwriting")); assert.ok(activities.some((item) => item.metadata.eventType === "social.lead.created"));
  const duplicate = await ingestSocialEvent(base, { models: fakeModels }); assert.equal(duplicate.duplicate, true); assert.equal(contacts.size, 1); assert.equal(activities.length, 2);
  const ignored = await ingestSocialEvent({ ...base, providerEventId: "view-1", eventType: "view", triggerType: "view" }, { models: fakeModels }); assert.equal(ignored.reason, "unsupported_engagement"); assert.equal(providerEvents.size, 1);
  const dm = await ingestSocialEvent({ ...base, providerEventId: "dm-1", messageId: "message-1", eventType: "dm_received", triggerType: "dm_keyword", text: "deal", providerThreadId: "instagram:ig-asset:ig-user" }, { models: fakeModels, ingestMessage: async (payload) => { conversations.push(payload); return { thread: { _id: "thread-1" }, message: payload.message }; } });
  assert.equal(dm.contact._id, first.contact._id); assert.equal(conversations.length, 2); assert.equal(conversations[0].thread.contactIds[0], first.contact._id);
  assert.equal(source("services/socialLeadAutomationService.js").includes("ReferralAttribution"), false);
}

behaviorChecks().then(() => console.log("Social lead automation checks passed: canonical identity, idempotency, supported triggers, attribution, conversation reuse, RBAC, referral isolation, and tracked-link safety.")).catch((error) => { console.error(error); process.exitCode = 1; });
