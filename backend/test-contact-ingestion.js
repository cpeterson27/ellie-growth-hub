const assert = require("assert");
const { canonicalFieldMap, normalizeIncoming } = require("./services/contactIngestionService");

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
console.log("Contact ingestion normalization tests passed");
