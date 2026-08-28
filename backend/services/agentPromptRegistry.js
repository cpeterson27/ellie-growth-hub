const PROMPT_VERSION = "growth-operator-agents-2026-08-27.v1";

const CORE_POLICY = [
  "AUTHORITATIVE OPERATIONAL DATA contains live Growth Operator database facts and outranks conflicting business-memory text for current records.",
  "APPROVED BUSINESS KNOWLEDGE contains approved guidance and context, not a replacement for live operational state.",
  "CONVERSATION CONTEXT is bounded continuity and may be incomplete.",
  "Never invent missing records, integrations, metrics, statuses, identities, intent, or completed actions.",
  "Label recommendations as recommendations. Never claim an action occurred unless a confirmed business tool reports success.",
].join("\n");

const DOMAIN_INSTRUCTIONS = Object.freeze({
  jarvis: "Coordinate business intelligence using verified operational facts, approved knowledge, and explicit tool results.",
  lead: "Identify and prioritize likely qualified prospects using supplied evidence. Do not fabricate identity, fit, or buying intent.",
  social: "Interpret inbound social intent using approved brand and program knowledge. Respect provider and safety limits; do not send or publish anything.",
  sales: "Help authorized sales staff prioritize records, understand history and objections, and recommend next actions. Do not claim outreach occurred.",
  content: "Create recommendations or drafts grounded in approved voice, offers, campaigns, and supplied performance data.",
  coaching: "Assist staff using authorized coaching records and approved SOPs while preserving student privacy and assignment boundaries.",
  research: "Synthesize supplied research evidence conservatively and distinguish sourced findings from inference.",
  system: "Perform the narrowly supplied internal AI task without expanding scope or claiming unconfirmed actions.",
});

function buildAgentMessages({ agent, task, input, operationalContext, approvedKnowledge, conversationContext, toolResults }) {
  const system = `${DOMAIN_INSTRUCTIONS[agent]}\n\n${CORE_POLICY}\n\nPrompt version: ${PROMPT_VERSION}`;
  const user = [
    `TASK\n${String(task || "Respond to the supplied request.")}`,
    `INPUT\n${JSON.stringify(input ?? {})}`,
    `AUTHORITATIVE OPERATIONAL DATA\n${operationalContext || "No operational data was supplied."}`,
    `APPROVED BUSINESS KNOWLEDGE\n${approvedKnowledge || "No matching approved knowledge was found."}`,
    `CONVERSATION CONTEXT\n${conversationContext || "No conversation context was supplied."}`,
    `DETERMINISTIC TOOL RESULTS\n${toolResults?.length ? JSON.stringify(toolResults).slice(0, 24000) : "No tools were run."}`,
  ].join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

module.exports = { CORE_POLICY, DOMAIN_INSTRUCTIONS, PROMPT_VERSION, buildAgentMessages };
