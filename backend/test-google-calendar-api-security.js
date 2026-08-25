const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");
const { createAuthContext } = require("./middleware/auth");
const { createCoachingRouter } = require("./routes/coaching");

const id = () => new mongoose.Types.ObjectId();
const ids = { workspace: id(), otherWorkspace: id(), owner: id(), coach: id(), otherCoach: id(), profile: id(), otherProfile: id(), connection: id() };
const profiles = [{ _id: ids.profile, workspaceId: ids.workspace, userId: ids.coach, displayName: "Dean", status: "active" }, { _id: ids.otherProfile, workspaceId: ids.workspace, userId: ids.otherCoach, displayName: "Sherry", status: "active" }];
const connection = { _id: ids.connection, workspaceId: ids.workspace, coachProfileId: ids.profile, ownerUserId: ids.coach, provider: "google_calendar", accountScope: "user", status: "connected", settings: { email: "dean@example.com", selectedCalendarId: "dean-calendar", timezone: "America/Los_Angeles" }, credentialsEncrypted: { ciphertext: "must-never-leak" } };
const zoomConnection = { ...connection, _id: id(), provider: "zoom", settings: { email: "dean-zoom@example.com", name: "Dean Zoom" }, credentialsEncrypted: { ciphertext: "zoom-token-must-never-leak" } };
function query(value) { return { populate() { return this; }, sort() { return this; }, limit() { return this; }, select() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value));
const calendar = {
  googleAdapter: {}, verifyState: () => null,
  coachIdentity: async ({ workspaceId, userId }) => { const coach = profiles.find((item) => String(item.workspaceId) === String(workspaceId) && String(item.userId) === String(userId)); if (!coach) throw new Error("Active coach profile not found"); return { workspaceId, userId, coachProfileId: coach._id, coach }; },
  ownStatus: async (identity) => identity.coachProfileId === ids.profile ? calendar.publicConnection(connection) : calendar.publicConnection(null),
  publicConnection: (item) => ({ connected: item?.status === "connected", connectionId: item?._id || null, coachProfileId: item?.coachProfileId || null, email: item?.settings?.email || "", selectedCalendarId: item?.settings?.selectedCalendarId || "", timezone: item?.settings?.timezone || "UTC" }),
  authorizationUrl: (identity) => `https://accounts.google.test/auth?coach=${identity.coachProfileId}`,
  disconnect: async (identity) => ({ connected: false, coachProfileId: identity.coachProfileId }),
  listCalendars: async (identity) => identity.coachProfileId === ids.profile ? [{ id: "dean-calendar" }] : [],
  selectCalendar: async (identity, value) => ({ connected: true, coachProfileId: identity.coachProfileId, selectedCalendarId: value.calendarId }),
};
const zoom = {
  zoomAdapter: {}, verifyState: () => null, verifyWebhook: () => false,
  coachIdentity: calendar.coachIdentity,
  ownStatus: async (identity) => identity.coachProfileId === ids.profile ? zoom.publicConnection(zoomConnection) : zoom.publicConnection(null),
  publicConnection: (item) => ({ connected: item?.status === "connected", connectionId: item?._id || null, coachProfileId: item?.coachProfileId || null, email: item?.settings?.email || "", name: item?.settings?.name || "" }),
  authorizationUrl: (identity) => `https://zoom.test/auth?coach=${identity.coachProfileId}`,
  disconnect: async (identity) => ({ connected: false, coachProfileId: identity.coachProfileId }),
};

async function run() {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const role = req.headers["x-role"]; if (role) req.auth = createAuthContext({ user: { _id: req.headers["x-user"] }, workspace: { _id: req.headers["x-workspace"] || ids.workspace }, role, session: {} }); next(); });
  app.use("/api/coaching", createCoachingRouter({
    CoachProfile: { find: (filter) => query(profiles.filter((item) => matches(item, filter))), findOne: (filter) => query(profiles.find((item) => matches(item, filter)) || null) },
    IntegrationConnection: { find: (filter) => query([connection, zoomConnection].filter((item) => matches(item, filter))) }, CoachingSession: { find: () => query([]) },
    googleCalendarService: calendar,
    zoomService: zoom,
  })); app.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${server.address().port}/api/coaching`;
  const request = async (path, role, user, workspace = ids.workspace) => { const response = await fetch(`${base}${path}`, { headers: { "x-role": role, "x-user": String(user), "x-workspace": String(workspace) } }); return { status: response.status, body: await response.json() }; };
  try {
    let result = await request("/calendar/connection", "coach", ids.coach); assert.equal(result.status, 200); assert.equal(result.body.data.email, "dean@example.com"); assert.equal(JSON.stringify(result.body).includes("ciphertext"), false);
    result = await request("/calendar/connection", "coach", ids.otherCoach); assert.equal(result.status, 200); assert.equal(result.body.data.connected, false, "another coach cannot read Dean's connection");
    result = await request("/calendar/connection", "coach", ids.coach, ids.otherWorkspace); assert.equal(result.status, 400, "cross-workspace coach identity is rejected");
    result = await request("/calendar/connections", "owner", ids.owner); assert.equal(result.status, 200); assert.equal(result.body.data.length, 2); assert.equal(JSON.stringify(result.body).includes("must-never-leak"), false, "owner status response never contains tokens");
    result = await request("/calendar/oauth/start", "owner", ids.owner); assert.equal(result.status, 403, "admin cannot link a calendar on a coach's behalf");
    result = await request("/calendar/oauth/start", "coach", ids.coach); assert.equal(result.status, 200); assert(result.body.authorizationUrl.includes(String(ids.profile)), "OAuth identity derives from authenticated coach");
    result = await request("/calendar/connection", "closer", ids.owner); assert.equal(result.status, 403, "closer has no Coaching Calendar access");
    result = await request("/zoom/connection", "coach", ids.coach); assert.equal(result.status, 200); assert.equal(result.body.data.email, "dean-zoom@example.com"); assert.equal(JSON.stringify(result.body).includes("zoom-token-must-never-leak"), false);
    result = await request("/zoom/connection", "coach", ids.otherCoach); assert.equal(result.status, 200); assert.equal(result.body.data.connected, false, "another coach cannot read Dean's Zoom connection");
    result = await request("/zoom/connection", "coach", ids.coach, ids.otherWorkspace); assert.equal(result.status, 400, "cross-workspace Zoom identity is rejected");
    result = await request("/zoom/connections", "owner", ids.owner); assert.equal(result.status, 200); assert.equal(result.body.data.length, 2); assert.equal(JSON.stringify(result.body).includes("zoom-token-must-never-leak"), false);
    result = await request("/zoom/oauth/start", "owner", ids.owner); assert.equal(result.status, 403, "admin cannot link Zoom on a coach's behalf");
    result = await request("/zoom/oauth/start", "coach", ids.coach); assert.equal(result.status, 200); assert(result.body.authorizationUrl.includes(String(ids.profile)));
    result = await request("/zoom/connection", "closer", ids.owner); assert.equal(result.status, 403);
    console.log("Google Calendar and Zoom API security tests passed (local mocks only). ");
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
