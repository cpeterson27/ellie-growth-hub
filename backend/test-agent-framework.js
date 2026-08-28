const assert = require("assert");
const fs = require("fs");
const agentRegistry = require("./services/agentRegistry");
const toolRegistry = require("./services/agentToolRegistry");
const toolExecutor = require("./services/agentToolExecutor");
const executionService = require("./services/agentExecutionService");
const proposalService = require("./services/agentProposalService");
const coordinator = require("./services/jarvisAgentCoordinator");
const { PROMPT_VERSION } = require("./services/agentPromptRegistry");

const workspaceA = "6a69491ceb8b0a51048bd0cd";
const workspaceB = "6a69491ceb8b0a51048bd0ce";
const fullAuth = { workspaceId: workspaceA, effectivePermissions: ["jarvis.manage", "discovery.manage", "crm.view", "social.manage", "sales.opportunities.view", "campaigns.manage", "analytics.view", "coaching.view", "workspace.manage"] };

async function run() {
  for (const id of ["jarvis", "lead", "social", "sales", "content", "coaching", "research", "system"]) assert(agentRegistry.getAgent(id), `${id} must be registered`);
  assert.equal(agentRegistry.getAgent("social").actionsRequireApproval, true);
  assert(agentRegistry.getAgent("lead").knowledgeCategories.includes("contacts-icp"));
  assert(toolRegistry.listTools().every((tool) => tool.classification === "READ"));
  assert(toolRegistry.listTools().every((tool) => !Object.prototype.hasOwnProperty.call(tool, "handler")));

  let llmRequest, knowledgeRequest, configChecks = [];
  const dependencies = {
    aiConfigService: { async assertEnabled(value) { configChecks.push(value); } },
    knowledgeService: { async retrieveKnowledge(value) { knowledgeRequest = value; return { available: true, sources: ["03 Contacts & ICP/approved.md"], context: "Approved ICP knowledge" }; } },
    conversationService: { async history() { return { messages: [{ role: "user", content: "Earlier bounded conversation" }] }; } },
    toolExecutor: { async executeTool(value) { return { tool: value.toolId, classification: "READ", result: [{ id: "verified-record" }] }; } },
    llmService: {
      async generateText(value) { llmRequest = value; return "Evidence-based recommendation"; },
      async generateStructured(value) { llmRequest = value; return { qualified: true }; },
      getStatus() { return { model: "mock-model" }; },
    },
  };
  const result = await executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "lead", task: "qualify prospect", input: { evidence: "public evidence" }, operationalContext: "Contact exists in CRM", conversationId: "conversation-a", correlationId: "corr-a", auth: fullAuth, options: { tools: [{ toolId: "crm.get_contact", input: { contactId: "contact-a" } }] } }, dependencies);
  assert.equal(result.output, "Evidence-based recommendation");
  assert.equal(llmRequest.agent, "lead");
  assert.equal(llmRequest.feature, "agent.qualify_prospect");
  assert.equal(llmRequest.workspaceId, workspaceA);
  assert.equal(llmRequest.correlationId, "corr-a");
  assert.equal(knowledgeRequest.workspaceId, workspaceA);
  assert.deepEqual(knowledgeRequest.categories, agentRegistry.getAgent("lead").knowledgeCategories);
  assert.equal(result.metadata.promptVersion, PROMPT_VERSION);
  assert.equal(result.metadata.usageRecorded, true);
  assert(result.metadata.toolsUsed.includes("crm.get_contact"));
  const combinedPrompt = llmRequest.messages.map((item) => item.content).join("\n");
  assert(combinedPrompt.includes("AUTHORITATIVE OPERATIONAL DATA"));
  assert(combinedPrompt.includes("APPROVED BUSINESS KNOWLEDGE"));
  assert(combinedPrompt.includes("CONVERSATION CONTEXT"));
  assert(combinedPrompt.includes("Contact exists in CRM"));
  assert(combinedPrompt.includes("Approved ICP knowledge"));
  assert(!JSON.stringify(result).includes("Prompt version:"));

  const structured = await executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "lead", task: "structured qualification", auth: fullAuth, options: { responseSchema: { type: "object", properties: { qualified: { type: "boolean" } }, required: ["qualified"], additionalProperties: false } } }, dependencies);
  assert.deepEqual(structured.output, { qualified: true });
  assert.equal(llmRequest.agent, "lead");

  await assert.rejects(() => executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "unknown", task: "x", auth: fullAuth }, dependencies), (error) => error.code === "AGENT_UNKNOWN");
  await assert.rejects(() => executionService.runAgent({ workspaceId: workspaceB, userId: "user-a", agent: "lead", task: "x", auth: fullAuth }, dependencies), (error) => error.code === "AGENT_WORKSPACE_FORBIDDEN");
  await assert.rejects(() => executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "lead", task: "x", auth: { workspaceId: workspaceA, effectivePermissions: [] } }, dependencies), (error) => error.code === "AGENT_CAPABILITY_FORBIDDEN");

  const selectiveDependencies = { ...dependencies, aiConfigService: { async assertEnabled({ agent }) { if (agent === "social") { const error = new Error("disabled"); error.code = "AI_DISABLED"; throw error; } } } };
  await assert.rejects(() => executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "social", task: "inbox", auth: fullAuth }, selectiveDependencies), (error) => error.code === "AI_DISABLED");
  const stillEnabled = await executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "lead", task: "lead", auth: fullAuth }, selectiveDependencies);
  assert.equal(stillEnabled.output, "Evidence-based recommendation");
  const workspaceDisabled = { ...dependencies, aiConfigService: { async assertEnabled() { const error = new Error("workspace disabled"); error.code = "AI_DISABLED"; throw error; } } };
  await assert.rejects(() => executionService.runAgent({ workspaceId: workspaceA, userId: "user-a", agent: "lead", task: "lead", auth: fullAuth }, workspaceDisabled), (error) => error.code === "AI_DISABLED");

  await assert.rejects(() => toolExecutor.executeTool({ workspaceId: workspaceA, userId: "user-a", agent: "lead", toolId: "social.connection_capabilities", auth: fullAuth }), (error) => error.code === "AGENT_TOOL_FORBIDDEN");
  await assert.rejects(() => toolExecutor.executeTool({ workspaceId: workspaceA, userId: "user-a", agent: "lead", toolId: "crm.get_contact", auth: { workspaceId: workspaceA, effectivePermissions: ["discovery.manage"] } }), (error) => error.code === "AGENT_TOOL_CAPABILITY_FORBIDDEN");
  await assert.rejects(() => toolExecutor.executeTool({ workspaceId: workspaceB, userId: "user-a", agent: "lead", toolId: "knowledge.retrieve", auth: fullAuth }), (error) => error.code === "AGENT_WORKSPACE_FORBIDDEN");

  let proposedMutationCount = 0;
  const customAgents = { getAgent: () => ({ id: "lead", allowedTools: ["read.tool", "propose.tool", "mutate.tool"] }) };
  const customTools = { getTool(id) { return {
    "read.tool": { id, classification: "READ", requiredCapabilities: [], allowedAgents: ["lead"], handler: async () => "read" },
    "propose.tool": { id, classification: "PROPOSE", requiredCapabilities: [], allowedAgents: ["lead"], handler: async () => ({ preview: true }) },
    "mutate.tool": { id, classification: "MUTATE", requiredCapabilities: [], allowedAgents: ["lead"], handler: async () => { proposedMutationCount += 1; } },
  }[id] || null; } };
  assert.equal((await toolExecutor.executeTool({ workspaceId: workspaceA, userId: "user-a", agent: "lead", toolId: "read.tool", auth: fullAuth }, { agentRegistry: customAgents, toolRegistry: customTools })).classification, "READ");
  assert.equal((await toolExecutor.executeTool({ workspaceId: workspaceA, userId: "user-a", agent: "lead", toolId: "propose.tool", auth: fullAuth }, { agentRegistry: customAgents, toolRegistry: customTools })).classification, "PROPOSE");
  await assert.rejects(() => toolExecutor.executeTool({ workspaceId: workspaceA, userId: "user-a", agent: "lead", toolId: "mutate.tool", auth: fullAuth }, { agentRegistry: customAgents, toolRegistry: customTools }), (error) => error.code === "AGENT_MUTATION_DISABLED");
  assert.equal(proposedMutationCount, 0);

  const proposal = proposalService.prepareProposal({ agent: "sales", recommendation: "Review this next step", tool: "communications.send", payloadPreview: { contactId: "contact-a" } });
  assert.equal(proposal.proposedAction.requiresApproval, true);
  assert.equal(proposal.proposedAction.executable, false);
  assert.equal(proposedMutationCount, 0);

  assert.equal(coordinator.selectSpecializedAgent("qualify this prospect"), "lead");
  assert.equal(coordinator.selectSpecializedAgent("review the social inbox comment"), "social");
  assert.equal(coordinator.selectSpecializedAgent("what is next in the sales pipeline"), "sales");
  assert.equal(coordinator.selectSpecializedAgent("draft content for next week"), "content");
  assert.equal(coordinator.selectSpecializedAgent("review this coaching enrollment"), "coaching");
  assert.equal(coordinator.selectSpecializedAgent("tell me today's weather"), null);
  let delegatedRequest;
  await coordinator.runSpecialized({ workspaceId: workspaceA, task: "qualify this prospect" }, { agentExecutionService: { async runAgent(request) { delegatedRequest = request; return { output: "delegated" }; } } });
  assert.equal(delegatedRequest.agent, "lead");
  assert.equal(require("./services/jarvisService").selectSpecializedAgent("review an Instagram comment"), "social");

  for (const file of ["agentExecutionService.js", "agentRegistry.js", "agentToolRegistry.js", "agentToolExecutor.js", "agentPromptRegistry.js"]) {
    const source = fs.readFileSync(`${__dirname}/services/${file}`, "utf8");
    assert(!source.includes("new OpenAI"));
    assert(!source.includes("OBSIDIAN_VAULT_PATH"));
    assert(!source.includes("JarvisMemoryNote"));
  }
  assert(configChecks.some((item) => item.agent === "lead"));
  console.log("Shared agent registry, execution, tool boundaries, prompts, attribution, and coordinator tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
