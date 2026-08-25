const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const CoachingNote = require("./models/CoachingNote");
const CoachingHandoff = require("./models/CoachingHandoff");
const history = require("./services/coachingHistoryService");
const assignments = require("./services/coachAssignmentService");

const id = () => new mongoose.Types.ObjectId();
const ids = { workspace: id(), otherWorkspace: id(), contact: id(), enrollment: id(), assignment: id(), nextAssignment: id(), coach: id(), nextCoach: id(), coachUser: id(), nextUser: id(), admin: id(), otherCoach: id(), note: id(), handoff: id() };
function query(value) { return { lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; }

async function testSchemas() {
  assert.equal(CoachingNote.schema.path("contactId").options.ref, "Contact");
  assert.equal(CoachingNote.schema.path("authorUserId").options.ref, "User");
  assert.equal(CoachingHandoff.schema.path("fromAssignmentId").options.ref, "CoachAssignment");
  assert(CoachingHandoff.schema.indexes().some(([fields, options]) => fields.workspaceId === 1 && fields.fromAssignmentId === 1 && options.unique));
}

function historyModels() {
  const notes = [];
  const activities = [];
  const assignment = { _id: ids.assignment, workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, coachProfileId: ids.coach, coachUserId: ids.coachUser, stageKey: "foundation", status: "active" };
  class Handoff {
    constructor(value) { Object.assign(this, { _id: ids.handoff, status: "draft" }, value); }
    async save() { return this; }
  }
  Handoff.findOne = () => query(null);
  return {
    notes, activities, assignment,
    models: {
      Enrollment: { findOne: (filter) => query(String(filter.workspaceId) === String(ids.workspace) && String(filter.contactId) === String(ids.contact) ? { _id: ids.enrollment } : null) },
      CoachAssignment: { findOne: (filter) => query(String(filter._id) === String(ids.assignment) && String(filter.workspaceId) === String(ids.workspace) ? assignment : null) },
      CoachingNote: {
        create: async (value) => { const note = { _id: ids.note, ...value, async save() { return this; } }; notes.push(note); return note; },
        findOne: (filter) => query(notes.find((item) => String(item._id) === String(filter._id) && String(item.workspaceId) === String(filter.workspaceId)) || null),
      },
      CoachingHandoff: Handoff,
      CrmActivity: { create: async (value) => { activities.push(value); return value; } },
    },
  };
}

async function testNotesAndHandoffAuthorization() {
  const fixture = historyModels();
  const coachActor = { role: "coach", userId: ids.coachUser, access: { contactIds: [ids.contact], enrollmentIds: [ids.enrollment], assignmentIds: [ids.assignment] } };
  const note = await history.createNote({ workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, coachAssignmentId: ids.assignment, body: "Student completed the foundation work.", category: "progress", authorUserId: ids.otherCoach }, coachActor, fixture.models);
  assert.equal(String(note.authorUserId), String(ids.coachUser), "authorship must come from authenticated actor");
  assert.equal(note.category, "progress");
  assert.equal(fixture.activities[0].metadata.eventType, "coaching.note.created");

  await assert.rejects(
    history.createNote({ workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, coachAssignmentId: ids.assignment, body: "unauthorized" }, { role: "coach", userId: ids.otherCoach, access: { contactIds: [], enrollmentIds: [], assignmentIds: [] } }, fixture.models),
    (error) => error.code === "HISTORY_NOT_FOUND",
  );
  note.authorUserId = ids.otherCoach;
  await assert.rejects(history.updateNote({ workspaceId: ids.workspace, noteId: ids.note, body: "overwrite" }, coachActor, fixture.models), (error) => error.code === "NOTE_AUTHOR_FORBIDDEN");
  await history.updateNote({ workspaceId: ids.workspace, noteId: ids.note, body: "Admin correction" }, { role: "admin", userId: ids.admin, access: { allWorkspaceRecords: true } }, fixture.models);
  assert.equal(note.body, "Admin correction");

  const handoff = await history.upsertHandoff({ workspaceId: ids.workspace, fromAssignmentId: ids.assignment, summary: "Foundation complete", progress: "Strong progress", actionItems: "Begin growth stage", submit: true }, coachActor, fixture.models);
  assert.equal(handoff.status, "submitted");
  assert.equal(String(handoff.fromCoachUserId), String(ids.coachUser));
}

async function testRecoverableTransition() {
  const records = [];
  let failCompletionOnce = true;
  const current = { _id: ids.assignment, workspaceId: ids.workspace, enrollmentId: ids.enrollment, contactId: ids.contact, coachProfileId: ids.coach, coachUserId: ids.coachUser, stageKey: "foundation", sequence: 0, startsAt: new Date(0), status: "active", async save() { if (failCompletionOnce && this.status === "completed") { failCompletionOnce = false; this.status = "active"; throw new Error("simulated completion failure"); } return this; } };
  records.push(current);
  const handoff = { _id: ids.handoff, status: "submitted", async save() { return this; } };
  const enrollment = { _id: ids.enrollment, workspaceId: ids.workspace, contactId: ids.contact, status: "active", programSnapshot: { stages: [{ key: "foundation", order: 0 }, { key: "growth", order: 1 }] } };
  const models = {
    Enrollment: { findOne: () => query(enrollment) },
    CoachProfile: { findOne: (filter) => query({ _id: filter._id, workspaceId: ids.workspace, userId: ids.nextUser, status: "active" }) },
    CoachAssignment: {
      findOne(filter) {
        if (filter._id) return query(records.find((item) => String(item._id) === String(filter._id)) || null);
        if (filter.previousAssignmentId) return query(records.find((item) => String(item.previousAssignmentId) === String(filter.previousAssignmentId)) || null);
        return query(records.find((item) => String(item.enrollmentId) === String(filter.enrollmentId) && item.stageKey === filter.stageKey && ["active", "scheduled"].includes(item.status)) || null);
      },
      async create(value) { const row = { _id: ids.nextAssignment, ...value, async save() { return this; } }; records.push(row); return row; },
    },
    CoachingHandoff: { findOne: () => query(handoff) },
    CrmActivity: { create: async (value) => value },
  };
  const input = { workspaceId: ids.workspace, currentAssignmentId: ids.assignment, next: { coachProfileId: ids.nextCoach, stageKey: "growth" }, createdBy: ids.admin };
  await assert.rejects(assignments.transitionCoachAssignment(input, models), /simulated completion failure/);
  assert.equal(current.status, "active", "old coach remains active after partial fallback failure");
  assert.equal(records[1].status, "scheduled", "next coach exists as a recoverable scheduled assignment");
  const next = await assignments.transitionCoachAssignment(input, models);
  assert.equal(records.length, 2, "retry must not duplicate the next assignment");
  assert.equal(current.status, "completed", "previous assignment remains preserved and completed");
  assert.equal(next.status, "active", "next assignment activates after recovery");
  assert.equal(handoff.status, "completed");
  assert.equal(String(handoff.toAssignmentId), String(next._id));
}

async function main() {
  await testSchemas();
  await testNotesAndHandoffAuthorization();
  await testRecoverableTransition();
  console.log("Coaching notes, handoff, authorship and recoverable-transition checks passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
