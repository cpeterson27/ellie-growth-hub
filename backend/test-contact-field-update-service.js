const assert = require("node:assert/strict");
const { BUILTIN_FIELDS, normalizeValue } = require("./services/contactFieldUpdateService");

assert.equal(normalizeValue({ label: "Qualified", type: "boolean" }, "yes"), true);
assert.equal(normalizeValue({ label: "Qualified", type: "boolean" }, "no"), false);
assert.equal(normalizeValue({ label: "Employees", type: "number" }, "42"), 42);
assert.deepEqual(normalizeValue({ label: "Tags", type: "list" }, "owner, priority, owner"), ["owner", "priority"]);
assert.equal(normalizeValue({ label: "Title", type: "text", maxLength: 5 }, "Managing Partner"), "Manag");
assert.throws(() => normalizeValue({ label: "Qualified", type: "boolean" }, "maybe"), /must be yes or no/);
assert.equal(Object.hasOwn(BUILTIN_FIELDS, "email"), false);
assert.equal(Object.hasOwn(BUILTIN_FIELDS, "emailStatus"), false);
assert.equal(Object.hasOwn(BUILTIN_FIELDS, "status"), false);

console.log("contact field update normalization tests passed");
