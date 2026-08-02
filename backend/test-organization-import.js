const assert = require("node:assert/strict");
const { normalizeOrganizationRow } = require("./services/organizationImportService");

const normalized = normalizeOrganizationRow({
  "Company Name": " Northstar Multifamily ",
  Website: "https://www.northstar.example/about",
  "# Employees": "1,250",
  Keywords: "multifamily, syndication",
  "Provider Account ID": "org_123",
});

assert.equal(normalized.name, "Northstar Multifamily");
assert.equal(normalized.domain, "northstar.example");
assert.equal(normalized.employeeCount, 1250);
assert.deepEqual(normalized.keywords, ["multifamily", "syndication"]);
assert.equal(normalized.providerId, "org_123");

console.log("Organization import normalization tests passed");
