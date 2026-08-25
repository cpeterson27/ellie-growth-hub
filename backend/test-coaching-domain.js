const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const CoachProfile = require("./models/CoachProfile");
const CoachingProgram = require("./models/CoachingProgram");
const Enrollment = require("./models/Enrollment");
const CoachAssignment = require("./models/CoachAssignment");
const { runWithWorkspace } = require("./tenancy/workspaceContext");
const coaching = require("./services/coachingDomainService");
const assignments = require("./services/coachAssignmentService");
const authorization = require("./services/coachingAuthorizationService");

const id = () => new mongoose.Types.ObjectId();
const ids = {
  workspace: id(), otherWorkspace: id(), user: id(), otherUser: id(), profile: id(), otherProfile: id(),
  contact: id(), program: id(), enrollment: id(), assignment: id(), opportunity: id(),
};

function query(value) {
  return {
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

async function testSchemasAndTenancy() {
  assert.equal(CoachProfile.schema.path("userId").options.ref, "User");
  assert.equal(Enrollment.schema.path("contactId").options.ref, "Contact");
  assert.equal(Enrollment.schema.path("sourceOpportunityId").options.ref, "SalesOpportunity");
  assert.equal(CoachAssignment.schema.path("coachProfileId").options.ref, "CoachProfile");
  assert.equal(CoachAssignment.schema.path("coachUserId").options.ref, "User");

  const uniqueCoachIndex = CoachProfile.schema.indexes().find(([fields, options]) => fields.workspaceId === 1 && fields.userId === 1 && options.unique);
  assert(uniqueCoachIndex, "CoachProfile must be unique per user/workspace");

  await runWithWorkspace(ids.workspace, async () => {
    for (const model of [CoachProfile, CoachingProgram, Enrollment, CoachAssignment]) {
      const scoped = model.find({ workspaceId: ids.otherWorkspace });
      scoped.model.db.config.bufferCommands = false;
      await scoped.exec().catch(() => {});
      assert.equal(String(scoped.getFilter().workspaceId), String(ids.workspace), `${model.modelName} queries must be workspace scoped`);
      const document = new model({ workspaceId: ids.otherWorkspace });
      await document.validate().catch(() => {});
      assert.equal(String(document.workspaceId), String(ids.workspace), `${model.modelName} documents must inherit active workspace`);
    }
  });
}

async function testCoachProfiles() {
  let created = null;
  const models = {
    WorkspaceMembership: { findOne: () => query({ workspaceId: ids.workspace, userId: ids.user, role: "coach", status: "active" }) },
    CoachProfile: { create: async (value) => { created = value; return value; } },
  };
  await coaching.createCoachProfile({ workspaceId: ids.workspace, userId: ids.user, displayName: "Dean" }, models);
  assert.equal(String(created.userId), String(ids.user));
  assert.equal(String(created.workspaceId), String(ids.workspace));

  await assert.rejects(
    coaching.createCoachProfile({ workspaceId: ids.workspace, userId: ids.otherUser }, {
      WorkspaceMembership: { findOne: () => query(null) },
      CoachProfile: { create: async () => assert.fail("must not create cross-workspace coach") },
    }),
    (error) => error.code === "COACH_MEMBERSHIP_REQUIRED",
  );
}

function programFixture() {
  return {
    _id: ids.program,
    workspaceId: ids.workspace,
    name: "Flexible Coaching",
    status: "active",
    version: 3,
    duration: { value: 6, unit: "weeks" },
    defaultPrice: { amount: 1700, currency: "USD" },
    stages: [{ key: "foundation", label: "Foundation", order: 0 }, { key: "growth", label: "Growth", order: 1 }],
  };
}

async function testEnrollmentIntegrity() {
  let created = null;
  const activities = [];
  const models = {
    Contact: { findOne: () => query({ _id: ids.contact, workspaceId: ids.workspace }) },
    CoachingProgram: { findOne: () => query(programFixture()) },
    SalesOpportunity: { findOne: () => query({ _id: ids.opportunity, workspaceId: ids.workspace, primaryContactId: ids.contact }) },
    Enrollment: { create: async (value) => { created = { _id: ids.enrollment, ...value }; return created; } },
    CrmActivity: { create: async (value) => { activities.push(value); return value; } },
  };
  const enrollment = await coaching.createEnrollment({
    workspaceId: ids.workspace,
    contactId: ids.contact,
    coachingProgramId: ids.program,
    sourceOpportunityId: ids.opportunity,
    startsAt: new Date("2026-09-01T00:00:00Z"),
  }, models);
  assert.equal(String(enrollment.contactId), String(ids.contact), "Enrollment must reference canonical Contact");
  assert.equal(String(enrollment.sourceOpportunityId), String(ids.opportunity), "Enrollment must preserve Sales Opportunity relationship");
  assert.equal(enrollment.programVersion, 3);
  assert.equal(enrollment.currentStageKey, "foundation");
  assert.equal(activities[0].metadata.eventType, "student.enrolled");

  await assert.rejects(
    coaching.createEnrollment({ workspaceId: ids.workspace, contactId: ids.contact, coachingProgramId: ids.program }, {
      Contact: { findOne: () => query(null) },
      CoachingProgram: { findOne: () => query(programFixture()) },
      SalesOpportunity: {}, Enrollment: { create: async () => assert.fail("must not create") }, CrmActivity: {},
    }),
    (error) => error.code === "CONTACT_WORKSPACE_MISMATCH",
  );
}

async function testAssignmentIntegrityAndHistory() {
  const records = [];
  const activityRecords = [];
  const enrollment = {
    _id: ids.enrollment,
    workspaceId: ids.workspace,
    contactId: ids.contact,
    status: "active",
    programSnapshot: { stages: [{ key: "foundation", order: 0 }, { key: "growth", order: 1 }] },
  };
  const coachProfiles = new Map([
    [String(ids.profile), { _id: ids.profile, workspaceId: ids.workspace, userId: ids.user, status: "active" }],
    [String(ids.otherProfile), null],
  ]);
  const handoff = { _id: id(), status: "submitted", async save() { return this; } };
  const model = {
    Enrollment: { findOne: (filter) => query(String(filter.workspaceId) === String(ids.workspace) ? enrollment : null) },
    CoachProfile: { findOne: (filter) => query(String(filter.workspaceId) === String(ids.workspace) ? coachProfiles.get(String(filter._id)) : null) },
    CoachAssignment: {
      findOne(filter) {
        let found = null;
        if (filter._id) found = records.find((item) => String(item._id) === String(filter._id) && String(item.workspaceId) === String(filter.workspaceId));
        else found = records.find((item) => String(item.enrollmentId) === String(filter.enrollmentId) && item.stageKey === filter.stageKey && ["scheduled", "active"].includes(item.status));
        return query(found || null);
      },
      async create(value) {
        const document = { _id: id(), ...value, async save() { return this; } };
        records.push(document);
        return document;
      },
    },
    CrmActivity: { create: async (value) => { activityRecords.push(value); return value; } },
    CoachingHandoff: { findOne: () => query(handoff) },
  };

  const first = await assignments.createCoachAssignment({ workspaceId: ids.workspace, enrollmentId: ids.enrollment, coachProfileId: ids.profile, stageKey: "foundation", startsAt: new Date(0) }, model);
  assert.equal(String(first.contactId), String(ids.contact));
  assert.equal(String(first.coachUserId), String(ids.user));

  const second = await assignments.transitionCoachAssignment({
    workspaceId: ids.workspace,
    currentAssignmentId: first._id,
    next: { coachProfileId: ids.profile, stageKey: "growth", sequence: 1 },
  }, model);
  assert.equal(records.length, 2, "transition must create a new historical assignment record");
  assert.equal(first.status, "completed", "previous assignment must be retained and completed");
  assert.equal(String(second.previousAssignmentId), String(first._id));
  assert.equal(handoff.status, "completed", "handoff must be completed without overwriting the prior assignment");
  assert(activityRecords.some((item) => item.metadata.eventType === "coach.assignment.completed"));

  await assert.rejects(
    assignments.createCoachAssignment({ workspaceId: ids.workspace, enrollmentId: ids.enrollment, coachProfileId: ids.otherProfile, stageKey: "growth" }, model),
    (error) => error.code === "COACH_WORKSPACE_MISMATCH",
  );
  await assert.rejects(
    assignments.createCoachAssignment({ workspaceId: ids.otherWorkspace, enrollmentId: ids.enrollment, coachProfileId: ids.profile, stageKey: "growth" }, model),
    (error) => error.code === "ENROLLMENT_WORKSPACE_MISMATCH",
  );
}

async function testAuthorizationResolver() {
  const assignmentRows = [
    { _id: ids.assignment, enrollmentId: ids.enrollment, contactId: ids.contact },
    { _id: id(), enrollmentId: ids.enrollment, contactId: ids.contact },
  ];
  let observedFilter = null;
  const models = {
    CoachProfile: { findOne: (filter) => query(filter.userId && String(filter.workspaceId) === String(ids.workspace) ? { _id: ids.profile } : null) },
    CoachAssignment: { find: (filter) => { observedFilter = filter; return query(assignmentRows); } },
  };
  const access = await authorization.resolveCoachAuthorizedIds({ workspaceId: ids.workspace, userId: ids.user, now: new Date("2026-08-24T00:00:00Z") }, models);
  assert.deepEqual(access.contactIds.map(String), [String(ids.contact)]);
  assert.deepEqual(access.enrollmentIds.map(String), [String(ids.enrollment)]);
  assert.equal(String(observedFilter.workspaceId), String(ids.workspace));
  assert.equal(String(observedFilter.coachUserId), String(ids.user));

  const denied = await authorization.resolveCoachAuthorizedIds({ workspaceId: ids.otherWorkspace, userId: ids.user }, {
    CoachProfile: { findOne: () => query(null) },
    CoachAssignment: { find: () => assert.fail("assignments must not be queried without an authorized profile") },
  });
  assert.deepEqual(denied, { contactIds: [], enrollmentIds: [], assignmentIds: [] });
}

async function main() {
  await testSchemasAndTenancy();
  await testCoachProfiles();
  await testEnrollmentIntegrity();
  await testAssignmentIntegrityAndHistory();
  await testAuthorizationResolver();
  console.log("Coaching domain and assignment authorization checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
