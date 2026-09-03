const assert = require("node:assert");
const crypto = require("node:crypto");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.LINKEDIN_CLIENT_ID = "test-linkedin-client";
process.env.LINKEDIN_CLIENT_SECRET = "test-linkedin-secret";
process.env.LINKEDIN_REDIRECT_URI = "https://api.example.test/api/social/linkedin/oauth/callback";
process.env.LINKEDIN_API_VERSION = "202604";

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

(async () => {
  let stored;
  const stateStore = {
    async create(value) { stored = value; return value; },
    async findOneAndUpdate(filter) {
      if (!stored || filter.nonceHash !== stored.nonceHash || stored.consumedAt) return null;
      stored.consumedAt = new Date();
      return stored;
    },
  };
  const request = await socialOAuth.createAuthorizationRequest("linkedin", {
    workspaceId: "64b000000000000000000001",
    user: { _id: "64b000000000000000000002" },
  }, { SocialOAuthState: stateStore });
  const requestState = new URL(request).searchParams.get("state");
  const consumed = await socialOAuth.consumeState(requestState, "linkedin", { SocialOAuthState: stateStore });
  assert.equal(consumed.workspaceId, "64b000000000000000000001");
  await assert.rejects(() => socialOAuth.consumeState(requestState, "linkedin", { SocialOAuthState: stateStore }), /already used or expired/);

  const calls = [];
  const http = {
    async post(url) {
      calls.push(url);
      return { data: { access_token: "mock-linkedin-token", expires_in: 3600, scope: "openid profile email rw_organization_admin w_organization_social" } };
    },
    async get(url) {
      calls.push(url);
      if (url.endsWith("/userinfo")) return { data: { sub: "member-1", name: "Business Owner", email: "owner@example.test" } };
      if (url.endsWith("/organizationAcls")) return { data: { elements: [{ organization: "urn:li:organization:12345", role: "ADMINISTRATOR" }] } };
      if (url.endsWith("/organizations/12345")) return { data: { id: 12345, localizedName: "Example Business", vanityName: "example-business" } };
      throw new Error("Unexpected mock LinkedIn request");
    },
  };
  const result = await socialOAuth.exchangeLinkedIn("mock-code", http);
  assert.deepEqual(result.assets, [{ id: "12345", name: "Example Business", username: "example-business", type: "linkedin_organization", permissions: ["ADMINISTRATOR"] }]);
  assert.equal(result.account.id, "member-1");
  assert.ok(calls.some(value => value.endsWith("/organizationAcls")));
  assert.ok(calls.some(value => value.endsWith("/organizations/12345")));

  let persistedConnection;
  const oauthStateStore = {
    record: null,
    async create(value) { this.record = value; return value; },
    async findOneAndUpdate(filter) {
      if (!this.record || this.record.consumedAt || filter.nonceHash !== this.record.nonceHash) return null;
      this.record.consumedAt = new Date();
      return this.record;
    },
  };
  const workspaceId = "64b000000000000000000011";
  const userId = "64b000000000000000000012";
  const requestForWorkspace = await socialOAuth.createAuthorizationRequest("linkedin", { workspaceId, user: { _id: userId } }, { SocialOAuthState: oauthStateStore });
  const workspaceState = new URL(requestForWorkspace).searchParams.get("state");
  const membership = { workspaceId: { _id: workspaceId, status: "active" }, userId, status: "active", role: "viewer", roles: ["viewer"], permissionOverrides: { allow: ["social.manage"], deny: [] } };
  const connection = await socialOAuth.exchangeCode("linkedin", "mock-code", workspaceState, {
    SocialOAuthState: oauthStateStore,
    models: { WorkspaceMembership: { findOne: () => ({ populate: async () => membership }) } },
    SocialConnection: { findOneAndUpdate: async (filter, update) => { persistedConnection = { filter, update }; return { ...filter, ...update.$set }; } },
    exchangeProvider: async () => result,
  });
  assert.equal(String(persistedConnection.filter.workspaceId), workspaceId);
  assert.equal(connection.connectedByUserId, userId);
  assert.equal(connection.provider, "linkedin");
  assert.ok(connection.credentialsEncrypted);
  assert.equal(JSON.stringify(connection).includes("mock-linkedin-token"), false, "Plain LinkedIn access tokens must not be persisted");

  const revokedStateStore = { record: null, create: oauthStateStore.create, findOneAndUpdate: oauthStateStore.findOneAndUpdate };
  const revokedRequest = await socialOAuth.createAuthorizationRequest("linkedin", { workspaceId, user: { _id: userId } }, { SocialOAuthState: revokedStateStore });
  await assert.rejects(() => socialOAuth.exchangeCode("linkedin", "mock-code", new URL(revokedRequest).searchParams.get("state"), {
    SocialOAuthState: revokedStateStore,
    models: { WorkspaceMembership: { findOne: () => ({ populate: async () => null }) } },
    exchangeProvider: async () => result,
  }), /no longer has permission/);

  console.log("Social OAuth one-time state and mocked LinkedIn organization discovery passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

const compoundIndex = SocialConnection.schema.indexes().find(([fields, options]) => fields.workspaceId === 1 && fields.provider === 1 && options.unique);
assert.ok(compoundIndex, "Social connections must be unique per workspace and provider");
assert.equal(SocialConnection.schema.path("credentialsEncrypted").options.select, false);

console.log("Social OAuth security checks passed");
