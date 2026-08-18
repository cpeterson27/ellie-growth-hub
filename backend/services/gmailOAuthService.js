const crypto = require("crypto");
const IntegrationConnection = require("../models/IntegrationConnection");
const { encryptCredentials, decryptCredentials } = require("../utils/credentialEncryption");

const scopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
];

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function stateSecret() {
  return required("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY");
}

function createState(workspaceId, userId) {
  if (!workspaceId || !userId) throw new Error("A signed-in workspace owner is required");
  const payload = Buffer.from(JSON.stringify({ workspaceId: String(workspaceId), userId: String(userId), createdAt: Date.now(), nonce: crypto.randomBytes(16).toString("hex") })).toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(state) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return Date.now() - Number(parsed.createdAt) < 10 * 60 * 1000 && parsed.workspaceId && parsed.userId ? parsed : null;
}

function authorizationUrl(workspaceId, userId) {
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    redirect_uri: required("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state: createState(workspaceId, userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      redirect_uri: required("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(tokens.error_description || "Google token exchange failed");
  return tokens;
}

async function googleProfile(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json();
  if (!response.ok) throw new Error("Unable to read the connected Google account");
  return profile;
}

async function saveConnection(tokens, profile) {
  const existing = await IntegrationConnection.findOne({ provider: "gmail" }).select("+credentialsEncrypted");
  let previous = {};
  if (existing?.credentialsEncrypted) previous = decryptCredentials(existing.credentialsEncrypted);
  const encrypted = encryptCredentials({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || previous.refreshToken,
  });
  return IntegrationConnection.findOneAndUpdate(
    { provider: "gmail" },
    {
      $set: {
        status: "connected",
        credentialsEncrypted: encrypted,
        settings: { email: profile.email, name: profile.name || "" },
        oauth: {
          scopes: String(tokens.scope || "").split(" ").filter(Boolean),
          expiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000),
          providerAccountId: profile.sub || "",
        },
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastError: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function status() {
  const connection = await IntegrationConnection.findOne({ provider: "gmail" });
  return {
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY),
    connected: connection?.status === "connected",
    email: connection?.settings?.email || "",
    name: connection?.settings?.name || "",
    scopes: connection?.oauth?.scopes || [],
    connectedAt: connection?.connectedAt || null,
  };
}

async function accessToken() {
  const connection = await IntegrationConnection.findOne({ provider: "gmail" }).select("+credentialsEncrypted");
  if (!connection?.credentialsEncrypted || connection.status !== "connected") throw new Error("Gmail is not connected");
  const credentials = decryptCredentials(connection.credentialsEncrypted);
  if (credentials.accessToken && connection.oauth?.expiresAt && new Date(connection.oauth.expiresAt).getTime() > Date.now() + 60000) {
    return credentials.accessToken;
  }
  if (!credentials.refreshToken) throw new Error("Reconnect Gmail to grant offline access");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await response.json();
  if (!response.ok) throw new Error(refreshed.error_description || "Gmail access refresh failed");
  connection.credentialsEncrypted = encryptCredentials({ ...credentials, accessToken: refreshed.access_token });
  connection.oauth.expiresAt = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000);
  connection.lastVerifiedAt = new Date();
  await connection.save();
  return refreshed.access_token;
}

async function gmailRequest(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail request failed");
  return data;
}

function header(message, name) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function emailAddress(value = "") {
  return String(value).match(/<([^>]+)>/)?.[1]?.trim().toLowerCase()
    || String(value).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase()
    || "";
}

function displayName(value = "") {
  const raw = String(value).trim();
  return raw.includes("<") ? raw.slice(0, raw.indexOf("<")).replace(/^"|"$/g, "").trim() : emailAddress(raw);
}

function attachmentMetadata(part = {}, result = []) {
  if (part.filename) result.push({ name: part.filename, contentType: part.mimeType || "", size: Number(part.body?.size || 0), providerId: part.body?.attachmentId || "" });
  for (const child of part.parts || []) attachmentMetadata(child, result);
  return result;
}

function decodeBody(data = "") {
  if (!data) return "";
  try { return Buffer.from(data, "base64url").toString("utf8"); }
  catch { return ""; }
}

function messageBody(part = {}) {
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  const plain = (part.parts || []).map(messageBody).find(Boolean);
  if (plain) return plain;
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBody(part.body.data).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
  }
  return part.body?.data ? decodeBody(part.body.data) : "";
}

async function listThreads({ query = "in:inbox", maxResults = 20 } = {}) {
  const list = await gmailRequest(`/threads?${new URLSearchParams({ q: query, maxResults: String(Math.min(50, maxResults)) })}`);
  const threads = await Promise.all((list.threads || []).map(async ({ id }) => {
    const thread = await gmailRequest(`/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
    const message = thread.messages?.[thread.messages.length - 1] || {};
    return { id, messageCount: thread.messages?.length || 0, from: header(message, "From"), to: header(message, "To"), subject: header(message, "Subject") || "(no subject)", date: header(message, "Date"), snippet: message.snippet || "", labels: message.labelIds || [] };
  }));
  return { threads, nextPageToken: list.nextPageToken || null };
}

async function getThread(threadId) {
  const thread = await gmailRequest(`/threads/${encodeURIComponent(threadId)}?format=full`);
  return {
    id: thread.id,
    messages: (thread.messages || []).map((message) => ({
      id: message.id,
      threadId: message.threadId,
      from: header(message, "From"),
      to: header(message, "To"),
      cc: header(message, "Cc"),
      bcc: header(message, "Bcc"),
      subject: header(message, "Subject") || "(no subject)",
      date: header(message, "Date"),
      messageId: header(message, "Message-ID"),
      labels: message.labelIds || [],
      body: messageBody(message.payload),
      snippet: message.snippet || "",
      internalDate: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
      attachments: attachmentMetadata(message.payload),
    })),
  };
}

async function modifyThread(threadId, action) {
  const operations = {
    archive: { removeLabelIds: ["INBOX"] },
    trash: null,
    untrash: null,
    read: { removeLabelIds: ["UNREAD"] },
    unread: { addLabelIds: ["UNREAD"] },
  };
  if (!(action in operations)) throw new Error("Unsupported Gmail action");
  if (action === "trash") return gmailRequest(`/threads/${encodeURIComponent(threadId)}/trash`, { method: "POST", body: "{}" });
  if (action === "untrash") return gmailRequest(`/threads/${encodeURIComponent(threadId)}/untrash`, { method: "POST", body: "{}" });
  return gmailRequest(`/threads/${encodeURIComponent(threadId)}/modify`, { method: "POST", body: JSON.stringify(operations[action]) });
}

async function deleteThreads(threadIds = []) {
  const uniqueIds = [...new Set(threadIds.map(String).filter(Boolean))].slice(0, 100);
  await Promise.all(uniqueIds.map((threadId) =>
    gmailRequest(`/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" })
  ));
  return { deleted: uniqueIds.length };
}

async function emptyTrash() {
  let deleted = 0;
  while (true) {
    const result = await gmailRequest(`/threads?${new URLSearchParams({ q: "in:trash", maxResults: "100" })}`);
    const threadIds = (result.threads || []).map((thread) => thread.id).filter(Boolean);
    if (!threadIds.length) break;
    await Promise.all(threadIds.map((threadId) =>
      gmailRequest(`/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" })
    ));
    deleted += threadIds.length;
  }
  return { deleted };
}

async function sendMessage({ to, subject, body, threadId = null, inReplyTo = "" }) {
  if (!String(to || "").includes("@")) throw new Error("A valid recipient email is required");
  if (!String(subject || "").trim() || !String(body || "").trim()) throw new Error("Subject and message are required");
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "",
    body,
  ];
  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
  return gmailRequest("/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
}

module.exports = { authorizationUrl, deleteThreads, displayName, emailAddress, emptyTrash, exchangeCode, getThread, googleProfile, listThreads, modifyThread, saveConnection, sendMessage, status, verifyState };
