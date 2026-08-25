const CoachAssignment = require("../models/CoachAssignment");
const CoachProfile = require("../models/CoachProfile");
const { assignedRecordFilter, isAdminRole } = require("../authorization/accessPolicy");
const { hasRole } = require("../authorization/capabilities");

const dependencies = { CoachAssignment, CoachProfile };

async function resolveCoachAuthorizedIds({ workspaceId, userId, now = new Date(), upcomingDays = 14 }, models = dependencies) {
  if (!workspaceId || !userId) return { contactIds: [], enrollmentIds: [], assignmentIds: [] };
  const profile = await models.CoachProfile.findOne({ workspaceId, userId, status: "active" }).lean();
  if (!profile) return { contactIds: [], enrollmentIds: [], assignmentIds: [] };

  const upcomingAt = new Date(now.getTime() + Math.max(0, upcomingDays) * 24 * 60 * 60 * 1000);
  const assignments = await models.CoachAssignment.find({
    workspaceId,
    coachProfileId: profile._id,
    coachUserId: userId,
    status: { $in: ["active", "scheduled"] },
    startsAt: { $lte: upcomingAt },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
  }).lean();

  const unique = (values) => [...new Map(values.filter(Boolean).map((value) => [String(value), value])).values()];
  return {
    contactIds: unique(assignments.map((item) => item.contactId)),
    enrollmentIds: unique(assignments.map((item) => item.enrollmentId)),
    assignmentIds: unique(assignments.map((item) => item._id)),
  };
}

async function resolveCoachingAccess(req, options = {}, models = dependencies) {
  if (!req?.auth?.workspaceId || !req?.auth?.user?._id) return { contactIds: [], enrollmentIds: [], assignmentIds: [] };
  if (hasRole(req.auth, "owner") || hasRole(req.auth, "admin")) return { allWorkspaceRecords: true, contactIds: [], enrollmentIds: [], assignmentIds: [] };
  if (!hasRole(req.auth, "coach")) return { contactIds: [], enrollmentIds: [], assignmentIds: [] };
  return resolveCoachAuthorizedIds({ workspaceId: req.auth.workspaceId, userId: req.auth.user._id, ...options }, models);
}

async function coachingRecordFilter(req, resource, filter = {}, options = {}, models = dependencies) {
  const access = await resolveCoachingAccess(req, options, models);
  const ids = resource === "contact" ? access.contactIds
    : resource === "assignment" ? access.assignmentIds
      : access.enrollmentIds;
  return assignedRecordFilter(req, ids, filter);
}

module.exports = {
  coachingRecordFilter,
  resolveCoachAuthorizedIds,
  resolveCoachingAccess,
};
