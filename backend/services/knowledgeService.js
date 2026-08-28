const jarvisMemoryService = require("./jarvisMemoryService");

const ALLOWED_AGENTS = new Set(["jarvis", "lead", "social", "sales", "content", "coaching"]);

async function retrieveKnowledge({ workspaceId, query, agent = "jarvis", categories, limit = 4 }, dependencies = {}) {
  if (!workspaceId) { const error = new Error("Workspace context is required for knowledge retrieval"); error.code = "WORKSPACE_REQUIRED"; throw error; }
  const memory = dependencies.jarvisMemoryService || jarvisMemoryService;
  const result = await memory.retrieveRelevantNotes(query, { workspaceId, categories, limit });
  return {
    ...result,
    agent: ALLOWED_AGENTS.has(agent) ? agent : "jarvis",
    authority: "approved_business_knowledge",
    operationalTruthPolicy: "Growth Operator database records remain authoritative when operational facts conflict with business knowledge. Missing knowledge must not be invented.",
  };
}

module.exports = { ALLOWED_AGENTS, retrieveKnowledge };
