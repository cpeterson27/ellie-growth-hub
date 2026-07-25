const assert = require("assert");
const { isDevelopmentRequest, buildCodexBrief } = require("./services/developmentRequestService");

assert.equal(isDevelopmentRequest("What are my priorities this week?"), false);
assert.equal(isDevelopmentRequest("Redesign the contacts page and fix the import button"), true);
assert.equal(isDevelopmentRequest("Add a new campaign approval workflow"), true);

const brief = buildCodexBrief({
  _id: "request-123",
  title: "Improve contact import",
  description: "Make the CSV import clearer.",
  priority: "medium",
  risk: "low",
  acceptanceCriteria: ["CSV instructions are visible."],
});

assert.match(brief, /Development request: Improve contact import/);
assert.match(brief, /Do not deploy unless deployment is explicitly authorized/);
assert.match(brief, /CSV instructions are visible/);

console.log("Development request service tests passed");
