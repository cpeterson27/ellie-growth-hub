const assert = require("assert");
const { canonicalFieldMap, normalizeIncoming } = require("./services/contactIngestionService");
const { applyResearchClassification, getMissingTargetingFields } = require("./services/contactResearchService");

assert.strictEqual(canonicalFieldMap["Apollo Contact Id"], "apolloContactId");
const contact = normalizeIncoming({
  "First Name": "Ada",
  "Last Name": "Lovelace",
  Email: " ADA@EXAMPLE.COM ",
  "# Employees": "42",
  "Person Linkedin Url": "https://linkedin.com/in/ada/",
  "Apollo Record Id": "record-1",
}, "csv");
assert.strictEqual(contact.name, "Ada Lovelace");
assert.strictEqual(contact.email, "ada@example.com");
assert.strictEqual(contact.employeeCount, 42);
assert.strictEqual(contact.linkedin, "https://linkedin.com/in/ada");
assert.strictEqual(contact.providerRecordId, "record-1");
assert.strictEqual(contact.employeeCount, 42);
const custom = normalizeIncoming({ "First Name": "Ada", "ICP Fit 8478 0723201923": "high" }, "csv");
assert.strictEqual(custom.additionalFields["ICP Fit 8478 0723201923"], "high");
assert.strictEqual(normalizeIncoming({ name: "Name Only" }).email, "");
const segmented = normalizeIncoming({ Name: "Jane Doe", Tags: "15k-program, multifamily", Notes: "Warm referral" }, "csv");
assert.deepStrictEqual(segmented.tags, ["15k-program", "multifamily"]);
assert.strictEqual(segmented.notes, "Warm referral");
const incomplete = applyResearchClassification({ company: "", title: "Owner", industry: "", tags: ["event"] });
assert.deepStrictEqual(getMissingTargetingFields(incomplete), ["company", "industry"]);
assert.strictEqual(incomplete.researchStatus, "needs_research");
assert.strictEqual(incomplete.qualifyContact, false);
assert(incomplete.tags.includes("needs-research"));
const complete = applyResearchClassification({ company: "Example Co", title: "Owner", industry: "Real Estate", tags: ["event"], qualifyContact: false, stage: "Needs Research" });
assert.strictEqual(complete.researchStatus, "ready_for_review");
assert.strictEqual(complete.stage, "Ready for Review");
assert(!complete.tags.includes("needs-research"));
const placeholders = normalizeIncoming({
  "First Name": "Derek",
  "Company Name": "Stage = Needs Research",
  Title: "Stage = Needs Research",
  Industry: "Stage = Needs Research",
  Stage: "Stage = Needs Research",
  "Qualify Contact": "Stage = Needs Research",
  Tags: "Stage = Needs Research",
}, "csv");
assert.strictEqual(placeholders.company, "");
assert.strictEqual(placeholders.title, "");
assert.strictEqual(placeholders.industry, "");
assert.strictEqual(placeholders.stage, "Needs Research");
assert.strictEqual(placeholders.qualifyContact, false);
assert.deepStrictEqual(placeholders.tags, ["needs-research"]);
const misplacedTitle = normalizeIncoming({ Name: "Investor", Title: "+1 972-532-7355", Seniority: "Real Estate Investor / Developer" }, "csv");
assert.strictEqual(misplacedTitle.title, "Real Estate Investor / Developer");
console.log("Contact ingestion normalization tests passed");
