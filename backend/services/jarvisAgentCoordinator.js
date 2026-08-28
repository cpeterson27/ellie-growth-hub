const agentExecutionService = require("./agentExecutionService");

function selectSpecializedAgent(task = "") {
  const text = String(task).toLowerCase();
  if (/\b(lead|prospect|qualification|ideal customer|icp|research prospect)\b/.test(text)) return "lead";
  if (/\b(social inbox|instagram|facebook|comment|direct message|dm)\b/.test(text)) return "social";
  if (/\b(sales|pipeline|closer|opportunity|objection|follow[- ]?up)\b/.test(text)) return "sales";
  if (/\b(content|caption|post draft|campaign creative|editorial)\b/.test(text)) return "content";
  if (/\b(coaching|student|enrollment|coach assignment|session)\b/.test(text)) return "coaching";
  return null;
}

async function runSpecialized(request, dependencies = {}) {
  const agent = request.agent || selectSpecializedAgent(request.task);
  if (!agent) { const error = new Error("No specialized agent matches this request"); error.code = "SPECIALIZED_AGENT_NOT_SELECTED"; throw error; }
  return (dependencies.agentExecutionService || agentExecutionService).runAgent({ ...request, agent }, dependencies);
}

module.exports = { runSpecialized, selectSpecializedAgent };
