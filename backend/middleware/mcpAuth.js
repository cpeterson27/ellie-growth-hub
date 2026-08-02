const crypto = require("node:crypto");
const McpAccessToken = require("../models/McpAccessToken");

async function requireMcpAuth(req, res, next) {
  try {
    const match = String(req.headers.authorization || "").match(/^Bearer\s+(ellie_mcp_[A-Za-z0-9_-]+)$/);
    if (!match) return res.status(401).set("WWW-Authenticate", 'Bearer realm="ellie-mcp"').json({ error: "A valid Ellie MCP access token is required" });
    const tokenHash = crypto.createHash("sha256").update(match[1]).digest("hex");
    const token = await McpAccessToken.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } }).select("+tokenHash");
    if (!token) return res.status(401).set("WWW-Authenticate", 'Bearer realm="ellie-mcp"').json({ error: "MCP access token is invalid or expired" });
    req.mcpAuth = { tokenId: token._id, workspaceId: token.workspaceId, userId: token.userId, scopes: token.scopes };
    token.lastUsedAt = new Date();
    token.save().catch(() => {});
    next();
  } catch (error) { next(error); }
}

module.exports = { requireMcpAuth };
