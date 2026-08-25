const CoachAssignment = require("../models/CoachAssignment");
const CoachProfile = require("../models/CoachProfile");
const Enrollment = require("../models/Enrollment");
const CrmActivity = require("../models/CrmActivity");
const CoachingHandoff = require("../models/CoachingHandoff");
const mongoose = require("mongoose");

const dependencies = { CoachAssignment, CoachProfile, Enrollment, CrmActivity, CoachingHandoff, mongoose };

function assignmentError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function withSession(query, session) { return session && query?.session ? query.session(session) : query; }
async function createDocument(Model, value, session) {
  if (!session) return Model.create(value);
  const rows = await Model.create([value], { session });
  return rows[0];
}

async function validateAssignment(input, models, session = null) {
  if (!input.workspaceId) throw assignmentError("workspaceId is required", "WORKSPACE_REQUIRED");
  const [enrollment, coach] = await Promise.all([
    withSession(models.Enrollment.findOne({ _id: input.enrollmentId, workspaceId: input.workspaceId }), session).lean(),
    withSession(models.CoachProfile.findOne({ _id: input.coachProfileId, workspaceId: input.workspaceId, status: "active" }), session).lean(),
  ]);
  if (!enrollment) throw assignmentError("Enrollment must belong to this workspace", "ENROLLMENT_WORKSPACE_MISMATCH");
  if (!coach) throw assignmentError("Active coach must belong to this workspace", "COACH_WORKSPACE_MISMATCH");
  if (["completed", "cancelled"].includes(enrollment.status)) throw assignmentError("Closed enrollments cannot receive assignments", "ENROLLMENT_CLOSED");
  const stage = (enrollment.programSnapshot?.stages || []).find((item) => item.key === input.stageKey);
  if (!stage) throw assignmentError("Assignment stage is not part of the enrollment program", "ASSIGNMENT_STAGE_INVALID");
  if (input.previousAssignmentId) {
    const previous = await withSession(models.CoachAssignment.findOne({ _id: input.previousAssignmentId, workspaceId: input.workspaceId, enrollmentId: enrollment._id }), session).lean();
    if (!previous) throw assignmentError("Previous assignment must belong to this enrollment and workspace", "PREVIOUS_ASSIGNMENT_MISMATCH");
  }
  return { enrollment, coach, stage };
}

async function createCoachAssignment(input, models = dependencies, options = {}) {
  const { session = null, allowPreviousConflict = false, skipActivity = false } = options;
  const { enrollment, coach, stage } = await validateAssignment(input, models, session);
  const conflict = await withSession(models.CoachAssignment.findOne({
    workspaceId: input.workspaceId,
    enrollmentId: enrollment._id,
    stageKey: stage.key,
    status: { $in: ["scheduled", "active"] },
  }), session).lean();
  if (conflict && !(allowPreviousConflict && String(conflict._id) === String(input.previousAssignmentId))) throw assignmentError("This enrollment stage already has an open coach assignment", "ASSIGNMENT_CONFLICT");

  const startsAt = input.startsAt || new Date();
  const status = input.status || (new Date(startsAt) <= new Date() ? "active" : "scheduled");
  const assignment = await createDocument(models.CoachAssignment, {
    workspaceId: input.workspaceId,
    enrollmentId: enrollment._id,
    contactId: enrollment.contactId,
    coachProfileId: coach._id,
    coachUserId: coach.userId,
    stageKey: stage.key,
    sequence: input.sequence ?? stage.order,
    startsAt,
    endsAt: input.endsAt || null,
    status,
    previousAssignmentId: input.previousAssignmentId || null,
    createdBy: input.createdBy || null,
  }, session);
  if (!skipActivity) await createDocument(models.CrmActivity, {
    workspaceId: input.workspaceId,
    contactId: enrollment.contactId,
    type: "system",
    title: "Coach assigned",
    source: "crm",
    createdBy: input.createdBy || null,
    metadata: { eventType: "coach.assigned", enrollmentId: enrollment._id, coachAssignmentId: assignment._id, coachProfileId: coach._id, stageKey: stage.key },
  }, session);
  return assignment;
}

async function completeCoachAssignment({ workspaceId, coachAssignmentId, at = new Date(), createdBy = null }, models = dependencies, options = {}) {
  const { session = null, skipActivity = false } = options;
  const assignment = await withSession(models.CoachAssignment.findOne({ _id: coachAssignmentId, workspaceId }), session);
  if (!assignment) throw assignmentError("Coach assignment not found", "ASSIGNMENT_NOT_FOUND");
  if (!["active", "scheduled"].includes(assignment.status)) throw assignmentError("Only open assignments can be completed", "ASSIGNMENT_TRANSITION_INVALID");
  assignment.status = "completed";
  assignment.endsAt = assignment.endsAt || at;
  assignment.completedAt = at;
  await assignment.save(session ? { session } : undefined);
  if (!skipActivity) await createDocument(models.CrmActivity, {
    workspaceId,
    contactId: assignment.contactId,
    type: "system",
    title: "Coach assignment completed",
    source: "crm",
    createdBy,
    metadata: { eventType: "coach.assignment.completed", enrollmentId: assignment.enrollmentId, coachAssignmentId: assignment._id, stageKey: assignment.stageKey },
  }, session);
  return assignment;
}

async function executeTransition({ workspaceId, currentAssignmentId, next, at, createdBy }, models, session, recoverable) {
  const current = await withSession(models.CoachAssignment.findOne({ _id: currentAssignmentId, workspaceId }), session);
  if (!current) throw assignmentError("Coach assignment not found", "ASSIGNMENT_NOT_FOUND");
  const handoff = await withSession(models.CoachingHandoff.findOne({ workspaceId, fromAssignmentId: current._id }), session);
  if (!handoff || !["submitted", "completed"].includes(handoff.status)) throw assignmentError("A submitted handoff is required before transition", "HANDOFF_REQUIRED");
  await validateAssignment({ ...next, workspaceId, enrollmentId: current.enrollmentId, previousAssignmentId: current._id }, models, session);

  let nextAssignment = await withSession(models.CoachAssignment.findOne({ workspaceId, previousAssignmentId: current._id }), session);
  if (!nextAssignment) {
    nextAssignment = await createCoachAssignment({
      ...next, workspaceId, enrollmentId: current.enrollmentId, previousAssignmentId: current._id,
      startsAt: next.startsAt || at, status: recoverable ? "scheduled" : next.status, createdBy,
    }, models, { session, allowPreviousConflict: recoverable });
  }
  if (["active", "scheduled"].includes(current.status)) await completeCoachAssignment({ workspaceId, coachAssignmentId: current._id, at, createdBy }, models, { session });
  if (recoverable) {
    const desired = new Date(nextAssignment.startsAt) <= new Date(at) ? "active" : "scheduled";
    if (nextAssignment.status !== desired) { nextAssignment.status = desired; await nextAssignment.save(); }
  }
  handoff.toAssignmentId = nextAssignment._id;
  handoff.toCoachProfileId = nextAssignment.coachProfileId;
  handoff.toStageKey = nextAssignment.stageKey;
  handoff.status = "completed";
  handoff.completedAt = handoff.completedAt || at;
  await handoff.save(session ? { session } : undefined);
  await createDocument(models.CrmActivity, {
    workspaceId, contactId: current.contactId, type: "system", title: "Coach handoff completed", source: "crm", createdBy,
    metadata: { eventType: "coaching.handoff.completed", coachingHandoffId: handoff._id, enrollmentId: current.enrollmentId, fromAssignmentId: current._id, toAssignmentId: nextAssignment._id },
  }, session);
  await createDocument(models.CrmActivity, {
    workspaceId, contactId: current.contactId, type: "system", title: "Coach assignment transitioned", source: "crm", createdBy,
    metadata: { eventType: "coach.assignment.transitioned", coachingHandoffId: handoff._id, enrollmentId: current.enrollmentId, fromAssignmentId: current._id, toAssignmentId: nextAssignment._id },
  }, session);
  return nextAssignment;
}

function transactionUnsupported(error) {
  return error?.code === 20 || /transaction numbers are only allowed|does not support transactions/i.test(String(error?.message || ""));
}

async function transitionCoachAssignment({ workspaceId, currentAssignmentId, next, at = new Date(), createdBy = null }, models = dependencies) {
  const connection = models.mongoose?.connection;
  if (connection?.readyState === 1 && typeof connection.startSession === "function") {
    const session = await connection.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await executeTransition({ workspaceId, currentAssignmentId, next, at, createdBy }, models, session, false); });
      return result;
    } catch (error) {
      if (!transactionUnsupported(error)) throw error;
    } finally { await session.endSession(); }
  }
  // Standalone Mongo deployments cannot use multi-document transactions. The
  // fallback creates the next (scheduled) assignment first, then completes the
  // old assignment. A unique previousAssignmentId makes retries idempotent, so
  // a partial failure cannot permanently leave the student without a coach.
  return executeTransition({ workspaceId, currentAssignmentId, next, at, createdBy }, models, null, true);
}

module.exports = {
  completeCoachAssignment,
  createCoachAssignment,
  transitionCoachAssignment,
  validateAssignment,
};
