const crypto = require("crypto");
const mongoose = require("mongoose");

function safeEqual(provided, expected) {
  const left = Buffer.from(String(provided || "")), right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function configuredCredentials(environment = process.env) {
  const credentials = [];
  if (environment.JARVIS_MEMORY_SYNC_CREDENTIALS?.trim()) {
    let parsed;
    try { parsed = JSON.parse(environment.JARVIS_MEMORY_SYNC_CREDENTIALS); }
    catch { throw new Error("JARVIS_MEMORY_SYNC_CREDENTIALS must be valid JSON"); }
    for (const [workspaceId, secret] of Object.entries(parsed || {})) {
      if (mongoose.isValidObjectId(workspaceId) && typeof secret === "string" && secret.length >= 24) credentials.push({ workspaceId, secret, mode: "workspace_bound" });
    }
  }
  const legacyWorkspaceId = String(environment.JARVIS_MEMORY_SYNC_WORKSPACE_ID || "").trim();
  const legacySecret = String(environment.JARVIS_MEMORY_SYNC_SECRET || "").trim();
  if (mongoose.isValidObjectId(legacyWorkspaceId) && legacySecret.length >= 24) credentials.push({ workspaceId: legacyWorkspaceId, secret: legacySecret, mode: "legacy_workspace_bound" });
  return credentials;
}

function resolveWorkspace({ authorization }, environment = process.env) {
  const provided = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  const credential = configuredCredentials(environment).find((candidate) => safeEqual(provided, candidate.secret));
  if (!credential) return null;
  return { workspaceId: credential.workspaceId, mode: credential.mode };
}

module.exports = { configuredCredentials, resolveWorkspace, safeEqual };
