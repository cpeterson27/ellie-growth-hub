const crypto = require("crypto");
const axios = require("axios");
const SocialConnection = require("../models/SocialConnection");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { encryptCredentials, decryptCredentials } = require("../utils/credentialEncryption");

const PROVIDERS = new Set(["linkedin", "meta"]);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function splitScopes(value) {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function config(provider) {
  if (!PROVIDERS.has(provider)) throw new Error("Unsupported social provider");
  if (provider === "linkedin") return {
    clientId: required("LINKEDIN_CLIENT_ID"),
    clientSecret: required("LINKEDIN_CLIENT_SECRET"),
    redirectUri: required("LINKEDIN_REDIRECT_URI"),
    scopes: splitScopes(process.env.LINKEDIN_OAUTH_SCOPES || "openid profile email"),
    apiVersion: String(process.env.LINKEDIN_API_VERSION || "").trim(),
  };
  return {
    clientId: required("META_APP_ID"),
    clientSecret: required("META_APP_SECRET"),
    redirectUri: required("META_REDIRECT_URI"),
    scopes: splitScopes(process.env.META_OAUTH_SCOPES || "pages_show_list pages_read_engagement"),
    apiVersion: required("META_GRAPH_API_VERSION"),
  };
}

function stateKey() {
  const key = Buffer.from(required("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

function createState({ provider, workspaceId, userId }) {
  const payload = Buffer.from(JSON.stringify({ provider, workspaceId: String(workspaceId), userId: String(userId), nonce: crypto.randomBytes(18).toString("hex"), expiresAt: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", stateKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(rawState, expectedProvider) {
  try {
    const [payload, signature] = String(rawState || "").split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", stateKey()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (state.provider !== expectedProvider || Number(state.expiresAt) <= Date.now() || !state.workspaceId || !state.userId) return null;
    return state;
  } catch { return null; }
}

function configured(provider) {
  try { config(provider); stateKey(); return true; }
  catch { return false; }
}

function authorizationUrl(provider, auth) {
  const providerConfig = config(provider);
  const state = createState({ provider, workspaceId: auth.workspaceId, userId: auth.user._id });
  if (provider === "linkedin") {
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.search = new URLSearchParams({ response_type: "code", client_id: providerConfig.clientId, redirect_uri: providerConfig.redirectUri, state, scope: providerConfig.scopes.join(" ") }).toString();
    return url.toString();
  }
  const url = new URL(`https://www.facebook.com/${providerConfig.apiVersion}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: providerConfig.clientId, redirect_uri: providerConfig.redirectUri, state, response_type: "code", scope: providerConfig.scopes.join(",") }).toString();
  return url.toString();
}

async function linkedinAssets(accessToken, providerConfig) {
  if (!providerConfig.apiVersion) return [];
  try {
    const response = await axios.get("https://api.linkedin.com/rest/organizationAcls", {
      params: { q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED" },
      headers: { Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": providerConfig.apiVersion, "X-Restli-Protocol-Version": "2.0.0" },
      timeout: 15000,
    });
    return (response.data?.elements || []).map((item) => ({ id: String(item.organization || "").replace("urn:li:organization:", ""), name: "LinkedIn organization", type: "linkedin_organization", permissions: [item.role].filter(Boolean) })).filter((item) => item.id);
  } catch { return []; }
}

async function exchangeLinkedIn(code) {
  const providerConfig = config("linkedin");
  const tokenResponse = await axios.post("https://www.linkedin.com/oauth/v2/accessToken", new URLSearchParams({ grant_type: "authorization_code", code, client_id: providerConfig.clientId, client_secret: providerConfig.clientSecret, redirect_uri: providerConfig.redirectUri }).toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  const accessToken = tokenResponse.data?.access_token;
  if (!accessToken) throw new Error("LinkedIn did not return an access token");
  const profileResponse = await axios.get("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
  const profile = profileResponse.data || {};
  return {
    credentials: { accessToken },
    scopes: splitScopes(tokenResponse.data?.scope || providerConfig.scopes.join(" ")),
    expiresAt: tokenResponse.data?.expires_in ? new Date(Date.now() + Number(tokenResponse.data.expires_in) * 1000) : null,
    account: { id: String(profile.sub || ""), name: profile.name || "LinkedIn member", email: profile.email || "" },
    assets: await linkedinAssets(accessToken, providerConfig),
  };
}

async function exchangeMeta(code) {
  const providerConfig = config("meta");
  const tokenResponse = await axios.get(`https://graph.facebook.com/${providerConfig.apiVersion}/oauth/access_token`, { params: { client_id: providerConfig.clientId, client_secret: providerConfig.clientSecret, redirect_uri: providerConfig.redirectUri, code }, timeout: 15000 });
  const shortToken = tokenResponse.data?.access_token;
  if (!shortToken) throw new Error("Meta did not return an access token");
  let accessToken = shortToken;
  try {
    const longLived = await axios.get(`https://graph.facebook.com/${providerConfig.apiVersion}/oauth/access_token`, { params: { grant_type: "fb_exchange_token", client_id: providerConfig.clientId, client_secret: providerConfig.clientSecret, fb_exchange_token: shortToken }, timeout: 15000 });
    accessToken = longLived.data?.access_token || shortToken;
    if (longLived.data?.expires_in) tokenResponse.data.expires_in = longLived.data.expires_in;
  } catch { /* A short-lived token remains valid for initial setup. */ }
  const profileResponse = await axios.get(`https://graph.facebook.com/${providerConfig.apiVersion}/me`, { params: { fields: "id,name", access_token: accessToken }, timeout: 15000 });
  const pagesResponse = await axios.get(`https://graph.facebook.com/${providerConfig.apiVersion}/me/accounts`, { params: { fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}", access_token: accessToken }, timeout: 15000 });
  const pageTokens = {};
  const assets = [];
  for (const page of pagesResponse.data?.data || []) {
    if (page.access_token) pageTokens[String(page.id)] = page.access_token;
    assets.push({ id: String(page.id), name: page.name || "Facebook Page", type: "facebook_page", permissions: page.tasks || [] });
    if (page.instagram_business_account?.id) assets.push({ id: String(page.instagram_business_account.id), name: page.instagram_business_account.name || page.instagram_business_account.username || "Instagram business account", username: page.instagram_business_account.username || "", type: "instagram_business", parentId: String(page.id), permissions: page.tasks || [] });
  }
  return {
    credentials: { accessToken, pageTokens },
    scopes: providerConfig.scopes,
    expiresAt: tokenResponse.data?.expires_in ? new Date(Date.now() + Number(tokenResponse.data.expires_in) * 1000) : null,
    account: { id: String(profileResponse.data?.id || ""), name: profileResponse.data?.name || "Meta account", email: "" },
    assets,
  };
}

async function exchangeCode(provider, code, rawState) {
  const state = verifyState(rawState, provider);
  if (!state) throw new Error("Social connection request expired or is invalid");
  const membership = await WorkspaceMembership.findOne({ workspaceId: state.workspaceId, userId: state.userId, status: "active", role: { $in: ["owner", "admin"] } });
  if (!membership) throw new Error("The user who started this connection no longer has permission to complete it");
  const result = provider === "linkedin" ? await exchangeLinkedIn(code) : await exchangeMeta(code);
  const connection = await SocialConnection.findOneAndUpdate(
    { workspaceId: state.workspaceId, provider },
    { $set: { status: "connected", credentialsEncrypted: encryptCredentials(result.credentials), scopes: result.scopes, expiresAt: result.expiresAt, providerAccount: result.account, assets: result.assets, selectedAssetIds: [], connectedByUserId: state.userId, connectedAt: new Date(), lastVerifiedAt: new Date(), lastError: "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return connection;
}

function publicConnection(connection, provider) {
  return {
    provider,
    configured: configured(provider),
    connected: connection?.status === "connected",
    status: connection?.status || "disconnected",
    scopes: connection?.scopes || [],
    expiresAt: connection?.expiresAt || null,
    account: connection?.providerAccount || null,
    assets: connection?.assets || [],
    selectedAssetIds: connection?.selectedAssetIds || [],
    connectedAt: connection?.connectedAt || null,
    lastVerifiedAt: connection?.lastVerifiedAt || null,
    lastError: connection?.lastError || "",
  };
}

async function status(workspaceId, provider) {
  const connection = await SocialConnection.findOne({ workspaceId, provider }).lean();
  if (connection?.status === "connected" && connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now()) {
    await SocialConnection.updateOne({ _id: connection._id }, { $set: { status: "expired", lastError: "Authorization expired. Reconnect this account." } });
    connection.status = "expired";
    connection.lastError = "Authorization expired. Reconnect this account.";
  }
  return publicConnection(connection, provider);
}

async function selectAssets(workspaceId, provider, assetIds) {
  const connection = await SocialConnection.findOne({ workspaceId, provider });
  if (!connection || connection.status !== "connected") throw new Error(`${provider} is not connected`);
  const allowed = new Set(connection.assets.map((asset) => String(asset.id)));
  const selected = [...new Set((assetIds || []).map(String))];
  if (selected.some((id) => !allowed.has(id))) throw new Error("Choose only assets returned by the connected provider");
  connection.selectedAssetIds = selected;
  await connection.save();
  return publicConnection(connection.toObject(), provider);
}

async function disconnect(workspaceId, provider) {
  const connection = await SocialConnection.findOne({ workspaceId, provider }).select("+credentialsEncrypted");
  if (connection?.credentialsEncrypted) {
    try {
      const credentials = decryptCredentials(connection.credentialsEncrypted);
      if (provider === "meta" && credentials.accessToken) {
        const providerConfig = config("meta");
        await axios.delete(`https://graph.facebook.com/${providerConfig.apiVersion}/me/permissions`, { params: { access_token: credentials.accessToken }, timeout: 15000 });
      }
    } catch { /* Local disconnect must still complete if provider revocation fails. */ }
  }
  await SocialConnection.findOneAndUpdate({ workspaceId, provider }, { $set: { status: "disconnected", assets: [], selectedAssetIds: [], scopes: [], providerAccount: {}, connectedAt: null, lastVerifiedAt: null, lastError: "" }, $unset: { credentialsEncrypted: 1, expiresAt: 1 } });
  return status(workspaceId, provider);
}

module.exports = { authorizationUrl, configured, disconnect, exchangeCode, selectAssets, status, verifyState };
