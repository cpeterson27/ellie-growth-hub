const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.META_APP_ID = "meta-app-123";
process.env.META_APP_SECRET = "provider-secret-never-log";
process.env.META_REDIRECT_URI = "https://api.example.test/api/social/meta/oauth/callback";
process.env.META_GRAPH_API_VERSION = "v23.0";

const oauth = require("./services/socialOAuthService");
const { encryptCredentials } = require("./utils/credentialEncryption");
const { resolveApplicationContact } = require("./services/publicApplicationService");
const { resolveIdentity } = require("./services/socialLeadAutomationService");

function document(values) {
  return { ...values, async save() { return this; } };
}

async function oauthChecks() {
  const calls = [];
  const http = {
    async get(url) {
      calls.push(url);
      if (url.endsWith("/oauth/access_token") && calls.filter((item) => item.endsWith("/oauth/access_token")).length === 1) return { data: { access_token: "short-token", expires_in: 100 } };
      if (url.endsWith("/oauth/access_token")) return { data: { access_token: "long-token", expires_in: 5000 } };
      if (url.endsWith("/debug_token")) return { data: { data: { is_valid: true, app_id: "meta-app-123", user_id: "meta-user", data_access_expires_at: 1900000000 } } };
      if (url.endsWith("/me/permissions")) return { data: { data: [{ permission: "pages_show_list", status: "granted" }, { permission: "pages_messaging", status: "declined" }] } };
      if (url.endsWith("/me")) return { data: { id: "meta-user", name: "Ellie" } };
      if (url.endsWith("/me/accounts")) return { data: { data: [{ id: "page-1", name: "Ellie Page", access_token: "page-token", tasks: ["MANAGE"], instagram_business_account: { id: "ig-1", username: "ellie", name: "Ellie IG" } }] } };
      throw new Error(`Unexpected GET ${url}`);
    },
  };
  const result = await oauth.exchangeMeta("authorization-code", http);
  assert.deepEqual(result.scopes, ["pages_show_list"]);
  assert.deepEqual(result.declinedScopes, ["pages_messaging"]);
  assert.equal(result.authorization.valid, true);
  assert.equal(result.authorization.userId, "meta-user");
  assert.equal(result.assets.length, 2);
}

async function subscriptionChecks() {
  const posts = [];
  const connection = document({
    credentialsEncrypted: encryptCredentials({ accessToken: "user-token", pageTokens: { "page-1": "page-token" } }),
    assets: [{ id: "page-1", type: "facebook_page" }, { id: "ig-1", parentId: "page-1", type: "instagram_business" }],
  });
  const http = {
    async post(url, body, options) { posts.push({ url, fields: options.params.subscribed_fields }); return { data: { success: true } }; },
    async get(url) {
      const fields = url.includes("ig-1") ? ["comments", "messages"] : ["feed", "messages", "messaging_postbacks"];
      return { data: { data: [{ id: "meta-app-123", subscribed_fields: fields }] } };
    },
  };
  const result = await oauth.provisionMetaSubscriptions(connection, ["page-1", "ig-1"], http);
  assert.equal(result.every((row) => row.status === "subscribed"), true);
  assert.deepEqual(posts.map((row) => row.fields), ["feed,messages,messaging_postbacks", "comments,messages"]);
}

async function convergenceChecks() {
  const tracked = document({ _id: "social-contact", workspaceId: "ws-1", sources: ["social:instagram"], tags: ["social-lead"], socialAttribution: { first: { provider: "instagram" } }, additionalFields: {} });
  const existing = document({ _id: "email-contact", workspaceId: "ws-1", email: "student@example.com", sources: ["eventbrite"], tags: [], additionalFields: {} });
  const identities = []; const links = [];
  const models = {
    Contact: { async findOne(filter) { return filter.email ? existing : tracked; } },
    SocialIdentity: { async updateMany(filter, update) { identities.push({ filter, update }); } },
    TrackedLink: { async updateMany(filter, update) { links.push({ filter, update }); } },
  };
  const resolved = await resolveApplicationContact({ workspaceId: "ws-1", normalizedEmail: "student@example.com", tracked: { contactId: "social-contact" } }, models);
  assert.equal(resolved._id, "email-contact");
  assert.ok(resolved.sources.includes("social:instagram"));
  assert.equal(identities[0].update.$set.contactId, "email-contact");
  assert.equal(links[0].update.$set.contactId, "email-contact");
  assert.equal(tracked.status, "archived");
  assert.equal(tracked.email, undefined);
}

async function raceCheck() {
  const winner = document({ _id: "identity-winner", contactId: "contact-winner", provider: "instagram", providerAssetId: "ig-1", providerUserId: "user-1" });
  const winnerContact = document({ _id: "contact-winner" }); let deleted = ""; let identityReads = 0;
  const models = {
    Contact: { async create(values) { return document({ _id: "contact-loser", ...values }); }, async findById(id) { return id === "contact-winner" ? winnerContact : null; }, async deleteOne(filter) { deleted = filter._id; } },
    SocialIdentity: { async findOne() { identityReads += 1; return identityReads === 1 ? null : winner; }, async create() { const error = new Error("duplicate"); error.code = 11000; throw error; } },
  };
  const result = await resolveIdentity({ provider: "instagram", assetId: "ig-1", providerUserId: "user-1" }, models);
  assert.equal(result.identity._id, "identity-winner");
  assert.equal(result.contact._id, "contact-winner");
  assert.equal(result.created, false);
  assert.equal(deleted, "contact-loser");
}

function loggingAndSafetyChecks() {
  const error = { message: "token=secret-user-token", response: { status: 400, data: { access_token: "secret-user-token", error: { code: 190, message: "secret provider payload" } } } };
  const safe = oauth.safeProviderError(error);
  assert.equal(safe.includes("secret"), false);
  assert.match(safe, /HTTP 400/);
  assert.match(safe, /190/);
  const route = fs.readFileSync(path.join(__dirname, "routes/social.js"), "utf8");
  const webhook = fs.readFileSync(path.join(__dirname, "routes/webhooks.js"), "utf8");
  const publishing = fs.readFileSync(path.join(__dirname, "services/socialPublishingService.js"), "utf8");
  assert.equal(route.includes("error.response?.data"), false);
  assert.ok(webhook.includes('META_AUTOMATIC_REPLIES_ENABLED === "true"'));
  assert.ok(publishing.includes('SOCIAL_PUBLISHING_ENABLED!=="true"'));
}

Promise.resolve().then(oauthChecks).then(subscriptionChecks).then(convergenceChecks).then(raceCheck).then(loggingAndSafetyChecks)
  .then(() => console.log("Meta pre-connection checks passed: actual permissions, token verification, subscriptions, convergence, race safety, idempotent/fail-closed outbound behavior, and secret-safe logging."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
