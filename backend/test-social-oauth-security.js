const assert = require("node:assert");
const crypto = require("node:crypto");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.LINKEDIN_CLIENT_ID = "test-linkedin-client";
process.env.LINKEDIN_CLIENT_SECRET = "test-linkedin-secret";
process.env.LINKEDIN_REDIRECT_URI = "https://api.example.test/api/social/linkedin/oauth/callback";

const SocialConnection = require("./models/SocialConnection");
const socialOAuth = require("./services/socialOAuthService");

const authorizationUrl = new URL(socialOAuth.authorizationUrl("linkedin", {
  workspaceId: "64b000000000000000000001",
  user: { _id: "64b000000000000000000002" },
}));
const state = authorizationUrl.searchParams.get("state");
const verified = socialOAuth.verifyState(state, "linkedin");

assert.equal(authorizationUrl.origin, "https://www.linkedin.com");
assert.equal(authorizationUrl.searchParams.get("client_id"), "test-linkedin-client");
assert.equal(verified.workspaceId, "64b000000000000000000001");
assert.equal(verified.userId, "64b000000000000000000002");
assert.equal(socialOAuth.verifyState(state, "meta"), null);
assert.equal(socialOAuth.verifyState(`${state}tampered`, "linkedin"), null);

const compoundIndex = SocialConnection.schema.indexes().find(([fields, options]) => fields.workspaceId === 1 && fields.provider === 1 && options.unique);
assert.ok(compoundIndex, "Social connections must be unique per workspace and provider");
assert.equal(SocialConnection.schema.path("credentialsEncrypted").options.select, false);

console.log("Social OAuth security checks passed");
