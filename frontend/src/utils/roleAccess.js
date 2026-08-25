export function hasPermission(session, permission) { return Boolean(session?.effectivePermissions?.includes(permission)); }
export function hasAnyPermission(session, permissions) { return permissions.some((item) => hasPermission(session, item)); }
export function hasRole(session, role) { return (session?.roles || [session?.role]).includes(role); }
export function isCoachOnly(session) { return hasRole(session, "coach") && !hasRole(session, "closer") && !hasRole(session, "owner") && !hasRole(session, "admin"); }
export function isAmbassadorOnly(session) { return hasRole(session, "ambassador") && !hasRole(session, "coach") && !hasRole(session, "closer") && !hasRole(session, "owner") && !hasRole(session, "admin") && !hasRole(session, "member") && !hasRole(session, "viewer"); }
export function canManageCoaching(session) { return hasPermission(session, "coaching.view"); }
export function canUseCoachPortal(session) { return hasRole(session, "coach") && hasPermission(session, "coaching.view_assigned"); }
export function canUseSales(session) { return hasAnyPermission(session, ["crm.view", "crm.view_assigned", "sales.opportunities.view", "sales.opportunities.view_assigned"]); }
export function privateHomeForRole(session) { return isCoachOnly(session) ? "/coach" : isAmbassadorOnly(session) ? "/ambassador" : "/command-center"; }
