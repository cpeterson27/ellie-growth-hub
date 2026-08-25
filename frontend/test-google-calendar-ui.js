import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("./src/pages/CoachingAdmin.jsx", import.meta.url), "utf8");
const coach = fs.readFileSync(new URL("./src/pages/CoachPortal.jsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("./src/services/api.js", import.meta.url), "utf8");

assert.match(app, /path="\/coaching\/sessions"/);
assert.match(app, /path="\/coach\/schedule" element={<CoachSchedule/);
assert.match(admin, /export function CoachingSessions/);
assert.match(admin, /Check availability/);
assert.match(admin, /Calendar not connected/);
assert.match(coach, /Settings \/ Integrations/);
assert.match(coach, /Connect Google Calendar/);
assert.match(coach, /Upcoming sessions/);
assert.match(coach, /Connect Zoom/);
assert.match(coach, /Join Zoom meeting/);
assert.match(admin, /Google Calendar.*Zoom/s);
assert.match(admin, /coach not connected/);
assert.match(api, /\/coaching\/zoom\/oauth\/start/);
assert.match(api, /\/coaching\/zoom\/connections/);
assert.doesNotMatch(coach, /Calendar and Zoom scheduling are planned for Phase 4/);
assert.match(api, /\/coaching\/sessions\/availability/);
assert.match(api, /\/coaching\/calendar\/selection/);

console.log("Google Calendar and Zoom scheduling UI contracts passed.");
