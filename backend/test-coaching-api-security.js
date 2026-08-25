const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");
const { createAuthContext } = require("./middleware/auth");
const { createCoachingRouter } = require("./routes/coaching");

const id = () => new mongoose.Types.ObjectId();
const ids = {
  workspace: id(), otherWorkspace: id(), owner: id(), admin: id(), coach: id(), otherCoach: id(), closer: id(),
  profile: id(), otherProfile: id(), program: id(), enrollment: id(), otherEnrollment: id(),
  assignment: id(), otherAssignment: id(), contact: id(), otherContact: id(),
  note: id(), priorNote: id(), handoff: id(),
};

const state = {
  profiles: [
    { _id: ids.profile, workspaceId: ids.workspace, userId: ids.coach, displayName: "Assigned Coach", status: "active" },
    { _id: ids.otherProfile, workspaceId: ids.workspace, userId: ids.otherCoach, displayName: "Other Coach", status: "active" },
  ],
  programs: [{ _id: ids.program, workspaceId: ids.workspace, name: "Program", status: "active", stages: [{ key: "start" }] }],
  enrollments: [
    { _id: ids.enrollment, workspaceId: ids.workspace, contactId: ids.contact, coachingProgramId: ids.program, status: "active" },
    { _id: ids.otherEnrollment, workspaceId: ids.workspace, contactId: ids.otherContact, coachingProgramId: ids.program, status: "active" },
  ],
  assignments: [
    { _id: ids.assignment, workspaceId: ids.workspace, enrollmentId: ids.enrollment, contactId: ids.contact, coachProfileId: ids.profile, coachUserId: ids.coach, status: "active" },
    { _id: ids.otherAssignment, workspaceId: ids.workspace, enrollmentId: ids.otherEnrollment, contactId: ids.otherContact, coachProfileId: ids.otherProfile, coachUserId: ids.otherCoach, status: "active" },
  ],
  contacts: [
    { _id: ids.contact, workspaceId: ids.workspace, name: "Assigned Student", email: "assigned@example.test" },
    { _id: ids.otherContact, workspaceId: ids.workspace, name: "Other Student", email: "other@example.test" },
  ],
  notes: [
    { _id: ids.note, workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, coachAssignmentId: ids.assignment, authorUserId: ids.coach, category: "progress", body: "Current coach note" },
    { _id: ids.priorNote, workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, coachAssignmentId: ids.otherAssignment, authorUserId: ids.otherCoach, category: "handoff", body: "Prior coach context" },
  ],
  handoffs: [{ _id: ids.handoff, workspaceId: ids.workspace, contactId: ids.contact, enrollmentId: ids.enrollment, fromAssignmentId: ids.otherAssignment, status: "completed", summary: "Continue with the growth plan" }],
  activities: [],
  referrals: [{ _id: id(), workspaceId: ids.workspace, contactId: ids.contact, coachProfileId: ids.profile, coachUserId: ids.coach, referralCode: "assigned-coach", source: "manual" }, { _id: id(), workspaceId: ids.workspace, contactId: ids.otherContact, coachProfileId: ids.otherProfile, coachUserId: ids.otherCoach, referralCode: "other-coach", source: "manual" }],
  commissions: [{ _id: id(), workspaceId: ids.workspace, contactId: ids.contact, coachProfileId: ids.profile, coachUserId: ids.coach, saleType: "manual", saleReference: "one", grossAmountMinor: 10000, rateBps: 1000, commissionAmountMinor: 1000, currency: "USD", status: "pending" }, { _id: id(), workspaceId: ids.workspace, contactId: ids.otherContact, coachProfileId: ids.otherProfile, coachUserId: ids.otherCoach, saleType: "manual", saleReference: "two", grossAmountMinor: 10000, rateBps: 1000, commissionAmountMinor: 1000, currency: "USD", status: "pending" }],
};

function values(value) {
  return value?.$in || [value];
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (["$or", "startsAt", "endsAt", "status"].includes(key) && typeof expected === "object" && !Array.isArray(expected)) {
      if (key === "status" && expected.$in) return expected.$in.includes(row.status);
      return true;
    }
    if (key.startsWith("$")) return true;
    return values(expected).some((item) => String(row[key]) === String(item));
  });
}

function query(value) {
  const chain = {
    populate() { return chain; },
    select() { return chain; },
    sort() { return chain; },
    limit() { return chain; },
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return chain;
}

function model(rows) {
  return {
    find: (filter) => query(rows.filter((row) => matches(row, filter))),
    findOne: (filter) => query(rows.find((row) => matches(row, filter)) || null),
    exists: async (filter) => rows.some((row) => matches(row, filter)),
  };
}

const calls = [];
const domainService = {
  async createCoachProfile(payload) { calls.push(["createCoachProfile", payload]); return { _id: id(), ...payload }; },
  async updateCoachProfile(payload) { calls.push(["updateCoachProfile", payload]); return payload; },
  async activateCoachProfile(payload) { calls.push(["activateCoachProfile", payload]); return { status: "active", ...payload }; },
  async deactivateCoachProfile(payload) { calls.push(["deactivateCoachProfile", payload]); return { status: "inactive", ...payload }; },
  async createCoachingProgram(payload) { calls.push(["createCoachingProgram", payload]); return { _id: id(), ...payload }; },
  async updateCoachingProgram(payload) { calls.push(["updateCoachingProgram", payload]); return payload; },
  async archiveCoachingProgram(payload) { calls.push(["archiveCoachingProgram", payload]); return { status: "archived", ...payload }; },
  async createEnrollment(payload) { calls.push(["createEnrollment", payload]); return { _id: id(), ...payload }; },
  async transitionEnrollment(payload) { calls.push(["transitionEnrollment", payload]); return payload; },
};
const assignmentService = {
  async createCoachAssignment(payload) { calls.push(["createCoachAssignment", payload]); return { _id: id(), ...payload }; },
  async completeCoachAssignment(payload) { calls.push(["completeCoachAssignment", payload]); return payload; },
  async transitionCoachAssignment(payload) { calls.push(["transitionCoachAssignment", payload]); return payload; },
};
const coachingAuthorization = {
  async resolveCoachingAccess(req) {
    if (String(req.auth.user._id) !== String(ids.coach) || String(req.auth.workspaceId) !== String(ids.workspace)) {
      return { contactIds: [], enrollmentIds: [], assignmentIds: [] };
    }
    return { contactIds: [ids.contact], enrollmentIds: [ids.enrollment], assignmentIds: [ids.assignment] };
  },
};
const historyService = {
  async createNote(payload, actor) {
    if (!actor.access?.enrollmentIds?.some((value) => String(value) === String(payload.enrollmentId))) { const error = new Error("Coaching record not found"); error.code = "HISTORY_NOT_FOUND"; throw error; }
    const note = { _id: id(), ...payload, authorUserId: actor.userId };
    state.notes.push(note);
    return note;
  },
  async updateNote(payload, actor) {
    const note = state.notes.find((item) => String(item._id) === String(payload.noteId));
    if (!note) { const error = new Error("Coaching note not found"); error.code = "NOTE_NOT_FOUND"; throw error; }
    if (actor.role === "coach" && String(note.authorUserId) !== String(actor.userId)) { const error = new Error("A coach may only edit their own note"); error.code = "NOTE_AUTHOR_FORBIDDEN"; throw error; }
    Object.assign(note, payload.body === undefined ? {} : { body: payload.body });
    return note;
  },
  async upsertHandoff() { return state.handoffs[0]; },
};
const referralCommissionService = { saveRule: async (value) => value, transitionCommission: async (value) => value, setReferralIdentity: async (value) => value, attributeReferral: async (value) => value };

function auth(role, userId, workspaceId = ids.workspace) {
  return createAuthContext({ user: { _id: userId }, workspace: { _id: workspaceId }, role, session: {} });
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    const userId = req.headers["x-test-user"];
    const workspaceId = req.headers["x-test-workspace"] || String(ids.workspace);
    if (role && userId) req.auth = auth(role, userId, workspaceId);
    next();
  });
  app.use("/api/coaching", createCoachingRouter({
    CoachProfile: model(state.profiles),
    CoachingProgram: model(state.programs),
    Enrollment: model(state.enrollments),
    CoachAssignment: model(state.assignments),
    Contact: model(state.contacts),
    CoachingNote: model(state.notes),
    CoachingHandoff: model(state.handoffs),
    CrmActivity: model(state.activities),
    ConversationThread: model([]),
    ConversationMessage: model([]),
    ReferralAttribution: model(state.referrals), CommissionRule: model([]), CommissionLedger: model(state.commissions),
    domainService,
    assignmentService,
    coachingAuthorization,
    historyService,
    referralCommissionService,
  }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/coaching`;
  const request = async (path, role, userId, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { "content-type": "application/json", "x-test-role": role, "x-test-user": String(userId), ...(options.headers || {}) },
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    let result = await request("/coaches", "owner", ids.owner);
    assert.equal(result.status, 200, "owner must list workspace coaches");
    result = await request("/programs", "admin", ids.admin);
    assert.equal(result.status, 200, "admin must list programs");

    result = await request("/coaches/me", "coach", ids.coach);
    assert.equal(result.status, 200, "coach must retrieve own profile");
    assert.equal(String(result.body.data._id), String(ids.profile));
    result = await request(`/coaches/${ids.otherProfile}`, "coach", ids.coach);
    assert.equal(result.status, 404, "coach must not retrieve another coach profile");
    result = await request("/coaches/onboard", "coach", ids.coach, { method: "POST", body: JSON.stringify({ name: "Unauthorized", email: "unauthorized@example.test" }) });
    assert.equal(result.status, 403, "coach must not onboard another coach");
    result = await request("/coaches/onboard", "closer", ids.closer, { method: "POST", body: JSON.stringify({ name: "Unauthorized", email: "unauthorized@example.test" }) });
    assert.equal(result.status, 403, "closer must not access coach onboarding");

    result = await request(`/enrollments/${ids.enrollment}`, "coach", ids.coach);
    assert.equal(result.status, 200, "coach must retrieve assigned enrollment");
    result = await request(`/enrollments/${ids.otherEnrollment}`, "coach", ids.coach);
    assert.equal(result.status, 404, "coach must not retrieve unassigned enrollment");

    result = await request(`/students/${ids.contact}`, "coach", ids.coach);
    assert.equal(result.status, 200, "coach must retrieve assigned canonical Contact through coaching namespace");
    assert.equal(String(result.body.data.contact._id), String(ids.contact));
    result = await request(`/students/${ids.otherContact}`, "coach", ids.coach);
    assert.equal(result.status, 404, "coach must not retrieve unassigned Contact");

    result = await request(`/students/${ids.contact}/notes`, "owner", ids.owner);
    assert.equal(result.status, 200, "owner must retrieve complete workspace coaching notes for student");
    assert.equal(result.body.data.length, 2, "owner must see current and historical coach notes");
    result = await request(`/students/${ids.contact}/notes`, "coach", ids.coach);
    assert.equal(result.status, 200, "assigned coach must retrieve permitted historical notes");
    assert.equal(result.body.data.length, 2, "assigned coach receives prior-coach context for the authorized enrollment");
    result = await request(`/students/${ids.otherContact}/notes`, "coach", ids.coach);
    assert.equal(result.status, 404, "coach must not list notes for an unrelated student");
    result = await request(`/students/${ids.contact}/notes`, "coach", ids.coach, { method: "POST", body: JSON.stringify({ enrollmentId: ids.enrollment, coachAssignmentId: ids.assignment, category: "progress", body: "Authorized note", authorUserId: ids.otherCoach }) });
    assert.equal(result.status, 201, "coach must create a note for an assigned student");
    assert.equal(String(result.body.data.authorUserId), String(ids.coach), "note authorship must be server-derived");
    result = await request(`/students/${ids.otherContact}/notes`, "coach", ids.coach, { method: "POST", body: JSON.stringify({ enrollmentId: ids.otherEnrollment, coachAssignmentId: ids.otherAssignment, body: "Unauthorized note" }) });
    assert.equal(result.status, 404, "coach must not create a note for an unrelated student");
    result = await request(`/notes/${ids.priorNote}`, "coach", ids.coach, { method: "PATCH", body: JSON.stringify({ body: "Improper overwrite" }) });
    assert.equal(result.status, 403, "coach must not modify another coach's historical note");
    result = await request(`/students/${ids.contact}/handoffs`, "coach", ids.coach);
    assert.equal(result.status, 200, "incoming assigned coach must retrieve authorized handoff history");
    assert.equal(result.body.data[0].summary, "Continue with the growth plan");
    result = await request("/referrals", "coach", ids.coach); assert.equal(result.status, 200); assert.equal(result.body.data.length, 1); assert.equal(String(result.body.data[0].coachUserId), String(ids.coach));
    result = await request("/commissions", "coach", ids.coach); assert.equal(result.status, 200); assert.equal(result.body.data.length, 1); assert.equal(String(result.body.data[0].coachUserId), String(ids.coach));
    result = await request("/commission-rules", "coach", ids.coach); assert.equal(result.status, 403, "coach cannot view workspace commission rules");
    result = await request("/commission-rules", "coach", ids.coach, { method: "POST", body: JSON.stringify({ scope: "default", rateBps: 9000 }) }); assert.equal(result.status, 403, "coach cannot edit rates");
    result = await request(`/commissions/${state.commissions[0]._id}/status`, "coach", ids.coach, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }); assert.equal(result.status, 403, "coach cannot approve commissions");
    result = await request(`/commissions/${state.commissions[0]._id}/status`, "admin", ids.admin, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }); assert.equal(result.status, 200, "admin can approve commissions");

    result = await request(`/assignments/${ids.assignment}`, "coach", ids.coach);
    assert.equal(result.status, 200, "coach must retrieve own assignment");
    result = await request(`/assignments/${ids.otherAssignment}`, "coach", ids.coach);
    assert.equal(result.status, 404, "coach must not retrieve another coach assignment");

    result = await request("/programs", "coach", ids.coach, { method: "POST", body: JSON.stringify({ name: "Unauthorized" }) });
    assert.equal(result.status, 403, "coach must not create programs");
    result = await request("/assignments", "coach", ids.coach, { method: "POST", body: JSON.stringify({ enrollmentId: ids.otherEnrollment, coachProfileId: ids.profile, stageKey: "start" }) });
    assert.equal(result.status, 403, "coach must not assign arbitrary students");
    result = await request("/enrollments", "closer", ids.closer);
    assert.equal(result.status, 403, "closer must not access Coaching CRM");

    result = await request(`/enrollments/${ids.enrollment}`, "admin", ids.admin, { headers: { "x-test-workspace": String(ids.otherWorkspace) } });
    assert.equal(result.status, 404, "cross-workspace enrollment access must be denied");
    result = await request(`/students/${ids.contact}`, "admin", ids.admin, { headers: { "x-test-workspace": String(ids.otherWorkspace) } });
    assert.equal(result.status, 404, "cross-workspace Contact access must be denied");
    result = await request(`/students/${ids.contact}/notes`, "admin", ids.admin, { headers: { "x-test-workspace": String(ids.otherWorkspace) } });
    assert.equal(result.status, 200, "cross-workspace note query must remain workspace scoped");
    assert.equal(result.body.data.length, 0, "cross-workspace notes must never appear");

    const maliciousWorkspace = String(ids.otherWorkspace);
    result = await request("/assignments", "admin", ids.admin, {
      method: "POST",
      body: JSON.stringify({ enrollmentId: ids.enrollment, coachProfileId: ids.profile, stageKey: "start", workspaceId: maliciousWorkspace, coachUserId: ids.otherCoach, contactId: ids.otherContact }),
    });
    assert.equal(result.status, 201, "admin assignment creation must use domain service");
    const assignmentCall = calls.find(([name]) => name === "createCoachAssignment")[1];
    assert.equal(String(assignmentCall.workspaceId), String(ids.workspace), "API must derive workspace from auth context");
    assert.equal(assignmentCall.coachUserId, undefined, "API must not accept client coachUserId");
    assert.equal(assignmentCall.contactId, undefined, "API must not accept client assignment contactId");

    result = await request("/programs", "admin", ids.admin, {
      method: "POST",
      body: JSON.stringify({ name: "Admin Program", workspaceId: maliciousWorkspace, stages: [] }),
    });
    assert.equal(result.status, 201, "admin must create programs through domain service");
    const programCall = calls.find(([name]) => name === "createCoachingProgram")[1];
    assert.equal(String(programCall.workspaceId), String(ids.workspace), "program workspace must be server-derived");

    console.log("Coaching API authorization and service-boundary checks passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
