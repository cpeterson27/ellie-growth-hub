const CoachingNote = require("../models/CoachingNote");
const CoachingHandoff = require("../models/CoachingHandoff");
const CoachAssignment = require("../models/CoachAssignment");
const CoachProfile = require("../models/CoachProfile");
const Enrollment = require("../models/Enrollment");
const CrmActivity = require("../models/CrmActivity");

const dependencies = { CoachingNote, CoachingHandoff, CoachAssignment, CoachProfile, Enrollment, CrmActivity };
const noteCategories = new Set(["general", "progress", "concern", "action_item", "handoff"]);

function historyError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isAdmin(role) { return role === "owner" || role === "admin"; }
function includesId(values, value) { return (values || []).some((item) => String(item) === String(value)); }
function assertEnrollmentAccess(actor, enrollmentId) {
  if (isAdmin(actor.role) || actor.access?.allWorkspaceRecords) return;
  if (actor.role !== "coach" || !includesId(actor.access?.enrollmentIds, enrollmentId)) throw historyError("Coaching record not found", "HISTORY_NOT_FOUND");
}
function assertAssignmentAccess(actor, assignmentId) {
  if (isAdmin(actor.role) || actor.access?.allWorkspaceRecords) return;
  if (actor.role !== "coach" || !includesId(actor.access?.assignmentIds, assignmentId)) throw historyError("Coach assignment not found", "ASSIGNMENT_NOT_FOUND");
}

async function activity(models, value) {
  return models.CrmActivity.create({ ...value, type: "system", source: "crm" });
}

async function validateEnrollmentContext({ workspaceId, contactId, enrollmentId, coachAssignmentId }, actor, models) {
  assertEnrollmentAccess(actor, enrollmentId);
  const enrollment = await models.Enrollment.findOne({ _id: enrollmentId, workspaceId, contactId }).lean();
  if (!enrollment) throw historyError("Enrollment must belong to this student and workspace", "ENROLLMENT_WORKSPACE_MISMATCH");
  let assignment = null;
  if (coachAssignmentId) {
    assertAssignmentAccess(actor, coachAssignmentId);
    assignment = await models.CoachAssignment.findOne({ _id: coachAssignmentId, workspaceId, enrollmentId, contactId }).lean();
    if (!assignment) throw historyError("Assignment must belong to this enrollment", "ASSIGNMENT_WORKSPACE_MISMATCH");
  }
  return { enrollment, assignment };
}

async function createNote(input, actor, models = dependencies) {
  if (!String(input.body || "").trim()) throw historyError("Note body is required", "NOTE_BODY_REQUIRED");
  const category = noteCategories.has(input.category) ? input.category : "general";
  const { assignment } = await validateEnrollmentContext(input, actor, models);
  const note = await models.CoachingNote.create({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    enrollmentId: input.enrollmentId,
    coachAssignmentId: assignment?._id || null,
    authorUserId: actor.userId,
    authorCoachProfileId: actor.role === "coach" ? assignment?.coachProfileId || null : null,
    category,
    body: String(input.body).trim(),
  });
  await activity(models, {
    workspaceId: input.workspaceId, contactId: input.contactId, title: "Coaching note added", body: "Internal coaching note recorded.", createdBy: actor.userId,
    metadata: { eventType: "coaching.note.created", coachingNoteId: note._id, enrollmentId: input.enrollmentId, coachAssignmentId: assignment?._id || null, category },
  });
  return note;
}

async function updateNote({ workspaceId, noteId, body, category }, actor, models = dependencies) {
  const note = await models.CoachingNote.findOne({ _id: noteId, workspaceId });
  if (!note) throw historyError("Coaching note not found", "NOTE_NOT_FOUND");
  assertEnrollmentAccess(actor, note.enrollmentId);
  if (!isAdmin(actor.role) && String(note.authorUserId) !== String(actor.userId)) throw historyError("A coach may only edit their own note", "NOTE_AUTHOR_FORBIDDEN");
  if (body !== undefined) {
    if (!String(body).trim()) throw historyError("Note body is required", "NOTE_BODY_REQUIRED");
    note.body = String(body).trim();
  }
  if (category !== undefined) {
    if (!noteCategories.has(category)) throw historyError("Invalid note category", "NOTE_CATEGORY_INVALID");
    note.category = category;
  }
  note.lastEditedBy = actor.userId;
  await note.save();
  await activity(models, {
    workspaceId, contactId: note.contactId, title: "Coaching note updated", body: "Internal coaching note updated.", createdBy: actor.userId,
    metadata: { eventType: "coaching.note.updated", coachingNoteId: note._id, enrollmentId: note.enrollmentId, coachAssignmentId: note.coachAssignmentId || null, category: note.category },
  });
  return note;
}

async function upsertHandoff(input, actor, models = dependencies) {
  assertAssignmentAccess(actor, input.fromAssignmentId);
  const assignment = await models.CoachAssignment.findOne({ _id: input.fromAssignmentId, workspaceId: input.workspaceId });
  if (!assignment) throw historyError("Coach assignment not found", "ASSIGNMENT_NOT_FOUND");
  if (!isAdmin(actor.role) && String(assignment.coachUserId) !== String(actor.userId)) throw historyError("Only the assigned coach can prepare this handoff", "HANDOFF_AUTHOR_FORBIDDEN");
  if (!String(input.summary || "").trim()) throw historyError("Handoff summary is required", "HANDOFF_SUMMARY_REQUIRED");
  let handoff = await models.CoachingHandoff.findOne({ workspaceId: input.workspaceId, fromAssignmentId: assignment._id });
  const isNew = !handoff;
  if (!handoff) handoff = new models.CoachingHandoff({
    workspaceId: input.workspaceId, contactId: assignment.contactId, enrollmentId: assignment.enrollmentId,
    fromAssignmentId: assignment._id, fromCoachProfileId: assignment.coachProfileId, fromCoachUserId: assignment.coachUserId,
    fromStageKey: assignment.stageKey, createdBy: actor.userId,
  });
  if (handoff.status === "completed" && !isAdmin(actor.role)) throw historyError("Completed handoffs cannot be edited by coaches", "HANDOFF_COMPLETED");
  for (const field of ["summary", "progress", "observations", "actionItems"]) if (input[field] !== undefined) handoff[field] = String(input[field]).trim();
  if (input.submit) { handoff.status = "submitted"; handoff.submittedAt = handoff.submittedAt || new Date(); }
  handoff.lastEditedBy = actor.userId;
  await handoff.save();
  await activity(models, {
    workspaceId: input.workspaceId, contactId: assignment.contactId, title: input.submit ? "Coach handoff submitted" : "Coach handoff prepared", createdBy: actor.userId,
    metadata: { eventType: input.submit ? "coaching.handoff.created" : "coaching.handoff.updated", coachingHandoffId: handoff._id, enrollmentId: assignment.enrollmentId, coachAssignmentId: assignment._id },
  });
  return handoff;
}

module.exports = { createNote, historyError, updateNote, upsertHandoff };
