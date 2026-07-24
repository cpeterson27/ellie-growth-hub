const assert = require("assert");
const { formatError } = require("./services/apollo");

assert.deepStrictEqual(
  formatError({ response: { status: 401 } }).errorCode,
  "unauthorized",
);
assert.strictEqual(formatError({ response: { status: 403 } }).errorCode, "forbidden");
assert.strictEqual(formatError({ response: { status: 404 } }).errorCode, "unsupported_endpoint");
assert.strictEqual(formatError({ code: "ECONNABORTED" }).errorCode, "timeout");
assert.strictEqual(formatError({}).errorCode, "provider_error");
console.log("Apollo search error classification tests passed");
