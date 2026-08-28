const agentRegistry = require("./agentRegistry");
const defaultRegistry = require("./agentToolRegistry");

function hasRequiredCapabilities(auth, required = [], mode = "all") {
  const granted = new Set(auth?.effectivePermissions || []);
  if (!required.length) return true;
  return mode === "any" ? required.some((item) => granted.has(item)) : required.every((item) => granted.has(item));
}

async function executeTool({ workspaceId, userId, agent, toolId, input = {}, auth }, dependencies = {}) {
  const agents = dependencies.agentRegistry || agentRegistry;
  const tools = dependencies.toolRegistry || defaultRegistry;
  const definition = agents.getAgent(agent);
  if (!definition) { const error = new Error("Unknown AI agent"); error.code = "AGENT_UNKNOWN"; throw error; }
  if (!auth || String(auth.workspaceId) !== String(workspaceId)) { const error = new Error("Agent workspace context does not match the caller"); error.code = "AGENT_WORKSPACE_FORBIDDEN"; throw error; }
  const tool = tools.getTool(toolId);
  if (!tool || !definition.allowedTools.includes(toolId) || !tool.allowedAgents.includes(agent)) { const error = new Error("This tool is not allowed for the selected agent"); error.code = "AGENT_TOOL_FORBIDDEN"; throw error; }
  if (!hasRequiredCapabilities(auth, tool.requiredCapabilities, tool.capabilityMode)) { const error = new Error("The caller lacks the capability required by this tool"); error.code = "AGENT_TOOL_CAPABILITY_FORBIDDEN"; throw error; }
  if (tool.classification === "MUTATE") { const error = new Error("Generic agent mutation execution is disabled"); error.code = "AGENT_MUTATION_DISABLED"; throw error; }
  if (!["READ", "PROPOSE"].includes(tool.classification) || typeof tool.handler !== "function") { const error = new Error("The tool is unavailable"); error.code = "AGENT_TOOL_UNAVAILABLE"; throw error; }
  const result = await tool.handler({ workspaceId, userId, agent, auth, input, models: dependencies.models || defaultRegistry.models, services: dependencies.services || defaultRegistry.services });
  return { tool: tool.id, classification: tool.classification, result };
}

module.exports = { executeTool, hasRequiredCapabilities };
