const {
  ACTIVE_ROLES,
  canAccessRecord,
  hasValidAuthContext,
} = require("../authorization/accessPolicy");
const { hasAnyCapability } = require("../authorization/capabilities");

function requireValidRole(req, res, next) {
  if (!hasValidAuthContext(req)) {
    return res.status(403).json({
      error: "A valid workspace role is required",
      code: "ROLE_INVALID",
    });
  }
  return next();
}

function requireRecordAccess({ loadRecord, authorizedRecordIds, ownerField } = {}) {
  if (typeof loadRecord !== "function") throw new TypeError("loadRecord is required");
  return async (req, res, next) => {
    if (!hasValidAuthContext(req)) {
      return res.status(403).json({ error: "A valid workspace role is required", code: "ROLE_INVALID" });
    }
    try {
      const record = await loadRecord(req);
      if (!record) return res.status(404).json({ error: "Record not found", code: "RECORD_NOT_FOUND" });
      const ids = typeof authorizedRecordIds === "function" ? await authorizedRecordIds(req) : authorizedRecordIds;
      if (!canAccessRecord(req, record, { authorizedRecordIds: ids, ownerField })) {
        return res.status(403).json({ error: "You do not have permission to access this record", code: "RECORD_FORBIDDEN" });
      }
      req.authorizedRecord = record;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Restricted roles are fail-closed until a route has an explicit record policy.
// Coaches may enter only the assignment-scoped Coaching namespace; closers may
// enter only owner-scoped Sales Opportunities.
function restrictNewRoleSurface(req, res, next) {
  if (!req.auth) return next();
  const permissions = req.auth.effectivePermissions || [];
  const socialConnectionOnly = permissions.length === 1 && permissions[0] === "social.manage";
  if (socialConnectionOnly) {
    const allowed = (
      (req.method === "GET" && req.path === "/social-workspace/accounts")
      || (req.method === "GET" && /^\/social\/(?:meta|instagram)\/oauth\/(?:status|start)$/.test(req.path))
      || (req.method === "PATCH" && /^\/social\/(?:meta|instagram)\/assets$/.test(req.path))
      || (req.method === "POST" && req.path === "/social/instagram/oauth/refresh")
      || (req.method === "POST" && /^\/social\/(?:meta|instagram)\/oauth\/disconnect$/.test(req.path))
    );
    return allowed ? next() : res.status(403).json({ error: "This review account can access connected social accounts only", code: "REVIEWER_SURFACE_FORBIDDEN" });
  }
  const roles = req.auth.roles || [req.auth.role];
  const restricted = roles.every((role) => ["coach", "closer", "ambassador"].includes(role));
  if (!restricted) return next();
  const allowed = [];
  if (hasAnyCapability(req.auth, ["coaching.view", "coaching.view_assigned"])) allowed.push("/coaching");
  if (hasAnyCapability(req.auth, ["sales.opportunities.view", "sales.opportunities.view_assigned"])) allowed.push("/opportunities");
  if (hasAnyCapability(req.auth, ["ambassadors.view_own", "ambassadors.view"])) allowed.push("/ambassadors");
  if (!allowed.some((prefix) => req.path.startsWith(prefix))) return res.status(403).json({ error: "This area is not available for your assigned records", code: "RECORD_POLICY_REQUIRED" });
  return next();
}

module.exports = {
  ACTIVE_ROLES,
  requireRecordAccess,
  requireValidRole,
  restrictNewRoleSurface,
};
