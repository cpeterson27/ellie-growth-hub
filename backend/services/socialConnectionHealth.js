function usable(connection, now = Date.now()) {
  if (!connection || connection.status !== "connected" || connection.authorization?.valid === false) return false;
  return [connection.expiresAt, connection.authorization?.dataAccessExpiresAt].every(value => !value || (Number.isFinite(new Date(value).getTime()) && new Date(value).getTime() > now));
}
function expiresSoon(connection, now = Date.now()) {
  return [connection?.expiresAt, connection?.authorization?.dataAccessExpiresAt].some(value => value && new Date(value).getTime() <= now + 7 * 86400000);
}
async function notifyOwners(connection, models = {}) {
  if (!connection || connection.status === "disconnected" || (usable(connection) && !expiresSoon(connection))) return;
  const Membership = models.Membership || require("../models/WorkspaceMembership");
  const Notification = models.Notification || require("../models/InAppNotification");
  const owners = await Membership.find({ workspaceId: connection.workspaceId, status: "active", $or: [{ role: "owner" }, { roles: "owner" }] }).select("userId").lean();
  const state = usable(connection) ? "expiring" : "reconnect";
  const deadline = connection.expiresAt || connection.authorization?.dataAccessExpiresAt || "unknown";
  for (const owner of owners) {
    await Notification.findOneAndUpdate({ workspaceId: connection.workspaceId, userId: owner.userId, type: "social_authorization", actionUrl: `/social/accounts?authorization=${connection.provider}&state=${state}&deadline=${encodeURIComponent(String(deadline))}` }, { $setOnInsert: {
      title: state === "expiring" ? "Social account authorization expires soon" : "Reconnect your social account",
      message: `${connection.provider === "meta" ? "Facebook" : connection.provider} authorization ${state === "expiring" ? "expires within seven days" : "needs attention"}. Open Social → Connected Accounts. Sending is blocked when authorization is invalid or expired.`,
    } }, { upsert: true, new: true });
  }
}
module.exports = { usable, expiresSoon, notifyOwners };
