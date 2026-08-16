const crypto = require("node:crypto");
const McpAccessToken = require("../models/McpAccessToken");
const OAuthCredential = require("../models/OAuthCredential");
const { runWithWorkspace } = require("../tenancy/workspaceContext");

async function requireMcpAuth(req, res, next) {
  try {
    const match = String(req.headers.authorization || "").match(/^Bearer\s+((?:ellie_mcp|ellie_oauth)_[A-Za-z0-9_-]+)$/);
    const metadataUrl = `${String(process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
    if (!match) return res.status(401).set("WWW-Authenticate", `Bearer realm="growth-operator", resource_metadata="${metadataUrl}"`).json({ error: "A valid Growth Operator access token is required" });
    const tokenHash = crypto.createHash("sha256").update(match[1]).digest("hex");
    const token = match[1].startsWith("ellie_oauth_")
      ? await OAuthCredential.findOne({ kind: "access_token", valueHash: tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } }).select("+valueHash")
      : await McpAccessToken.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } }).select("+tokenHash");
    if (!token) return res.status(401).set("WWW-Authenticate", `Bearer realm="ellie-mcp", resource_metadata="${metadataUrl}"`).json({ error: "MCP access token is invalid or expired" });
    req.mcpAuth = { tokenId: token._id, workspaceId: token.workspaceId, userId: token.userId, scopes: token.scopes };
    if ("lastUsedAt" in token) { token.lastUsedAt = new Date(); token.save().catch(() => {}); }
    runWithWorkspace(req.mcpAuth.workspaceId, next);
  } catch (error) { next(error); }
}

module.exports = { requireMcpAuth };
