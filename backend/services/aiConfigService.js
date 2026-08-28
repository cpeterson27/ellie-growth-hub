const WorkspaceConfig = require("../models/WorkspaceConfig");
const aiUsageService = require("./aiUsageService");

const AGENTS = ["jarvis", "lead", "social", "sales", "content", "coaching", "research", "system"];
const defaults = () => ({ enabled: true, monthlyLimitUsd: null, warningThresholdPercent: 80, agentEnabled: Object.fromEntries(AGENTS.map((agent) => [agent, true])) });

async function get(workspaceId, Model = WorkspaceConfig) {
  if (!workspaceId) return defaults();
  const row = await Model.findOne({ workspaceId, key: "primary" }).select("ai").lean();
  return { ...defaults(), ...(row?.ai || {}), agentEnabled: { ...defaults().agentEnabled, ...(row?.ai?.agentEnabled || {}) } };
}

async function save(workspaceId, input = {}, Model = WorkspaceConfig) {
  const current = await get(workspaceId, Model);
  const monthlyLimitUsd = input.monthlyLimitUsd === undefined
    ? current.monthlyLimitUsd
    : input.monthlyLimitUsd === null || input.monthlyLimitUsd === ""
      ? null
      : Math.max(0, Number(input.monthlyLimitUsd));
  const value = {
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
    monthlyLimitUsd: Number.isFinite(monthlyLimitUsd) ? monthlyLimitUsd : null,
    warningThresholdPercent: Math.min(100, Math.max(1, Number(input.warningThresholdPercent) || current.warningThresholdPercent)),
    agentEnabled: Object.fromEntries(AGENTS.map((agent) => [agent, input.agentEnabled?.[agent] === undefined ? current.agentEnabled[agent] : Boolean(input.agentEnabled[agent])])),
  };
  const row = await Model.findOneAndUpdate({ workspaceId, key: "primary" }, { $set: { ai: value }, $setOnInsert: { key: "primary" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return row.ai?.toObject ? row.ai.toObject() : row.ai;
}

async function assertEnabled({ workspaceId, agent }, dependencies = {}) {
  const config = await get(workspaceId, dependencies.WorkspaceConfig || WorkspaceConfig);
  if (!config.enabled || config.agentEnabled?.[agent] === false) throw Object.assign(new Error("AI is disabled for this workspace or agent"), { code: "AI_DISABLED" });
  if (config.monthlyLimitUsd != null) {
    const usage = await (dependencies.summary || aiUsageService.summary)(workspaceId);
    if (usage.estimatedTotalCostUsd >= config.monthlyLimitUsd) throw Object.assign(new Error("The configured workspace AI monthly limit has been reached"), { code: "AI_MONTHLY_LIMIT_REACHED" });
  }
  return config;
}

module.exports = { AGENTS, assertEnabled, defaults, get, save };
