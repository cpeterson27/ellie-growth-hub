const assert = require("node:assert/strict");
const welcome = require("./services/ambassadorWelcomeService");
const publishing = require("./services/socialPublishingService");

function query(value) {
  const chain = { select() { return chain; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  return chain;
}
function doc(value) { return { ...value, async save() { return this; } }; }

async function createsReviewOnlyDraft() {
  const profile = doc({ _id: "amb1", userId: "user1", displayName: "Jordan Partner", bio: "Community builder and multifamily investor.", company: "Partner Co", referralSlug: "jordan", socialProfiles: { instagram: "@jordan" }, welcomePost: {} });
  let createdContent; let notification; let activity;
  const models = {
    AmbassadorProfile: { findOne: async () => profile },
    User: { findById: () => query({ _id: "user1", name: "Jordan Partner", email: "j@example.com", avatarUrl: "https://cdn.example.com/jordan.jpg" }) },
    WorkspaceConfig: { findOne: () => query({ workspaceName: "Ellie's Coaching", ambassadorOnboarding: { requiredFields: ["headshot", "bio"] } }) },
    SocialGraphicTemplate: { findOne: () => query({ ...welcome.DEFAULT_TEMPLATE, logoUrl: "https://cdn.example.com/logo.png", version: 3 }) },
    ContentBrief: { findOne: async () => null, create: async (value) => { createdContent = doc({ _id: "content1", ...value }); return createdContent; } },
    CrmActivity: { create: async (value) => { activity = value; } },
    InAppNotification: { create: async (value) => { notification = value; } },
    imageAssetService: { uploadGeneratedSvg: async ({ svg }) => { assert.match(svg, /Jordan Partner/); assert.match(svg, /data:image\/jpeg;base64/); return { url: "https://res.cloudinary.com/demo/image/upload/welcome.svg", publicId: "welcome/1" }; } },
    llmService: { isEnabled: () => false },
    http: { get: async () => ({ data: Buffer.from("fixture"), headers: { "content-type": "image/jpeg" } }) },
  };
  const result = await welcome.generate({ workspaceId: "work1", ambassadorProfileId: "amb1", userId: "owner1" }, models);
  assert.equal(result.content.status, "pending_approval");
  assert.equal(createdContent.origin, "ambassador_welcome");
  assert.equal(createdContent.ambassadorProfileId, "amb1");
  assert.equal(createdContent.social.destinations.length, 0, "generation never chooses a live destination");
  assert.equal(createdContent.social.publications, undefined, "generation never creates a publication receipt");
  assert.equal(createdContent.social.media[0].publicId, "welcome/1");
  assert.deepEqual(createdContent.social.variants.map((row) => row.provider), ["instagram", "facebook"]);
  assert.equal(profile.welcomePost.status, "ready_for_review");
  assert.equal(notification.type, "ambassador_welcome_ready");
  assert.equal(activity.metadata.eventType, "ambassador.welcome.generated");
}

async function protectsCompletenessAndHistory() {
  assert.equal(welcome.completeness({ bio: "" }, { avatarUrl: "" }, ["headshot", "bio"]).complete, false);
  const svg = welcome.graphicSvg({ template: welcome.DEFAULT_TEMPLATE, vars: { ambassadorName: "A & B", workspaceName: "Ellie" }, photoData: "data:image/jpeg;base64,fixture", logoData: "" });
  assert.match(svg, /A &amp; B/); assert.doesNotMatch(svg, /A & B/);
  const existing = doc({ _id: "content1", body: "old", status: "approved", social: { media: [{ url: "https://old.example/image.jpg" }], variants: [], generationHistory: [] } });
  const profile = doc({ _id: "amb1", userId: "user1", displayName: "Jordan", bio: "Bio", referralSlug: "jordan", socialProfiles: {}, welcomePost: { contentBriefId: "content1" } });
  const models = {
    AmbassadorProfile: { findOne: async () => profile }, User: { findById: () => query({ name: "Jordan", avatarUrl: "https://cdn.example/j.jpg" }) },
    WorkspaceConfig: { findOne: () => query({ workspaceName: "Ellie", ambassadorOnboarding: { requiredFields: ["headshot", "bio"] } }) }, SocialGraphicTemplate: { findOne: () => query({ ...welcome.DEFAULT_TEMPLATE, version: 4 }) },
    ContentBrief: { findOne: async () => existing }, CrmActivity: { create: async () => ({}) }, InAppNotification: { create: async () => ({}) }, imageAssetService: { uploadGeneratedSvg: async () => ({ url: "https://new.example/image.svg", publicId: "new1" }) }, llmService: { isEnabled: () => false }, http: { get: async () => ({ data: Buffer.from("x"), headers: { "content-type": "image/jpeg" } }) },
  };
  await welcome.generate({ workspaceId: "work1", ambassadorProfileId: "amb1", userId: "owner1" }, models);
  assert.equal(existing.social.generationHistory[0].previousBody, "old");
  assert.equal(existing.social.generationHistory[0].previousMediaUrl, "https://old.example/image.jpg");
  assert.equal(existing.status, "pending_approval");
}

async function lifecycleSyncsWithoutPublishingByDefault() {
  const updates = [];
  const item = doc({ _id: "content1", workspaceId: "work1", type: "social", ambassadorProfileId: "amb1", status: "approved", campaignId: null, social: { approval: {}, requestedPublishAt: null, lastError: "", destinations: [{ provider: "facebook", assetId: "page1" }] } });
  const models = { ContentBrief: { findOne: async () => item }, AmbassadorProfile: { findOneAndUpdate: async (_filter, update) => updates.push(update) }, CrmActivity: { create: async () => ({}) } };
  await publishing.transition({ workspaceId: "work1", id: "content1", action: "schedule", userId: "owner", publishAt: "2030-01-01T12:00:00Z" }, models);
  assert.equal(updates[0].$set["welcomePost.status"], "scheduled");
  const prior = process.env.SOCIAL_PUBLISHING_ENABLED; delete process.env.SOCIAL_PUBLISHING_ENABLED;
  const due = await publishing.runDue({}, { ContentBrief: { findOneAndUpdate: async () => { throw new Error("worker should remain disabled"); } } });
  if (prior !== undefined) process.env.SOCIAL_PUBLISHING_ENABLED = prior;
  assert.deepEqual(due, []);
}

Promise.resolve().then(createsReviewOnlyDraft).then(protectsCompletenessAndHistory).then(lifecycleSyncsWithoutPublishingByDefault).then(() => console.log("Ambassador branded welcome draft, completeness, history, and disabled-publishing safeguards passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
