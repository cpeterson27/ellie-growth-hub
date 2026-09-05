const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const axios = require("axios");
const oauth = require("./services/socialOAuthService");
const settings = require("./services/socialProviderConfig");
const Connection = require("./models/SocialConnection");
const Membership = require("./models/WorkspaceMembership");
const SocialOAuthState = require("./models/SocialOAuthState");
const health = require("./services/socialConnectionHealth");
const notifyOwners = health.notifyOwners;
health.notifyOwners = async () => {}; // Notification persistence tested separately, no database.
const { decryptCredentials } = require("./utils/credentialEncryption");
const routes = require("./routes/social");
const env = {
  META_APP_ID: "fb-app",
  META_APP_SECRET: "fb-secret",
  FACEBOOK_LOGIN_CONFIG_ID: "123456789",
  META_REDIRECT_URI:
    "https://ellie-ai-backend.onrender.com/api/social/meta/oauth/callback",
  INSTAGRAM_APP_ID: "ig-app",
  INSTAGRAM_APP_SECRET: "ig-secret",
  INSTAGRAM_REDIRECT_URI:
    "https://ellie-ai-backend.onrender.com/api/social/instagram/oauth/callback",
  META_GRAPH_API_VERSION: "v26.0",
  FRONTEND_URL: "https://elliescoaching.com",
  INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: crypto
    .randomBytes(32)
    .toString("base64"),
};
Object.assign(process.env, env);
delete process.env.META_OAUTH_SCOPES;
delete process.env.INSTAGRAM_OAUTH_SCOPES;
const auth = { workspaceId: "workspace-a", user: { _id: "owner-a" } };
const url = (provider) => new URL(oauth.authorizationUrl(provider, auth));
const fb = url("meta"),
  ig = url("instagram");
assert.equal(fb.pathname, "/v26.0/dialog/oauth");
assert.equal(fb.searchParams.get("config_id"), env.FACEBOOK_LOGIN_CONFIG_ID);
assert.equal(fb.searchParams.get("response_type"), "code");
assert.equal(fb.searchParams.get("override_default_response_type"), "true");
assert(!fb.searchParams.has("scope"));
assert(!fb.searchParams.has("client_secret"));
assert.equal(ig.origin, "https://www.instagram.com");
assert.equal(ig.pathname, "/oauth/authorize");
assert.equal(ig.searchParams.get("client_id"), "ig-app");
assert.equal(ig.searchParams.get("enable_fb_login"), "0");
assert(!ig.searchParams.has("config_id"));
assert(!ig.searchParams.get("scope").includes("pages_"));
for (const [provider, value] of [
  ["meta", fb],
  ["instagram", ig],
]) {
  assert.equal(
    value.searchParams.get("redirect_uri"),
    env[provider === "meta" ? "META_REDIRECT_URI" : "INSTAGRAM_REDIRECT_URI"],
  );
  const state = value.searchParams.get("state");
  assert.equal(
    oauth.verifyState(state, provider).workspaceId,
    auth.workspaceId,
  );
  assert.equal(oauth.verifyState(state, provider).userId, auth.user._id);
  assert.equal(oauth.verifyState(state + ".extra", provider), null);
  assert.equal(
    oauth.verifyState(state, provider === "meta" ? "instagram" : "meta"),
    null,
  );
}
for (const [key, value] of [
  ["FACEBOOK_LOGIN_CONFIG_ID", ""],
  ["FACEBOOK_LOGIN_CONFIG_ID", "abc"],
  ["META_GRAPH_API_VERSION", "v26.0/bad"],
  ["META_REDIRECT_URI", "https://example.test/wrong"],
  ["META_OAUTH_SCOPES", "pages_manage_postspages_manage_engagement"],
  ["META_OAUTH_SCOPES", "instagram_basicinstagram_manage_messages"],
]) {
  const old = process.env[key];
  process.env[key] = value;
  assert.throws(() => url("meta"));
  assert.equal(oauth.configured("meta"), false);
  if (old === undefined) delete process.env[key];
  else process.env[key] = old;
}
for (const value of [
  "",
  "instagram_basic",
  "instagram_business_basicinstagram_business_manage_messages",
]) {
  process.env.INSTAGRAM_OAUTH_SCOPES = value;
  assert.throws(() => url("instagram"));
}
delete process.env.INSTAGRAM_OAUTH_SCOPES;
delete process.env.FACEBOOK_LOGIN_CONFIG_ID;
assert.equal(
  oauth.configured("instagram"),
  true,
  "Instagram must not require Facebook Business configuration",
);
process.env.FACEBOOK_LOGIN_CONFIG_ID = env.FACEBOOK_LOGIN_CONFIG_ID;
delete process.env.INSTAGRAM_APP_SECRET;
assert.equal(oauth.configured("instagram"), false);
assert.equal(
  oauth.configured("meta"),
  true,
  "Facebook must not require Instagram credentials",
);
process.env.INSTAGRAM_APP_SECRET = env.INSTAGRAM_APP_SECRET;
assert.deepEqual(
  settings.scopes(
    "meta",
    "pages_show_list, pages_manage_posts pages_show_list",
  ),
  ["pages_show_list", "pages_manage_posts"],
);
assert.deepEqual(Connection.schema.path("provider").enumValues, [
  ...settings.SOCIAL_PROVIDERS,
]);
assert.equal(
  Connection.schema.path("credentialsEncrypted").options.select,
  false,
);

const stored = new Map();
let authorized = true;
const calls = [];
const originals = {
  get: axios.get,
  post: axios.post,
  delete: axios.delete,
  findOne: Connection.findOne,
  update: Connection.findOneAndUpdate,
  membership: Membership.findOne,
  consumeState: SocialOAuthState.findOneAndUpdate,
};
const keyFor = (filter) => `${filter.workspaceId}:${filter.provider}`;
const query = (value) => ({
  select: async () => value,
  lean: async () => value,
});
async function run() {
  SocialOAuthState.findOneAndUpdate = async () => ({ consumedAt: new Date() });
  try {
    await assert.rejects(
      oauth.verifyMetaToken(
        "fixture",
        { apiVersion: "v26.0", clientId: "fb-app", clientSecret: "fixture" },
        {
          get: async () => ({
            data: { data: { is_valid: true, app_id: "wrong-app" } },
          }),
        },
      ),
      /invalid authorization/,
    );
    Membership.findOne = (filter) => {
      assert.equal(filter.workspaceId, "workspace-a");
      assert.equal(filter.userId, "owner-a");
      const membership = authorized
        ? {
            workspaceId: { _id: "workspace-a", status: "active" },
            userId: "owner-a",
            status: "active",
            roles: ["owner"],
          }
        : null;
      return { populate: async () => membership };
    };
    Connection.findOneAndUpdate = async (filter, update) => {
      assert.equal(filter.workspaceId, "workspace-a");
      const row = { ...stored.get(keyFor(filter)), ...update.$set, ...filter };
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      row.toObject = () => ({ ...row });
      row.save = async () => {
        stored.set(keyFor(filter), row);
      };
      stored.set(keyFor(filter), row);
      return row;
    };
    Connection.findOne = (filter) => query(stored.get(keyFor(filter)) || null);
    axios.get = async (address, options) => {
      calls.push(address);
      const u = new URL(address);
      if (!address.endsWith("/access_token"))
        assert(u.pathname.startsWith("/v26.0/"));
      if (u.hostname === "graph.facebook.com") {
        if (address.endsWith("/oauth/access_token"))
          return {
            data: {
              access_token: options.params.grant_type ? "fb-long" : "fb-short",
              expires_in: 3600,
            },
          };
        if (address.endsWith("/debug_token"))
          return {
            data: {
              data: { is_valid: true, app_id: "fb-app", user_id: "fb-user" },
            },
          };
        if (address.endsWith("/me"))
          return { data: { id: "fb-user", name: "Fixture" } };
        if (address.endsWith("/me/permissions"))
          return {
            data: {
              data: [{ permission: "pages_show_list", status: "granted" }],
            },
          };
        if (address.endsWith("/page-a"))
          return { data: { id: "page-a", access_token: "page-secret" } };
        if (address.endsWith("/me/accounts"))
          return {
            data: {
              data: [
                {
                  id: "page-a",
                  name: "Fixture Page",
                  access_token: "page-secret",
                  instagram_business_account: {
                    id: "linked-ig",
                    username: "linked",
                  },
                },
              ],
            },
          };
        if (address.endsWith("/subscribed_apps"))
          return {
            data: {
              data: [
                {
                  id: "fb-app",
                  subscribed_fields: oauth.subscriptionFields({
                    type: "facebook_page",
                  }),
                },
              ],
            },
          };
      }
      if (u.hostname === "graph.instagram.com") {
        if (address.endsWith("/access_token"))
          return { data: { access_token: "ig-long", expires_in: 3600 } };
        if (
          address.endsWith("/me") &&
          options.params.fields === "user_id,username"
        ) {
          return { data: { user_id: "ig-user", username: "fixture" } };
        }
        if (address.endsWith("/me/permissions"))
          return {
            data: {
              data: [
                { permission: "instagram_business_basic", status: "granted" },
                {
                  permission: "instagram_business_content_publish",
                  status: "declined",
                },
              ],
            },
          };
        if (address.endsWith("/subscribed_apps"))
          return {
            data: {
              data: [
                {
                  id: "ig-app",
                  subscribed_fields: oauth.subscriptionFields({
                    type: "instagram_business",
                  }),
                },
              ],
            },
          };
      }
      throw Error("Unexpected mocked request");
    };
    axios.post = async (address, body) => {
      calls.push(address);
      if (address === "https://api.instagram.com/oauth/access_token") {
        assert.equal(new URLSearchParams(body).get("client_id"), "ig-app");
        return { data: { access_token: "ig-short", user_id: "ig-user" } };
      }
      assert(
        address.includes("/v26.0/") && address.endsWith("/subscribed_apps"),
      );
      return { data: { success: true } };
    };
    axios.delete = async (address) => {
      calls.push(address);
      assert(address.includes("graph.facebook.com/v26.0/me/permissions"));
      return { data: { success: true } };
    };
    const callback = routes.stack
      .find((layer) => layer.route?.path === "/:provider/oauth/callback")
      .route.stack.at(-1).handle;
    for (const provider of ["meta", "instagram"]) {
      const state = url(provider).searchParams.get("state");
      let redirect;
      await callback(
        { params: { provider }, query: { code: "mock-code", state } },
        {
          redirect(value) {
            redirect = value;
          },
        },
      );
      assert.equal(new URL(redirect).searchParams.get("status"), "connected");
      const row = stored.get(`workspace-a:${provider}`);
      assert(row.credentialsEncrypted);
      assert(
        !JSON.stringify(row.credentialsEncrypted).includes(
          provider === "meta" ? "fb-long" : "ig-long",
        ),
      );
      assert.equal(
        decryptCredentials(row.credentialsEncrypted).accessToken,
        provider === "meta" ? "fb-long" : "ig-long",
      );
      assert.equal(
        (await oauth.status("workspace-a", provider)).connected,
        true,
      );
      assert.equal(
        (await oauth.status("workspace-b", provider)).connected,
        false,
      );
      assert(
        !(
          "credentialsEncrypted" in
          (await oauth.status("workspace-a", provider))
        ),
      );
      const asset = provider === "meta" ? "page-a" : "ig-user";
      await assert.rejects(
        oauth.selectAssets("workspace-a", provider, ["unowned"]),
        /Choose only assets/,
      );
      const result = await oauth.selectAssets("workspace-a", provider, [asset]);
      assert.equal(result.webhookSubscriptions[0].status, "subscribed");
    }
    assert.equal(stored.get("workspace-a:meta").assets.length, 2);
    assert.deepEqual(stored.get("workspace-a:instagram").scopes, [
      "instagram_business_basic",
    ]);
    const providerCode100 = Object.assign(
      new Error("provider rejected profile fields"),
      {
        response: {
          status: 400,
          data: {
            error: {
              code: 100,
              error_subcode: 33,
              type: "IGApiException",
              message:
                "Tried accessing nonexisting field (user_id) on node type (IGUser)",
              fbtrace_id: "safe-trace",
            },
          },
        },
      },
    );
    await assert.rejects(
      oauth.exchangeInstagram("mock-code", {
        post: async () => ({
          data: { access_token: "ig-short", user_id: "ig-user" },
        }),
        get: async (address) => {
          if (address.endsWith("/access_token"))
            return { data: { access_token: "ig-long", expires_in: 3600 } };
          if (address.endsWith("/me")) throw providerCode100;
          throw new Error("Unexpected request after provider failure");
        },
      }),
      (error) => {
        const diagnostic = oauth.safeProviderDiagnostic(error);
        assert.equal(diagnostic.operation, "instagram_profile_verification");
        assert.equal(diagnostic.providerCode, "100");
        assert.equal(diagnostic.providerSubcode, "33");
        assert.equal(diagnostic.providerType, "IGApiException");
        assert.equal(diagnostic.traceId, "safe-trace");
        assert.match(diagnostic.providerMessage, /nonexisting field/);
        return true;
      },
    );
    authorized = false;
    const count = calls.length;
    await assert.rejects(
      oauth.exchangeCode("meta", "code", fb.searchParams.get("state")),
      /permission/,
    );
    assert.equal(calls.length, count);
    await assert.rejects(
      oauth.exchangeCode("instagram", "code", fb.searchParams.get("state")),
      /invalid/,
    );
    for (const provider of ["meta", "instagram"]) {
      await oauth.disconnect("workspace-a", provider);
      assert.equal(
        (await oauth.status("workspace-a", provider)).connected,
        false,
      );
      assert(!stored.get(`workspace-a:${provider}`).credentialsEncrypted);
    }
    console.log(
      "Meta OAuth architecture passed: Business config, both URLs/callbacks, signed state, invalid config/scopes, encrypted upsert, workspace permissions, account discovery/status, subscriptions and local disconnect. All provider requests mocked.",
    );
  } finally {
    axios.get = originals.get;
    axios.post = originals.post;
    axios.delete = originals.delete;
    Connection.findOne = originals.findOne;
    Connection.findOneAndUpdate = originals.update;
    Membership.findOne = originals.membership;
    SocialOAuthState.findOneAndUpdate = originals.consumeState;
  }
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    health.notifyOwners = notifyOwners;
  });
