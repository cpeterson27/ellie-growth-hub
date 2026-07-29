const crypto = require("crypto");
const express = require("express");
const AuthSession = require("../models/AuthSession");
const User = require("../models/User");
require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { verifyPassword } = require("../utils/passwords");
const {
  clearSessionCookie,
  parseCookies,
  requireAuth,
  sessionCookie,
  tokenHash,
  COOKIE_NAME,
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
    req.auth = { user, workspace: membership.workspaceId, role: membership.role, session };
    res.json(publicSession(req));
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.get("/session", requireAuth, (req, res) => res.json(publicSession(req)));

router.post("/logout", async (req, res) => {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) await AuthSession.deleteOne({ tokenHash: tokenHash(token) });
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(204).end();
});

module.exports = router;
