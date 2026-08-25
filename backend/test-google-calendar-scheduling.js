const assert = require("assert");
const crypto = require("crypto");

process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.GOOGLE_CALENDAR_CLIENT_ID = "local-client";
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "local-secret";
process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:5001/api/coaching/calendar/oauth/callback";

const service = require("./services/googleCalendarService");
const { encryptCredentials, decryptCredentials } = require("./utils/credentialEncryption");

function query(value) { return { select() { return this; }, populate() { return this; }, sort() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
function id(value) { return { toString: () => value }; }

async function run() {
  const ws = id("aaaaaaaaaaaaaaaaaaaaaaaa"); const otherWs = id("bbbbbbbbbbbbbbbbbbbbbbbb"); const deanUser = id("111111111111111111111111"); const sherryUser = id("222222222222222222222222"); const deanCoach = id("333333333333333333333333"); const sherryCoach = id("444444444444444444444444");
  const enrollment = { _id: id("555555555555555555555555"), workspaceId: ws, contactId: id("666666666666666666666666"), coachingProgramId: id("777777777777777777777777"), currentStageKey: "launch", programSnapshot: { name: "Growth Program" } };
  const contact = { _id: enrollment.contactId, workspaceId: ws, name: "Sarah Williams" };
  const coaches = [{ _id: deanCoach, workspaceId: ws, userId: deanUser, status: "active", displayName: "Dean", timezone: "America/Los_Angeles" }, { _id: sherryCoach, workspaceId: ws, userId: sherryUser, status: "active", displayName: "Sherry", timezone: "America/New_York" }];
  const connections = [];
  const sessions = []; const activities = []; const calls = [];
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value));
  const models = {
    CoachProfile: { findOne: (filter) => query(coaches.find((item) => matches(item, filter)) || null) },
    WorkspaceMembership: { findOne: (filter) => query(coaches.some((item) => String(item.workspaceId) === String(filter.workspaceId) && String(item.userId) === String(filter.userId)) ? { role: "coach", status: "active" } : null) },
    IntegrationConnection: {
      findOne: (filter) => query(connections.find((item) => matches(item, filter)) || null),
      findOneAndUpdate: async (filter, update) => { let item = connections.find((value) => matches(value, filter)); if (!item) { item = { _id: id(`connection-${connections.length}`), ...filter, settings: {}, oauth: {}, async save() { return this; } }; connections.push(item); } Object.assign(item, update.$set); return item; },
    },
    Enrollment: { findOne: (filter) => query(String(filter.workspaceId) === String(ws) && String(filter._id) === String(enrollment._id) ? enrollment : null) },
    Contact: { findOne: (filter) => query(String(filter.workspaceId) === String(ws) && String(filter._id) === String(contact._id) ? contact : null) },
    CoachingSession: {
      create: async (value) => { const item = { _id: id(`session-${sessions.length}`), ...value, async save() { return this; } }; sessions.push(item); return item; },
      findOne: (filter) => query(sessions.find((item) => matches(item, filter)) || null),
    },
    CrmActivity: { create: async (value) => { activities.push(value); return value; } },
  };
  let busyMode = false;
  const adapter = {
    refresh: async () => assert.fail("unexpired mock token must not refresh"),
    request: async (_token, path, options = {}) => { calls.push({ path, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null }); if (path === "/freeBusy") return { calendars: { [JSON.parse(options.body).items[0].id]: { busy: busyMode ? [{ start: "2027-01-12T18:00:00Z", end: "2027-01-12T19:00:00Z" }] : [] } } }; if (path.includes("/events") && options.method === "POST") return { id: `event-${calls.length}`, htmlLink: "https://calendar.invalid/event" }; return {}; },
  };
  for (const [coach, user, email, calendarId] of [[coaches[0], deanUser, "dean@example.com", "dean-calendar"], [coaches[1], sherryUser, "sherry@example.com", "sherry-calendar"]]) {
    await service.saveConnection({ workspaceId: ws, userId: user, coachProfileId: coach._id, coach }, { access_token: `${coach.displayName}-token`, refresh_token: `${coach.displayName}-refresh`, expires_in: 3600 }, { email, name: coach.displayName, sub: `${coach.displayName}-google` }, models);
    const connection = connections.at(-1); connection.settings.selectedCalendarId = calendarId; connection.settings.timezone = coach.timezone;
    assert.equal(connection.credentials, undefined); assert.notEqual(connection.credentialsEncrypted.ciphertext, `${coach.displayName}-token`); assert.equal(decryptCredentials(connection.credentialsEncrypted).refreshToken, `${coach.displayName}-refresh`);
  }
  assert.equal(connections.length, 2, "two coach-owned connections coexist in one workspace");
  assert.equal((await service.ownStatus({ workspaceId: ws, userId: deanUser, coachProfileId: deanCoach }, models)).email, "dean@example.com");
  assert.equal((await service.ownStatus({ workspaceId: ws, userId: sherryUser, coachProfileId: sherryCoach }, models)).email, "sherry@example.com");
  assert.equal((await service.ownStatus({ workspaceId: otherWs, userId: deanUser, coachProfileId: deanCoach }, models)).connected, false, "cross-workspace lookup is denied by scope");
  await service.saveConnection({ workspaceId: ws, userId: deanUser, coachProfileId: deanCoach, coach: coaches[0] }, { access_token: "Dean-new-token", expires_in: 3600 }, { email: "dean@example.com", name: "Dean", sub: "Dean-google" }, models);
  assert.equal(connections[0].settings.selectedCalendarId, "dean-calendar", "reconnect preserves selected calendar");

  const scheduled = [];
  for (const coachProfileId of [deanCoach, sherryCoach]) scheduled.push(await service.scheduleSession({ workspaceId: ws, enrollmentId: enrollment._id, coachProfileId, startsAt: "2027-01-10T18:00:00.000Z", durationMinutes: 60, createdBy: id("888888888888888888888888") }, models, adapter));
  assert.equal(scheduled[0].calendar.calendarId, "dean-calendar"); assert.equal(scheduled[1].calendar.calendarId, "sherry-calendar");
  assert(calls.some((call) => call.path === "/calendars/dean-calendar/events")); assert(calls.some((call) => call.path === "/calendars/sherry-calendar/events"));
  assert.equal(calls.find((call) => call.method === "POST" && call.path.includes("events")).body.summary, "Coaching — Sarah Williams");
  assert(!JSON.stringify(calls).includes("private note"));

  await service.rescheduleSession({ workspaceId: ws, sessionId: scheduled[0]._id, startsAt: "2027-01-11T18:00:00.000Z", durationMinutes: 45, updatedBy: deanUser }, models, adapter);
  assert(calls.some((call) => call.method === "PATCH" && call.path.includes(`/events/${scheduled[0].calendar.eventId}`)), "reschedule targets original event");
  await service.cancelSession({ workspaceId: ws, sessionId: scheduled[1]._id, reason: "Student unavailable", updatedBy: deanUser }, models, adapter);
  assert(calls.some((call) => call.method === "DELETE" && call.path.includes(`/events/${scheduled[1].calendar.eventId}`)), "cancel targets original event");
  assert.equal(scheduled[1].status, "cancelled");
  const free = await service.availability({ workspaceId: ws, coachProfileId: deanCoach, startsAt: "2027-01-12T18:00:00.000Z", durationMinutes: 60 }, models, adapter);
  assert.equal(free.available, true); assert.equal(free.calendarId, "dean-calendar");
  busyMode = true; const conflict = await service.availability({ workspaceId: ws, coachProfileId: deanCoach, startsAt: "2027-01-12T18:00:00.000Z", durationMinutes: 60 }, models, adapter); assert.equal(conflict.available, false); assert.equal(conflict.busy.length, 1);
  assert.deepEqual(new Set(activities.map((item) => item.metadata.eventType)), new Set(["google.calendar.connected", "coaching.session.scheduled", "coaching.session.rescheduled", "coaching.session.cancelled"]));

  const state = service.createState({ workspaceId: ws, userId: deanUser, coachProfileId: deanCoach }); assert.equal(service.verifyState(state).userId, String(deanUser)); assert.equal(service.verifyState(`${state}bad`), null);
  await assert.rejects(() => service.validateStateIdentity({ workspaceId: otherWs, userId: deanUser, coachProfileId: deanCoach }, models), /no longer available/);
  assert.equal(encryptCredentials({ token: "secret" }).ciphertext.includes("secret"), false);
  console.log("Google Calendar scheduling tests passed (mocked; no provider calls). ");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
