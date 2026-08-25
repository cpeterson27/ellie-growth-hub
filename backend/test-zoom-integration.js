const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.ZOOM_CLIENT_ID = "local-zoom-client"; process.env.ZOOM_CLIENT_SECRET = "local-zoom-secret"; process.env.ZOOM_REDIRECT_URI = "http://localhost:5001/api/coaching/zoom/oauth/callback"; process.env.ZOOM_WEBHOOK_SECRET_TOKEN = "local-webhook-secret";

const zoomService = require("./services/zoomService");
const scheduling = require("./services/coachingSchedulingService");
const { decryptCredentials } = require("./utils/credentialEncryption");

const id = (value) => ({ toString: () => value });
function get(row, key) { return key.split(".").reduce((value, part) => value?.[part], row); }
function matches(row, filter) { return Object.entries(filter).every(([key, value]) => String(get(row, key)) === String(value)); }
function query(value) { return { select() { return this; }, populate() { return this; }, sort() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }

async function run() {
  const ws = id("aaaaaaaaaaaaaaaaaaaaaaaa"), otherWs = id("bbbbbbbbbbbbbbbbbbbbbbbb"), deanUser = id("111111111111111111111111"), sherryUser = id("222222222222222222222222"), deanCoach = id("333333333333333333333333"), sherryCoach = id("444444444444444444444444");
  const coaches = [{ _id: deanCoach, workspaceId: ws, userId: deanUser, displayName: "Dean", status: "active" }, { _id: sherryCoach, workspaceId: ws, userId: sherryUser, displayName: "Sherry", status: "active" }];
  const enrollment = { _id: id("555555555555555555555555"), workspaceId: ws, contactId: id("666666666666666666666666"), coachingProgramId: id("777777777777777777777777"), currentStageKey: "launch", programSnapshot: { name: "Growth Program" } }; const contact = { _id: enrollment.contactId, workspaceId: ws, name: "Sarah Williams" };
  const connections = [], sessions = [], activities = [], receipts = [], zoomCalls = [], calendarCalls = [];
  const models = {
    CoachProfile: { findOne: (filter) => query(coaches.find((row) => matches(row, filter)) || null) },
    WorkspaceMembership: { findOne: (filter) => query(coaches.some((row) => String(row.workspaceId) === String(filter.workspaceId) && String(row.userId) === String(filter.userId)) ? { role: "coach", status: "active" } : null) },
    IntegrationConnection: { findOne: (filter) => query(connections.find((row) => matches(row, filter)) || null), findOneAndUpdate: async (filter, update) => { let row = connections.find((item) => matches(item, filter)); if (!row) { row = { _id: id(`connection-${connections.length}`), ...filter, settings: {}, oauth: {}, async save() { return this; } }; connections.push(row); } Object.assign(row, update.$set); return row; } },
    Enrollment: { findOne: (filter) => query(String(filter.workspaceId) === String(ws) && String(filter._id) === String(enrollment._id) ? enrollment : null) }, Contact: { findOne: (filter) => query(String(filter.workspaceId) === String(ws) && String(filter._id) === String(contact._id) ? contact : null) },
    CoachingSession: { findOne: (filter) => query(sessions.find((row) => matches(row, filter)) || null) },
    ZoomWebhookEvent: { create: async (value) => { if (receipts.some((row) => row.providerEventId === value.providerEventId)) { const error = new Error("duplicate"); error.code = 11000; throw error; } receipts.push(value); return value; } },
    CrmActivity: { create: async (value) => { activities.push(value); return value; } },
    zoomService,
  };
  const adapter = { refresh: async () => assert.fail("unexpired token should not refresh"), request: async (_token, path, options = {}) => { zoomCalls.push({ path, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null }); if (path === "/users/me/meetings") return { id: `meeting-${zoomCalls.length}`, join_url: `https://zoom.invalid/j/${zoomCalls.length}`, host_id: `host-${zoomCalls.length}` }; return {}; } };
  for (const [coach, user, email, accountId] of [[coaches[0], deanUser, "dean@example.com", "account-shared"], [coaches[1], sherryUser, "sherry@example.com", "account-shared"]]) {
    await zoomService.saveConnection({ workspaceId: ws, userId: user, coachProfileId: coach._id, coach }, { access_token: `${coach.displayName}-token`, refresh_token: `${coach.displayName}-refresh`, expires_in: 3600 }, { email, first_name: coach.displayName, id: `user-${coach.displayName}`, account_id: accountId }, models);
    const row = connections.at(-1); assert.equal(row.credentials, undefined); assert.notEqual(row.credentialsEncrypted.ciphertext, `${coach.displayName}-token`); assert.equal(decryptCredentials(row.credentialsEncrypted).refreshToken, `${coach.displayName}-refresh`);
  }
  assert.equal(connections.length, 2); assert.equal((await zoomService.ownStatus({ workspaceId: ws, userId: deanUser, coachProfileId: deanCoach }, models)).email, "dean@example.com"); assert.equal((await zoomService.ownStatus({ workspaceId: otherWs, userId: deanUser, coachProfileId: deanCoach }, models)).connected, false);

  models.googleCalendarService = {
    scheduleSession: async (input) => { calendarCalls.push(["create", input.coachProfileId]); const session = { _id: id(`session-${sessions.length}`), workspaceId: input.workspaceId, contactId: contact._id, enrollmentId: enrollment._id, coachProfileId: input.coachProfileId, coachingProgramId: enrollment.coachingProgramId, stageKey: "launch", startsAt: new Date(input.startsAt), durationMinutes: input.durationMinutes, timezone: "America/Los_Angeles", status: "scheduled", calendar: { connectionId: id(`calendar-${input.coachProfileId}`), calendarId: `calendar-${input.coachProfileId}`, eventId: `event-${sessions.length}` }, createdBy: input.createdBy, zoom: { attendance: { state: "unknown", participantCount: 0, participants: [] } }, async save() { return this; } }; sessions.push(session); return session; },
    syncVideoLink: async ({ session }) => { calendarCalls.push(["video", session.coachProfileId, session.zoom.joinUrl]); return session; },
    rescheduleSession: async (input) => { const session = sessions.find((row) => String(row._id) === String(input.sessionId)); session.startsAt = new Date(input.startsAt); session.durationMinutes = input.durationMinutes; calendarCalls.push(["reschedule", session.coachProfileId]); return session; },
    cancelSession: async (input) => { const session = sessions.find((row) => String(row._id) === String(input.sessionId)); session.status = "cancelled"; calendarCalls.push(["cancel", session.coachProfileId]); return session; },
  };
  models.zoomService = { ...zoomService, connectedConnection: (input, deps) => zoomService.connectedConnection(input, deps), createMeeting: (input, deps) => zoomService.createMeeting(input, deps, adapter), updateMeeting: (input, deps) => zoomService.updateMeeting(input, deps, adapter), cancelMeeting: (input, deps) => zoomService.cancelMeeting(input, deps, adapter) };
  const created = [];
  for (const coachProfileId of [deanCoach, sherryCoach]) created.push(await scheduling.schedule({ workspaceId: ws, enrollmentId: enrollment._id, coachProfileId, startsAt: "2027-03-10T18:00:00Z", durationMinutes: 60, videoMode: "zoom", createdBy: deanUser }, models));
  assert.equal(created[0].zoom.connectionId, connections[0]._id); assert.equal(created[1].zoom.connectionId, connections[1]._id); assert.notEqual(created[0].zoom.meetingId, created[1].zoom.meetingId); assert(calendarCalls.some((call) => call[0] === "video" && call[2] === created[0].zoom.joinUrl));
  const beforeMissing = calendarCalls.length; await assert.rejects(() => scheduling.schedule({ workspaceId: ws, enrollmentId: enrollment._id, coachProfileId: id("999999999999999999999999"), startsAt: "2027-03-10T18:00:00Z", durationMinutes: 60, videoMode: "zoom", createdBy: deanUser }, models), /connect Zoom/); assert.equal(calendarCalls.length, beforeMissing, "missing Zoom fails before calendar creation");
  await scheduling.reschedule({ workspaceId: ws, sessionId: created[0]._id, startsAt: "2027-03-11T18:00:00Z", durationMinutes: 45, updatedBy: deanUser }, models); assert(zoomCalls.some((call) => call.method === "PATCH" && call.path === `/meetings/${created[0].zoom.meetingId}`));
  await zoomService.processWebhook({ event: "meeting.ended", event_id: "evt-no-show", event_ts: Date.now(), payload: { account_id: "account-shared", object: { id: created[1].zoom.meetingId } } }, models); assert.equal(created[1].zoom.attendance.state, "no_show"); assert(activities.some((row) => row.metadata.eventType === "coaching.session.no_show"));
  await scheduling.cancel({ workspaceId: ws, sessionId: created[1]._id, reason: "Cancelled", updatedBy: deanUser }, models); assert(zoomCalls.some((call) => call.method === "DELETE" && call.path === `/meetings/${created[1].zoom.meetingId}`)); assert.equal(created[1].status, "cancelled");

  const timestamp = String(Math.floor(Date.now() / 1000)); const raw = JSON.stringify({ event: "meeting.started" }); const signature = `v0=${crypto.createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(`v0:${timestamp}:${raw}`).digest("hex")}`; assert.equal(zoomService.verifyWebhook(raw, timestamp, signature), true); assert.equal(zoomService.verifyWebhook(`${raw}x`, timestamp, signature), false);
  const joined = { event: "meeting.participant_joined", event_id: "evt-join", event_ts: Date.now(), payload: { account_id: "account-shared", object: { id: created[0].zoom.meetingId, participant: { user_id: "participant-1", user_name: "Student", email: "student@example.com" } } } };
  assert.equal((await zoomService.processWebhook(joined, models)).processed, true); assert.equal((await zoomService.processWebhook(joined, models)).duplicate, true); assert.equal(created[0].zoom.attendance.state, "attended");
  await zoomService.processWebhook({ event: "meeting.ended", event_id: "evt-end", event_ts: Date.now(), payload: { account_id: "account-shared", object: { id: created[0].zoom.meetingId } } }, models); assert.equal(created[0].zoom.status, "ended"); assert(activities.some((row) => row.metadata.eventType === "coaching.session.attended"));
  assert.deepEqual(new Set(activities.map((row) => row.metadata.eventType).filter((value) => value.startsWith("coaching.zoom"))), new Set(["coaching.zoom.meeting.created", "coaching.zoom.meeting.updated", "coaching.zoom.meeting.cancelled"]));
  const state = zoomService.createState({ workspaceId: ws, userId: deanUser, coachProfileId: deanCoach }); assert.equal(zoomService.verifyState(state).coachProfileId, String(deanCoach)); assert.equal(zoomService.verifyState(`${state}bad`), null);
  console.log("Per-coach Zoom integration, coordination, webhook, and attendance tests passed (mocked only). ");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
