const crypto = require("crypto");
const axios = require("axios");
const IntegrationConnection = require("../models/IntegrationConnection");
const { encryptCredentials, decryptCredentials } = require("../utils/credentialEncryption");

const PROVIDER = "eventbrite";
const AUTHORIZE_URL = "https://www.eventbrite.com/oauth/authorize";
const TOKEN_URL = "https://www.eventbrite.com/oauth/token";

function requireConfig() {
  const clientId = String(process.env.EVENTBRITE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.EVENTBRITE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.EVENTBRITE_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Eventbrite OAuth is not configured");
  }
  return { clientId, clientSecret, redirectUri };
}

function stateSecret() {
  return Buffer.from(String(process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY || ""), "base64");
}

function createState() {
  const secret = stateSecret();
  if (secret.length !== 32) throw new Error("Integration credential encryption is not configured");
  const payload = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(18).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(state) {
  try {
    const secret = stateSecret();
    if (secret.length !== 32) return false;
    const [payload, signature] = String(state || "").split(".");
    if (!payload || !signature) return false;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(decoded.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function authorizationUrl() {
  const { clientId, redirectUri } = requireConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", createState());
  return url.toString();
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const response = await axios.post(TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const accessToken = response.data?.access_token;
  if (!accessToken) throw new Error("Eventbrite did not return an access token");

  const profile = await axios.get("https://www.eventbriteapi.com/v3/users/me/", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = profile.data || {};
  let organizations = [];
  try {
    const organizationResponse = await axios.get(
      "https://www.eventbriteapi.com/v3/users/me/organizations/",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    organizations = (organizationResponse.data?.organizations || []).map((organization) => ({
      id: String(organization.id),
      name: organization.name || "Eventbrite organization",
    }));
  } catch (error) {
    console.warn("EVENTBRITE ORGANIZATION LOOKUP WARNING:", error.response?.data || error.message);
  }
  const encrypted = encryptCredentials({ accessToken });
  const connection = await IntegrationConnection.findOneAndUpdate(
    { provider: PROVIDER },
    {
      $set: {
        status: "connected",
        credentialsEncrypted: encrypted,
        settings: {
          email: user.emails?.[0]?.email || "",
          organizations,
          defaultOrganizationId: organizations[0]?.id || "",
        },
        "oauth.providerAccountId": String(user.id || ""),
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastError: null,
      },
      $unset: { credentials: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return connection;
}

async function accessToken() {
  const connection = await IntegrationConnection.findOne({ provider: PROVIDER })
    .select("+credentialsEncrypted");
  if (connection?.credentialsEncrypted) {
    return decryptCredentials(connection.credentialsEncrypted).accessToken;
  }
  return String(process.env.EVENTBRITE_PRIVATE_TOKEN || "").trim();
}

async function status() {
  const connection = await IntegrationConnection.findOne({ provider: PROVIDER });
  return {
    configured: Boolean(
      process.env.EVENTBRITE_CLIENT_ID &&
      process.env.EVENTBRITE_CLIENT_SECRET &&
      process.env.EVENTBRITE_REDIRECT_URI &&
      process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY
    ),
    connected: connection?.status === "connected",
    status: connection?.status || (process.env.EVENTBRITE_PRIVATE_TOKEN ? "legacy_token" : "disconnected"),
    connectedAt: connection?.connectedAt || null,
    lastVerifiedAt: connection?.lastVerifiedAt || null,
    lastError: connection?.lastError || null,
    accountEmail: connection?.settings?.email || "",
    organizations: connection?.settings?.organizations || [],
    defaultOrganizationId: connection?.settings?.defaultOrganizationId ||
      String(process.env.EVENTBRITE_ORGANIZATION_ID || "").trim(),
  };
}

async function organizationId(requestedId = "") {
  if (requestedId) return String(requestedId);
  const connection = await IntegrationConnection.findOne({ provider: PROVIDER });
  return connection?.settings?.defaultOrganizationId ||
    connection?.settings?.organizations?.[0]?.id ||
    String(process.env.EVENTBRITE_ORGANIZATION_ID || "").trim();
}

async function disconnect() {
  await IntegrationConnection.findOneAndUpdate(
    { provider: PROVIDER },
    {
      $set: {
        status: "disconnected",
        connectedAt: null,
        lastVerifiedAt: null,
        lastError: null,
        settings: {},
        "oauth.providerAccountId": "",
      },
      $unset: {
        credentials: 1,
        credentialsEncrypted: 1,
        credentialFingerprint: 1,
      },
    },
  );
  return status();
}

module.exports = {
  authorizationUrl,
  verifyState,
  exchangeCode,
  accessToken,
  status,
  disconnect,
  organizationId,
};
