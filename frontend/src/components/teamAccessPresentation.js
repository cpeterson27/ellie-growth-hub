// Presentation only. These are the existing server capability identifiers.
export const roleLabels = { owner: "Owner / Business Owner", admin: "Admin", coach: "Coach", ambassador: "Ambassador", closer: "Closer / Sales", member: "Member", viewer: "Viewer" };
export const inviteRoles = actorRoles => Object.keys(roleLabels).filter(role => role !== "owner" || actorRoles.includes("owner"));
export const accessGroups = [
  ["CRM", [["crm.view", "View all contacts"], ["crm.view_assigned", "View assigned contacts"], ["crm.manage", "Create / edit all contacts"], ["crm.manage_assigned", "Edit assigned contacts"]]],
  ["Sales", [["sales.applications.view", "View all applications"], ["sales.applications.view_assigned", "View assigned applications"], ["sales.applications.manage", "Manage all applications"], ["sales.applications.manage_assigned", "Manage assigned applications"], ["sales.opportunities.view", "View all opportunities"], ["sales.opportunities.view_assigned", "View assigned opportunities"], ["sales.opportunities.manage", "Manage all opportunities"], ["sales.opportunities.manage_assigned", "Manage assigned opportunities"]]],
  ["Coaching", [["coaching.view", "View workspace coaching"], ["coaching.view_assigned", "View assigned students"], ["coaching.notes.create", "Create notes"], ["coaching.notes.edit_own", "Edit own notes"], ["coaching.handoffs.create", "Create handoffs"], ["coaching.assignments.manage", "Manage assignments"]]],
  ["Communications", [["communications.view", "View all conversations"], ["communications.view_assigned", "View assigned conversations"], ["communications.send_individual", "Send individual messages"], ["communications.bulk_manage", "Manage bulk communications"]]],
  ["Social", [["social.manage", "Manage content, inbox, publishing and social automations"]]],
  ["Campaigns & Outreach", [["campaigns.manage", "Manage campaigns"], ["outreach.manage", "Manage outreach"], ["discovery.manage", "Manage lead discovery"]]],
  ["Ambassadors & Referrals", [["ambassadors.view_own", "View own ambassador profile"], ["ambassadors.view", "View ambassadors"], ["ambassadors.manage", "Manage ambassadors"], ["community.view_ambassador", "Open permitted ambassador community"], ["referrals.view_own", "View own referrals"], ["referrals.manage", "Manage referrals"], ["commissions.view_own", "View own payouts"], ["commissions.manage", "Manage commissions"]]],
  ["Calendar & Zoom", [["calendar.manage_own", "Manage own calendar"], ["calendar.manage_workspace", "Manage workspace calendars"], ["zoom.manage_own", "Manage own Zoom"], ["zoom.manage_workspace", "Manage workspace Zoom"]]],
  ["Analytics", [["analytics.view", "View analytics"]]],
  ["Integrations", [["integrations.manage", "Manage integrations"]]],
  ["Payments", [["payments.view", "View payment activity"], ["payments.manage", "Connect Square, create payment links, and manage refunds"]]],
  ["Automations", [["automations.manage", "Manage workspace automations"]]],
  ["Jarvis", [["jarvis.manage", "Use and manage Jarvis"]]],
  ["Team Management", [["team.view", "View team"], ["team.manage", "Manage non-Owner team access and invitations"]]],
  ["Workspace Settings", [["workspace.manage", "Manage workspace settings"]]],
];
export function overrideValue(overrides, permission) {
  return overrides?.deny?.includes(permission) ? "deny" : overrides?.allow?.includes(permission) ? "allow" : "default";
}
export function setOverride(overrides, permission, value) {
  if (!accessGroups.some(([, items]) => items.some(([id]) => id === permission))) return overrides;
  return { allow: [...(overrides.allow || []).filter(id => id !== permission), ...(value === "allow" ? [permission] : [])], deny: [...(overrides.deny || []).filter(id => id !== permission), ...(value === "deny" ? [permission] : [])] };
}
export function lifecycleLabel(member) {
  if (member.status === "suspended") return "Disabled";
  if (member.status === "invited") {
    if (member.invitation?.status === "expired" || (member.invitation?.expiresAt && new Date(member.invitation.expiresAt) < new Date())) return "Invitation expired";
    return member.invitation?.sentAt ? "Pending signup" : member.invitation?.status === "ready" ? "Invite ready" : "Draft";
  }
  return member.status === "active" ? "Active" : member.status || "Unknown";
}
