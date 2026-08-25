import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("./src/services/api.js");
const history = read("./src/components/CoachingHistory.jsx");
const admin = read("./src/pages/CoachingAdmin.jsx");
const coach = read("./src/pages/CoachPortal.jsx");

for (const endpoint of ["/notes", "/handoffs", "/handoff"]) assert(api.includes(endpoint), `API client must include ${endpoint}`);
for (const field of ["summary", "progress", "observations", "actionItems"]) assert(history.includes(field), `handoff UI must preserve ${field}`);
assert(history.includes("These notes are never student-facing"));
assert(history.includes("An administrator controls the actual assignment transition"));
assert(admin.includes("<CoachingHistory student={student}"), "admin student detail must render coaching history");
assert(coach.includes("<CoachingHistory student={student} coachMode"), "Coach Portal student detail must render restricted coaching history");
assert(admin.includes("saveAssignmentHandoff") && admin.includes("transitionCoachAssignment"), "admin transition must submit handoff before transition");

console.log("Coaching notes and handoff UI contract checks passed");
