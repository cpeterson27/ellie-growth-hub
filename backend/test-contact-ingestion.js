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
assert.strictEqual(contact.apolloFields.employeeCount, 42);
assert.strictEqual(normalizeIncoming({ name: "Name Only" }).email, "");
console.log("Contact ingestion normalization tests passed");
