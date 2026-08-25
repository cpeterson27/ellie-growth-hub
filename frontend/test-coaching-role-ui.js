import assert from "node:assert/strict";
import { canManageCoaching, isCoachOnly, privateHomeForRole } from "./src/utils/roleAccess.js";

const session = (roles, effectivePermissions) => ({ roles, role: roles[0], effectivePermissions });
assert.equal(canManageCoaching(session(["owner"], ["coaching.view"])), true);
assert.equal(canManageCoaching(session(["admin"], ["coaching.view"])), true);
assert.equal(canManageCoaching(session(["coach"], ["coaching.view_assigned"])), false);
assert.equal(canManageCoaching(session(["closer"], ["sales.opportunities.view_assigned"])), false);
assert.equal(canManageCoaching(undefined), false);
assert.equal(isCoachOnly(session(["coach"], ["coaching.view_assigned"])), true);
assert.equal(isCoachOnly(session(["coach", "closer"], ["coaching.view_assigned", "sales.opportunities.view_assigned"])), false);
assert.equal(privateHomeForRole(session(["coach"], ["coaching.view_assigned"])), "/coach");
assert.equal(privateHomeForRole(session(["closer"], ["sales.opportunities.view_assigned"])), "/command-center");

console.log("Coaching role UI policy tests passed");
