const InAppNotification = require("../models/InAppNotification");
const WorkspaceMembership = require("../models/WorkspaceMembership");

const deps = { InAppNotification, WorkspaceMembership };

async function recipients({ workspaceId, assignedUserId, configuredUserIds = [] }, models = deps) {
  let ids = [...new Set([assignedUserId, ...configuredUserIds].filter(Boolean).map(String))];
  if (!ids.length) {
    const fallback = await models.WorkspaceMembership.find({ workspaceId, status: "active", $or: [{ role: { $in: ["owner", "admin"] } }, { roles: { $in: ["owner", "admin"] } }] }).select("userId").lean();
    ids = fallback.map((row) => String(row.userId));
  }
  const active = await models.WorkspaceMembership.find({ workspaceId, userId: { $in: ids }, status: "active" }).select("userId").lean();
  return [...new Set(active.map((row) => String(row.userId)))];
}

async function notify({ workspaceId, application, contact, program, config, attribution = {} }, models = deps) {
  const userIds = await recipients({ workspaceId, assignedUserId: application.assignedUserId, configuredUserIds: config?.publicApplication?.notificationRecipientUserIds || [] }, models);
  const source = [attribution.provider, attribution.utm?.source].filter(Boolean).join(" / ") || "Public website";
  const eventKey = `coaching-application:${application._id}`;
  for (const userId of userIds) await models.InAppNotification.findOneAndUpdate(
    { workspaceId, userId, eventKey },
    { $setOnInsert: { type: "coaching_application", title: `New ${program.name} application`, message: `${contact.name} applied via ${source}.`, actionUrl: `/crm/contacts/${contact._id}?application=${application._id}` } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { recipientUserIds: userIds };
}

module.exports = { notify, recipients };
