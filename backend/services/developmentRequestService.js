const DevelopmentRequest = require("../models/DevelopmentRequest");

const developmentIntentPatterns = [
  /\b(change|edit|update|modify|make|fix|redesign|rebuild)\b.{0,50}\b(code|website|app|page|screen|button|menu|navbar|layout|design|feature)\b/i,
  /\b(add|build|create|implement)\b.{0,45}\b(feature|integration|page|screen|workflow|button|automation)\b/i,
  /\b(commit|push|deploy)\b.{0,30}\b(change|code|site|app|frontend|backend)\b/i,
];

function isDevelopmentRequest(message = "") {
  return developmentIntentPatterns.some((pattern) => pattern.test(String(message)));
}

function requestTitle(message) {
  const cleaned = String(message).replace(/\s+/g, " ").trim();
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}…` : cleaned;
}

function buildCodexBrief(request) {
  return [
    `Development request: ${request.title}`,
    "",
    "User request:",
    request.description,
    "",
    "Safety and workflow:",
    "- Inspect the existing implementation before editing.",
    "- Preserve unrelated user changes.",
    "- Do not expose credentials or secrets.",
    "- Build and test changes before reporting completion.",
    "- Do not deploy unless deployment is explicitly authorized.",
    "",
    "Acceptance criteria:",
    ...(request.acceptanceCriteria.length
      ? request.acceptanceCriteria.map((item) => `- ${item}`)
      : ["- Implement the approved request faithfully.", "- Verify the affected user workflow."]),
    "",
    `Priority: ${request.priority}`,
    `Risk: ${request.risk}`,
    `Request ID: ${request._id}`,
  ].join("\n");
}

async function createFromJarvis(message) {
  const normalized = String(message).replace(/\s+/g, " ").trim();
  const duplicate = await DevelopmentRequest.findOne({
    originalRequest: normalized,
    status: "pending_approval",
  }).sort({ createdAt: -1 });
  if (duplicate) return duplicate;

  return DevelopmentRequest.create({
    title: requestTitle(normalized),
    description: normalized,
    originalRequest: normalized,
    requestedBy: "jarvis",
    priority: /\b(urgent|broken|production|security)\b/i.test(normalized) ? "high" : "medium",
    risk: /\b(database|delete|payment|auth|security|deploy)\b/i.test(normalized) ? "high" : "medium",
    acceptanceCriteria: [
      "The requested behavior is implemented without breaking existing routes.",
      "The affected interface or workflow is tested before handoff.",
    ],
  });
}

module.exports = { isDevelopmentRequest, createFromJarvis, buildCodexBrief };
