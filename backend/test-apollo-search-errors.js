const assert = require("assert");
const { formatError, buildContactSearchBody, contactSearchDiagnostic } = require("./services/apollo");

assert.deepStrictEqual(
  formatError({ response: { status: 401 } }).errorCode,
  "unauthorized",
);
assert.strictEqual(formatError({ response: { status: 403 } }).errorCode, "forbidden");
assert.strictEqual(formatError({ response: { status: 404 } }).errorCode, "unsupported_endpoint");
assert.strictEqual(formatError({ code: "ECONNABORTED" }).errorCode, "timeout");
assert.strictEqual(formatError({}).errorCode, "provider_error");
assert.deepStrictEqual(buildContactSearchBody({ titles: [" CEO ", ""], locations: ["", "Texas"], keywords: [" multifamily "], page: 0, perPage: 200 }), {
  page: 1,
  per_page: 100,
  q_person_titles: ["CEO"],
  q_keywords: "multifamily",
  person_locations: ["Texas"],
});
assert.deepStrictEqual(contactSearchDiagnostic({ status: 200, data: { contacts: [], pagination: { page: 1, per_page: 1, total_entries: 0, total_pages: 0 } } }), {
  endpoint: "/v1/contacts/search",
  status: 200,
  topLevelKeys: ["contacts", "pagination"],
  resultCount: 0,
  apolloCode: null,
  apolloMessage: null,
  pagination: { page: 1, perPage: 1, totalEntries: 0, totalPages: 0 },
});
console.log("Apollo search error classification tests passed");
