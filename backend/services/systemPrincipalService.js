const PRINCIPALS = Object.freeze({
  social_automation: Object.freeze(["social.manage", "social.automation.evaluate", "social.ai.analyze"]),
});

function create({ workspaceId, principal }) {
  if (!workspaceId || !PRINCIPALS[principal]) throw Object.assign(new Error("Unknown or unbound system principal"), { code: "SYSTEM_PRINCIPAL_INVALID" });
  return Object.freeze({ actorType: "system", workspaceId: String(workspaceId), principal, userId: null, effectivePermissions: Object.freeze([...PRINCIPALS[principal]]) });
}
function assertWorkspace(actor, workspaceId) {
  if (!actor || actor.actorType !== "system" || String(actor.workspaceId) !== String(workspaceId) || !PRINCIPALS[actor.principal]) throw Object.assign(new Error("System principal workspace mismatch"), { code: "SYSTEM_PRINCIPAL_WORKSPACE_FORBIDDEN" });
  const allowed = PRINCIPALS[actor.principal];
  if ((actor.effectivePermissions || []).some(capability => !allowed.includes(capability))) throw Object.assign(new Error("System principal capability escalation rejected"), { code: "SYSTEM_PRINCIPAL_ESCALATION" });
  return actor;
}
function has(actor, capability) { return Boolean(assertWorkspace(actor, actor.workspaceId) && actor.effectivePermissions.includes(capability)); }
module.exports = { PRINCIPALS, assertWorkspace, create, has };
