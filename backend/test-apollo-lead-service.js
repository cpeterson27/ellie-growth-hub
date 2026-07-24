const assert = require("assert");
const { normalizeLead } = require("./services/apolloLeadService");

const normalized = normalizeLead({
  apolloPersonId: "person-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: " ADA@EXAMPLE.COM ",
  linkedinUrl: "https://linkedin.com/in/ada/",
  employeeCount: "42",
});

assert.strictEqual(normalized.sourceProvider, "apollo");
assert.strictEqual(normalized.providerContactId, "person-1");
assert.strictEqual(normalized.email, "ada@example.com");
assert.strictEqual(normalized.linkedin, "https://linkedin.com/in/ada");
assert.strictEqual(normalized.employeeCount, 42);
assert.strictEqual(normalizeLead({ name: "No ID" }).providerContactId, undefined);
console.log("Apollo lead normalization tests passed");
