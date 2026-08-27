const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { encryptCredentials } = require("./utils/credentialEncryption");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.META_GRAPH_API_VERSION = "v26.0";
const service = require("./services/metaInsightsService");

function query(value) { return { select: async () => value }; }
const connection = {
  provider: "meta", status: "connected", authorization: { valid: true }, scopes: ["read_insights", "instagram_manage_insights"],
  selectedAssetIds: ["page-1", "ig-1"], expiresAt: new Date(Date.now() + 86400000),
  assets: [{ id: "page-1", name: "Ellie Page", type: "facebook_page" }, { id: "ig-1", parentId: "page-1", name: "Ellie IG", type: "instagram_business" }],
  credentialsEncrypted: encryptCredentials({ accessToken: "user-token", pageTokens: { "page-1": "page-token" } }),
};

async function run() {
  const calls = [];
  const result = await service.fetchWorkspaceInsights("workspace-1", {
    SocialConnection: { find(filter) { assert.deepEqual(filter, { workspaceId: "workspace-1", provider: "meta", status: "connected" }); return query([connection]); } },
    http: { async get(url, options) {
      calls.push({ url, options });
      assert.equal(options.params.access_token, "page-token");
      if (url.endsWith("/page-1")) return { data: { followers_count: 120 } };
      if (url.endsWith("/page-1/insights")) return { data: { data: [{ name: "page_post_engagements", values: [{ value: 15 }] }] } };
      if (url.endsWith("/ig-1")) return { data: { followers_count: 80, media_count: 12 } };
      return { data: { data: [{ name: "reach", values: [{ value: 40 }] }, { name: "profile_views", values: [{ value: 5 }] }] } };
    } },
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(result.assets.map(({ provider, followers, reach, engagements, profileViews }) => ({ provider, followers, reach, engagements, profileViews })), [
    { provider: "facebook", followers: 120, reach: null, engagements: 15, profileViews: null },
    { provider: "instagram", followers: 80, reach: 40, engagements: null, profileViews: 5 },
  ]);

  const permission = await service.fetchWorkspaceInsights("workspace-1", {
    SocialConnection: { find: () => query([{ ...connection, scopes: [] }]) }, http: { get: async () => { throw new Error("must not call provider without grants"); } },
  });
  assert.deepEqual(permission.assets.map(row => row.requiredPermission), ["read_insights", "instagram_manage_insights"]);
  assert(!JSON.stringify(result).includes("page-token"));
  console.log("Meta insights passed: selected assets, permission gating, safe metrics, and no credential exposure (mocked).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
