import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const dirname = path.dirname(fileURLToPath(import.meta.url)); const source = (file) => fs.readFileSync(path.join(dirname, "src", file), "utf8");
const role = source("utils/roleAccess.js"), app = source("App.jsx"), sidebar = source("components/Sidebar.jsx"), team = source("components/TeamAccess.jsx");
assert(role.includes("effectivePermissions")); assert(role.includes("!hasRole(session, \"closer\")"));
assert(app.includes("isCoachOnly(session)")); assert(app.includes("mayUseCoachPortal")); assert(app.includes('path="/opportunities"')); assert(app.includes('path="/coach/students"'));
assert(sidebar.includes("hasAnyPermission(session")); assert(sidebar.includes("sales.opportunities.view_assigned")); assert(sidebar.includes("canUseCoachPortal(session)"));
for (const value of ["Team & Access", "Effective access", "permissionOverrides", "applicationProgramIds", "coachProfile", "assigned opportunities/applications"]) assert(team.includes(value), `TeamAccess missing ${value}`);
console.log("Multi-role capability navigation and Team & Access UI contracts passed.");
