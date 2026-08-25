const crypto = require("crypto");
const AuthSession = require("../models/AuthSession");
require("../models/User");
require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { runWithWorkspace } = require("../tenancy/workspaceContext");
const { ACTIVE_ROLES } = require("../authorization/accessPolicy");
const { effectivePermissions, hasCapability, normalizeRoles } = require("../authorization/capabilities");

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

function createAuthContext({ user, workspace, role, roles, membership, session }) {
  const source = membership || { role, roles };
  const normalizedRoles = normalizeRoles(source);
  return {
    user,
    userId: user?._id || null,
    workspace,
    workspaceId: workspace?._id || null,
    role: role || source.role || normalizedRoles[0],
    roles: normalizedRoles,
    effectivePermissions: effectivePermissions(source),
    session,
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = sessionToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });

    const session = await AuthSession.findOne({
      tokenHash: tokenHash(token),
      expiresAt: { $gt: new Date() },
    }).select("+tokenHash +csrfToken").populate("userId", "name email status avatarUrl");

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
    if (!normalizeRoles(membership).some((role) => ACTIVE_ROLES.includes(role))) {
      return res.status(403).json({ error: "A valid workspace role is required", code: "ROLE_INVALID" });
    }

    if (!SAFE_METHODS.has(req.method)) {
      const supplied = String(req.headers["x-csrf-token"] || "");
      const expected = Buffer.from(session.csrfToken);
      const actual = Buffer.from(supplied);
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return res.status(403).json({ error: "Invalid security token", code: "CSRF_INVALID" });
      }
    }

    req.auth = createAuthContext({ user: session.userId, workspace: membership.workspaceId, membership, session });
    session.lastSeenAt = new Date();
    session.save().catch(() => {});
    runWithWorkspace(req.auth.workspaceId, next);
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  const allowed = roles.filter((role) => ACTIVE_ROLES.includes(role));
  return (req, res, next) => (req.auth?.roles || [req.auth?.role]).some((role) => allowed.includes(role))
    ? next()
    : res.status(403).json({ error: "You do not have permission to perform this action", code: "ROLE_FORBIDDEN" });
}

function requireCapability(...capabilities) {
  return (req, res, next) => capabilities.some((capability) => hasCapability(req.auth, capability))
    ? next()
    : res.status(403).json({ error: "You do not have permission to perform this action", code: "CAPABILITY_FORBIDDEN" });
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  createAuthContext,
  parseCookies,
  requireAuth,
  requireCapability,
  requireRole,
  sessionCookie,
  sessionToken,
  tokenHash,
};
