const crypto = require("crypto");
const AuthSession = require("../models/AuthSession");
require("../models/User");
require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { runWithWorkspace } = require("../tenancy/workspaceContext");

const COOKIE_NAME = "ellie_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionToken(req) {
  const authorization = String(req.headers.authorization || "");
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || parseCookies(req.headers.cookie)[COOKIE_NAME];
}

function sessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    secure ? "SameSite=None" : "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].filter(Boolean).join("; ");
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    secure ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=0",
  ].filter(Boolean).join("; ");
}

async function requireAuth(req, res, next) {
  try {
    const token = sessionToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });

    const session = await AuthSession.findOne({
      tokenHash: tokenHash(token),
      expiresAt: { $gt: new Date() },
    }).select("+tokenHash +csrfToken").populate("userId", "name email status");

    if (!session || !session.userId || session.userId.status !== "active") {
      return res.status(401).json({ error: "Session expired", code: "SESSION_EXPIRED" });
    }

    const membership = await WorkspaceMembership.findOne({
      workspaceId: session.workspaceId,
      userId: session.userId._id,
      status: "active",
    }).populate("workspaceId", "name slug status billingStatus");

    if (!membership || !membership.workspaceId || membership.workspaceId.status !== "active") {
      return res.status(403).json({ error: "Workspace access is unavailable", code: "WORKSPACE_UNAVAILABLE" });
    }

    if (!SAFE_METHODS.has(req.method)) {
      const supplied = String(req.headers["x-csrf-token"] || "");
      const expected = Buffer.from(session.csrfToken);
      const actual = Buffer.from(supplied);
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return res.status(403).json({ error: "Invalid security token", code: "CSRF_INVALID" });
      }
    }

    req.auth = {
      user: session.userId,
      workspace: membership.workspaceId,
      workspaceId: membership.workspaceId._id,
      role: membership.role,
      session,
    };
    session.lastSeenAt = new Date();
    session.save().catch(() => {});
    runWithWorkspace(req.auth.workspaceId, next);
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.auth?.role)
    ? next()
    : res.status(403).json({ error: "You do not have permission to perform this action" });
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  parseCookies,
  requireAuth,
  requireRole,
  sessionCookie,
  sessionToken,
  tokenHash,
};
