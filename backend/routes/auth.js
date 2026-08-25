const crypto = require("crypto");
const express = require("express");
const AuthSession = require("../models/AuthSession");
const User = require("../models/User");
require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { ACTIVE_ROLES } = require("../authorization/accessPolicy");
const { normalizeRoles } = require("../authorization/capabilities");
const { hashPassword, verifyPassword } = require("../utils/passwords");
const {
  clearSessionCookie,
  createAuthContext,
  requireAuth,
  sessionCookie,
  sessionToken,
  tokenHash,
} = require("../middleware/auth");

const router = express.Router();
const SESSION_DAYS = 14;

function publicSession(req) {
  return {
    user: { id: req.auth.user._id, name: req.auth.user.name, email: req.auth.user.email },
    workspace: {
      id: req.auth.workspace._id,
      name: req.auth.workspace.name,
      slug: req.auth.workspace.slug,
      billingStatus: req.auth.workspace.billingStatus,
    },
    role: req.auth.role,
    roles: req.auth.roles,
    effectivePermissions: req.auth.effectivePermissions,
    membershipStatus: "active",
    csrfToken: req.auth.session.csrfToken,
  };
}

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await User.findOne({ email, status: "active" }).select("+passwordHash");
    const passwordValid = user && await verifyPassword(req.body?.password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    const membership = await WorkspaceMembership.findOne({ userId: user._id, status: "active" })
      .populate("workspaceId", "name slug status billingStatus");
    if (!membership?.workspaceId || membership.workspaceId.status !== "active") {
      return res.status(403).json({ error: "No active workspace is available for this account" });
    }
    if (!normalizeRoles(membership).some((role) => ACTIVE_ROLES.includes(role))) {
      return res.status(403).json({ error: "A valid workspace role is required", code: "ROLE_INVALID" });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const session = await AuthSession.create({
      tokenHash: tokenHash(token),
      csrfToken,
      userId: user._id,
      workspaceId: membership.workspaceId._id,
      expiresAt,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    });

    user.lastLoginAt = new Date();
    await user.save();
    res.setHeader("Set-Cookie", sessionCookie(token, expiresAt));
    req.auth = createAuthContext({ user, workspace: membership.workspaceId, membership, session });
    res.json({ ...publicSession(req), sessionToken: token });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.get("/session", requireAuth, (req, res) => res.json(publicSession(req)));

router.patch("/password", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.user._id).select("+passwordHash");
    if (!user || !await verifyPassword(req.body?.currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    if (req.body?.newPassword !== req.body?.confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }
    user.passwordHash = await hashPassword(req.body?.newPassword);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id, _id: { $ne: req.auth.session._id } });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to change password" });
  }
});

router.post("/logout", async (req, res) => {
  const token = sessionToken(req);
  if (token) await AuthSession.deleteOne({ tokenHash: tokenHash(token) });
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(204).end();
});

module.exports = router;
