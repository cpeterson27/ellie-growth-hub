const agentRegistry = require("./agentRegistry");

function prepareProposal({ agent, recommendation, tool, payloadPreview = {} }, dependencies = {}) {
  const definition = (dependencies.agentRegistry || agentRegistry).getAgent(agent);
  if (!definition?.proposeActions) { const error = new Error("This agent cannot propose business actions"); error.code = "AGENT_PROPOSAL_FORBIDDEN"; throw error; }
  return {
    agent,
    recommendation: String(recommendation || "").trim().slice(0, 5000),
    proposedAction: {
      tool: String(tool || "").trim().slice(0, 160),
      payloadPreview,
      classification: "PROPOSE",
      requiresApproval: true,
      executable: false,
    },
  };
}

module.exports = { prepareProposal };
