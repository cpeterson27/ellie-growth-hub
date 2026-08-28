const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CAPABILITIES, ROLE_DEFAULTS, effectivePermissions, roleDefaultsForWorkspace } = require("./authorization/capabilities");
const { createAuthContext, requirePlatformOwner } = require("./middleware/auth");
const { connectionSummary } = require("./routes/platform");

const custom = { rolePermissionTemplates: new Map([["member", ["crm.view", "social.manage"]], ["coach", ["coaching.view_assigned"]]]) };
assert.deepEqual(roleDefaultsForWorkspace(custom).member, ["crm.view", "social.manage"]);
assert.deepEqual(effectivePermissions({ role: "member", roles: ["member"] }, custom), ["crm.view", "social.manage"]);
assert.deepEqual(roleDefaultsForWorkspace({}).admin, ROLE_DEFAULTS.admin);
assert.deepEqual(roleDefaultsForWorkspace({ rolePermissionTemplates: { owner: [] } }).owner, CAPABILITIES, "Owner template stays protected");

process.env.PLATFORM_OWNER_EMAILS = "platform@example.test";
const auth = createAuthContext({ user: { _id: "u1", email: "platform@example.test" }, workspace: { _id: "w1", rolePermissionTemplates: custom.rolePermissionTemplates }, membership: { role: "owner", roles: ["owner"] }, session: {} });
assert.equal(auth.isPlatformOwner, true);
let allowed = false; requirePlatformOwner({ auth }, { status() { throw new Error("must allow"); } }, () => { allowed = true; }); assert.equal(allowed, true);
let deniedStatus; requirePlatformOwner({ auth: { isPlatformOwner: false } }, { status(code) { deniedStatus = code; return this; }, json() { return this; } }, () => {}); assert.equal(deniedStatus, 403);

const meta = [{ provider: "meta", status: "connected", authorization: { valid: true }, selectedAssetIds: ["page", "ig"], assets: [{ id: "page", type: "facebook_page", name: "Ellie Coaching" }, { id: "ig", type: "instagram_business", username: "elliescoaching" }], connectedAt: "2026-01-01", lastVerifiedAt: "2026-01-02" }];
assert.deepEqual(connectionSummary("facebook", meta).accountName, "Ellie Coaching");
assert.deepEqual(connectionSummary("instagram", meta).accountName, "elliescoaching");
assert.equal(connectionSummary("linkedin", meta).status, "not_connected");
assert.equal(connectionSummary("facebook", [{ ...meta[0], authorization: { valid: false } }]).status, "needs_attention");

const teamSource = fs.readFileSync(require.resolve("../frontend/src/components/TeamAccess.jsx"), "utf8");
assert(teamSource.includes("+ Add person")); assert(teamSource.includes("Roles &amp; Permissions")); assert(teamSource.includes("saveWorkspaceRolePermissions"));
const platformSource = fs.readFileSync(require.resolve("./routes/platform"), "utf8");
assert(!platformSource.includes("credentialsEncrypted")); assert(platformSource.includes("requirePlatformOwner"));
console.log("Workspace role templates, owner protection, platform-owner isolation, compact Team tabs and Meta connection summaries passed.");
