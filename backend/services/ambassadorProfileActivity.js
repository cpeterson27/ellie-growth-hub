const AmbassadorProfile = require("../models/AmbassadorProfile");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const CrmActivity = require("../models/CrmActivity");
const { completeness } = require("./ambassadorWelcomeService");
async function recordHeadshot({ workspaceId, user }) {
  const profile = await AmbassadorProfile.findOne({ workspaceId, userId: user._id, status: "active" }).lean();
  if (!profile) return;
  const config = await WorkspaceConfig.findOne({ workspaceId, key: "primary" }).select("ambassadorOnboarding").lean();
  const ready = completeness(profile, user, config?.ambassadorOnboarding?.requiredFields);
  await CrmActivity.create({ workspaceId, type: "system", source: "crm", title: user.avatarUrl ? "Ambassador headshot updated" : "Ambassador headshot removed", createdBy: user._id, metadata: { eventType: "ambassador.headshot.updated", ambassadorProfileId: profile._id } });
  if (ready.complete) await CrmActivity.create({ workspaceId, type: "system", source: "crm", title: "Ambassador profile completed", createdBy: user._id, metadata: { eventType: "ambassador.profile.completed", ambassadorProfileId: profile._id } });
}
async function recordProfileUpdate({ workspaceId, userId, previous, user }) {
  const profile = await AmbassadorProfile.findOne({ workspaceId, userId, status: "active" }).lean();
  if (!profile) return;
  const config = await WorkspaceConfig.findOne({ workspaceId, key: "primary" }).select("ambassadorOnboarding").lean();
  const required = config?.ambassadorOnboarding?.requiredFields;
  const before = completeness(profile, { ...previous, profileUpdatedAt: true }, required);
  const after = completeness(profile, { ...user, profileUpdatedAt: true }, required);
  const completed = !before.complete && after.complete;
  await CrmActivity.create({ workspaceId, type: "system", source: "crm", createdBy: userId, title: completed ? "Ambassador profile completed" : "Ambassador profile updated", metadata: { eventType: completed ? "ambassador.profile.completed" : "ambassador.profile.updated", ambassadorProfileId: profile._id } });
}
module.exports = { recordHeadshot, recordProfileUpdate };
