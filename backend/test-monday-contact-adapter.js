const assert = require("assert");
const MondayAdapter = require("./services/integrations/MondayAdapter");

const adapter = new MondayAdapter();
const credentials = { apiKey: "test", boardId: "1", columnIds: { phone: "phone", linkedin: "linkedin", apolloContactId: "apollo_id" } };
const mapping = adapter.buildColumnValues({ ...credentials, columnIds: { ...credentials.columnIds, status: "lead_status" } }, { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", title: "Engineer", phone: "123", linkedin: "https://linkedin.com/in/ada", providerContactId: "apollo-1", status: "active" });
assert.deepStrictEqual(mapping.values.lead_email, { email: "ada@example.com", text: "ada@example.com" });
assert.strictEqual(mapping.values.phone, "123");
assert.strictEqual(mapping.values.apollo_id, "apollo-1");
assert.deepStrictEqual(mapping.values.linkedin, { url: "https://linkedin.com/in/ada", text: "https://linkedin.com/in/ada" });
assert.strictEqual(mapping.values.lead_status, "New Lead");
assert(mapping.missingMappings.includes("title"));

const originalFetch = global.fetch;
global.fetch = async () => ({ json: async () => ({ data: { change_multiple_column_values: { id: "monday-1" } } }) });
adapter.updateContact(credentials, { mondayItemId: "monday-1", name: "Ada", email: "ada@example.com" }).then((result) => {
  assert.strictEqual(result.id, "monday-1");
  global.fetch = originalFetch;
  console.log("Monday create/update mapping tests passed");
}).catch((error) => { global.fetch = originalFetch; throw error; });
