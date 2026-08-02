const crypto = require("node:crypto");
const express = require("express");
const McpAccessToken = require("../models/McpAccessToken");

const router = express.Router();

router.get("/", async (req, res) => {
  const tokens = await McpAccessToken.find({ workspaceId: req.auth.workspaceId, revokedAt: null })
    .select("name prefix scopes lastUsedAt expiresAt createdAt").sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: tokens });
});

router.post("/", async (req, res) => {
  const name = String(req.body?.name || "AI assistant connection").trim().slice(0, 100);
  const days = Math.min(365, Math.max(1, Number(req.body?.expiresInDays) || 90));
  const rawToken = `ellie_mcp_${crypto.randomBytes(32).toString("base64url")}`;
  const token = await McpAccessToken.create({
    workspaceId: req.auth.workspaceId,
    userId: req.auth.user._id,
    name,
    tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
    prefix: rawToken.slice(0, 18),
    expiresAt: new Date(Date.now() + days * 86400000),
  });
  res.status(201).json({ success: true, data: { id: token._id, name, token: rawToken, prefix: token.prefix, expiresAt: token.expiresAt, warning: "Copy this token now. Ellie stores only its hash and cannot show it again." } });
});

router.delete("/:id", async (req, res) => {
  const token = await McpAccessToken.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.auth.workspaceId, revokedAt: null },
    { revokedAt: new Date() }, { new: true },
  );
  if (!token) return res.status(404).json({ success: false, error: "Connection token not found" });
  res.json({ success: true });
});

module.exports = router;
