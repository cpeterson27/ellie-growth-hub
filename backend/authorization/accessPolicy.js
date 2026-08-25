const mongoose = require("mongoose");
const { hasRole } = require("./capabilities");

const ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  COACH: "coach",
  CLOSER: "closer",
  MEMBER: "member",
  VIEWER: "viewer",
});

const ACTIVE_ROLES = Object.freeze(Object.values(ROLES));
const ADMIN_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);
const LEGACY_ROLES = Object.freeze([ROLES.MEMBER, ROLES.VIEWER]);

function authenticatedUserId(req) {
  return req?.auth?.user?._id || null;
}

function hasValidAuthContext(req) {
  return Boolean(
    authenticatedUserId(req)
    && req?.auth?.workspaceId
    && ACTIVE_ROLES.includes(req?.auth?.role),
  );
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

function workspaceRecordFilter(req, filter = {}) {
  if (!hasValidAuthContext(req)) return null;
  return { ...filter, workspaceId: req.auth.workspaceId };
}

function impossibleWorkspaceFilter(req) {
  return workspaceRecordFilter(req, { _id: { $in: [] } });
}

function salesOpportunityFilter(req, filter = {}) {
  const scoped = workspaceRecordFilter(req, filter);
  if (!scoped) return null;
  if (hasRole(req.auth, ROLES.OWNER) || hasRole(req.auth, ROLES.ADMIN) || LEGACY_ROLES.some((role) => hasRole(req.auth, role))) return scoped;
  if (hasRole(req.auth, ROLES.CLOSER)) {
    return { ...scoped, ownerId: authenticatedUserId(req) };
  }
  return impossibleWorkspaceFilter(req);
}

function assignedRecordFilter(req, authorizedRecordIds, filter = {}) {
  const scoped = workspaceRecordFilter(req, filter);
  if (!scoped) return null;
  if (hasRole(req.auth, ROLES.OWNER) || hasRole(req.auth, ROLES.ADMIN)) return scoped;

  const ids = (Array.isArray(authorizedRecordIds) ? authorizedRecordIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  return { ...scoped, _id: { $in: ids } };
}

function canAccessRecord(req, record, { authorizedRecordIds = [], ownerField = null } = {}) {
  if (!hasValidAuthContext(req) || !record) return false;
  if (String(record.workspaceId) !== String(req.auth.workspaceId)) return false;
  if (hasRole(req.auth, ROLES.OWNER) || hasRole(req.auth, ROLES.ADMIN)) return true;

  const recordId = String(record._id || "");
  if (authorizedRecordIds.some((id) => String(id) === recordId)) return true;
  if (ownerField && String(record[ownerField] || "") === String(authenticatedUserId(req))) return true;
  return false;
}

module.exports = {
  ACTIVE_ROLES,
  ADMIN_ROLES,
  LEGACY_ROLES,
  ROLES,
  assignedRecordFilter,
  authenticatedUserId,
  canAccessRecord,
  hasValidAuthContext,
  isAdminRole,
  salesOpportunityFilter,
  workspaceRecordFilter,
};
