const assert = require("node:assert/strict");
const fs = require("node:fs");
const { effectivePermissions, normalizeRoles, validateMembershipChange } = require("./authorization/capabilities");
const { salesOpportunityFilter, canAccessRecord } = require("./authorization/accessPolicy");
const { migrate } = require("./scripts/migrate-membership-roles");
const { restrictNewRoleSurface } = require("./middleware/authorization");

assert.deepEqual(normalizeRoles({ role: "coach" }), ["coach"]);
assert.deepEqual(normalizeRoles({ role: "closer" }), ["closer"]);
const combined = effectivePermissions({ role: "coach", roles: ["coach", "closer"] });
assert(combined.includes("coaching.view_assigned"));
assert(combined.includes("sales.opportunities.view_assigned"));
assert(combined.includes("calendar.manage_own"));
assert(combined.includes("communications.send_individual"));
assert(effectivePermissions({ role: "coach", roles: ["coach"], permissionOverrides: { allow: ["analytics.view"] } }).includes("analytics.view"));
assert(!effectivePermissions({ role: "admin", roles: ["admin"], permissionOverrides: { deny: ["automations.manage"] } }).includes("automations.manage"));
const owner = effectivePermissions({ role: "owner", roles: ["owner"], permissionOverrides: { deny: ["team.manage", "workspace.manage"] } });
assert(owner.includes("team.manage")); assert(owner.includes("workspace.manage"));
assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["owner"], requestedStatus: "suspended", self: true, actorRoles: ["owner"] }), (error) => error.code === "OWNER_LOCKOUT_BLOCKED");
assert.throws(() => validateMembershipChange({ currentRoles: ["owner"], requestedRoles: ["admin"], requestedStatus: "active", actorRoles: ["owner"] }), (error) => error.code === "OWNER_LOCKOUT_BLOCKED");

const auth = { user: { _id: "64b000000000000000000001" }, workspaceId: "64b000000000000000000002", role: "coach", roles: ["coach", "closer"], effectivePermissions: combined };
assert.equal(String(salesOpportunityFilter({ auth }, {}).ownerId), auth.user._id);
assert(canAccessRecord({ auth }, { _id: "64b000000000000000000003", workspaceId: auth.workspaceId }, { authorizedRecordIds: ["64b000000000000000000003"] }));
assert(!canAccessRecord({ auth }, { _id: "64b000000000000000000000003", workspaceId: "64b000000000000000000000099" }, { authorizedRecordIds: ["64b000000000000000000000003"] }));
function surface(path) { const result = { status: null, next: false }; restrictNewRoleSurface({ auth, path }, { status(code) { result.status = code; return this; }, json() { return this; } }, () => { result.next = true; }); return result; }
assert.equal(surface("/coaching/students").next, true); assert.equal(surface("/opportunities").next, true); assert.equal(surface("/contacts").status, 403); assert.equal(surface("/automations").status, 403);

async function migrationChecks() {
  const rows = [{ role: "coach", roles: [], save: async function save() { this.saved = true; } }, { role: "closer", roles: ["closer"], save: async function save() { this.saved = true; } }];
  const Model = { find: async () => rows };
  const audit = await migrate({ apply: false, Model }); assert.deepEqual(audit, { scanned: 2, changed: 1, unchanged: 1, applied: 0 }); assert.equal(rows[0].saved, undefined);
  const applied = await migrate({ apply: true, Model }); assert.equal(applied.applied, 1); assert.deepEqual(rows[0].roles, ["coach"]);
}

const workspaceRoute = fs.readFileSync(require.resolve("./routes/workspace"), "utf8");
assert(workspaceRoute.includes("validateMembershipChange")); assert(workspaceRoute.includes("CoachProfile.findOneAndUpdate")); assert(workspaceRoute.includes("applicationProgramIds"));
const automationRoute = fs.readFileSync(require.resolve("./routes/automations"), "utf8"); assert(automationRoute.includes('requireCapability("automations.manage")'));
const socialRoute = fs.readFileSync(require.resolve("./routes/socialAutomation"), "utf8"); assert(socialRoute.includes('requireCapability("social.manage")'));

migrationChecks().then(() => console.log("Multi-role migration, capability union/overrides, owner protection, record scoping, domain sync and admin boundaries passed.")).catch((error) => { console.error(error); process.exitCode = 1; });
