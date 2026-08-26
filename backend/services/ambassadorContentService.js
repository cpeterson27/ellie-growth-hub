const AmbassadorContentTask = require("../models/AmbassadorContentTask");
const AmbassadorProfile = require("../models/AmbassadorProfile");
const ContentBrief = require("../models/ContentBrief");
const CrmActivity = require("../models/CrmActivity");
const { referralUrl } = require("./ambassadorService");
const deps = { AmbassadorContentTask, AmbassadorProfile, ContentBrief, CrmActivity };
const clean = (value, max) => String(value || "").trim().slice(0, max);
async function assign({ workspaceId, userId, contentId, input }, models = deps) {
  const content = await models.ContentBrief.findOne({ workspaceId, _id: contentId, type: "social" }).lean();
  if (!content || !["approved", "scheduled", "published", "partially_published"].includes(content.status)) throw new Error("Choose reviewed and approved social content before distribution");
  const ids = Array.isArray(input.ambassadorIds) ? [...new Set(input.ambassadorIds.map(String))] : [];
  if (!input.allActive && !ids.length) throw new Error("Choose ambassadors");
  const profiles = await models.AmbassadorProfile.find({ workspaceId, status: "active", ...(input.allActive === true ? {} : { _id: { $in: ids } }) }).lean();
  if (!input.allActive && profiles.length !== ids.length) throw new Error("Every ambassador must be active in this workspace");
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Choose a valid due date");
  const tasks = [];
  for (const profile of profiles) {
    const filter = { workspaceId, contentBriefId: content._id, ambassadorProfileId: profile._id };
    const existing = await models.AmbassadorContentTask.findOne(filter);
    if (existing) { tasks.push(existing); continue; }
    const task = await models.AmbassadorContentTask.findOneAndUpdate(filter, { $setOnInsert: {
      ...filter, assignedBy: userId, title: content.title, caption: clean(input.caption || content.body, 10000),
      instructions: clean(input.instructions, 5000), disclosure: clean(input.disclosure, 1000),
      media: content.social.media || [], platforms: (input.platforms || []).filter(p => ["instagram", "facebook", "linkedin", "x", "tiktok"].includes(p)),
      hashtags: (input.hashtags || []).map(tag => clean(tag, 100)).slice(0, 30), dueAt,
      referralUrl: input.includeReferral === true ? referralUrl(profile.referralSlug || profile.referralCode) : "",
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    tasks.push(task);
    await models.CrmActivity.create({ workspaceId, type: "system", source: "crm", title: "Ambassador content task assigned", createdBy: userId, metadata: { eventType: "ambassador.content.assigned", ambassadorProfileId: profile._id, contentBriefId: content._id, taskId: task._id } });
  }
  return tasks;
}
async function ownTasks({ workspaceId, userId }, models = deps) {
  const profile = await models.AmbassadorProfile.findOne({ workspaceId, userId, status: "active" }).lean();
  if (!profile) throw new Error("Active ambassador profile required");
  return models.AmbassadorContentTask.find({ workspaceId, ambassadorProfileId: profile._id }).sort({ createdAt: -1 }).limit(200).lean();
}
async function transition({ workspaceId, userId, taskId, status, postUrl }, models = deps) {
  const profile = await models.AmbassadorProfile.findOne({ workspaceId, userId, status: "active" }).lean();
  if (!profile) throw new Error("Active ambassador profile required");
  const task = await models.AmbassadorContentTask.findOne({ _id: taskId, workspaceId, ambassadorProfileId: profile._id });
  if (!task) throw new Error("Content task not found");
  const transitions = { assigned: ["viewed", "in_progress", "completed", "declined"], viewed: ["in_progress", "completed", "declined"], in_progress: ["completed", "declined"], completed: [], declined: [] };
  if (!transitions[task.status]?.includes(status)) throw new Error("Unsupported task transition");
  if (postUrl && !/^https:\/\//i.test(postUrl)) throw new Error("Post URL must use HTTPS");
  task.status = status; task.postUrl = clean(postUrl || task.postUrl, 2000); if (status === "completed") task.completedAt = new Date();
  await task.save();
  await models.CrmActivity.create({ workspaceId, type: "system", source: "crm", title: `Ambassador content task ${status}`, createdBy: userId, metadata: { eventType: `ambassador.content.${status}`, ambassadorProfileId: profile._id, contentBriefId: task.contentBriefId, taskId: task._id, postUrl: task.postUrl } });
  return task;
}
module.exports = { assign, ownTasks, transition };
