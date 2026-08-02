const assert = require("node:assert/strict");
const { normalizeResult, sourceStatus } = require("./services/businessDataSourceService");

const normalized = normalizeResult({
  id: "business-1",
  name: "Salon Luxe",
  website: "https://salonluxe.example",
  domain: "https://www.salonluxe.example/about",
  locationCount: 3,
  evidence: [{ url: "https://salonluxe.example/locations", field: "locationCount", value: "3" }],
  people: [{ name: "Sarah Chen", title: "Owner", email: "sarah@salonluxe.example", evidenceUrl: "https://salonluxe.example/about" }],
}, "test_feed");

assert.equal(normalized.domain, "salonluxe.example");
assert.equal(normalized.locationCount, 3);
assert.equal(normalized.evidence.length, 1);
assert.equal(normalized.decisionMakers[0].emailStatus, "published_unverified");
assert.equal(sourceStatus().configured, true);
assert.match(sourceStatus().mode, /owned_index/);

console.log("Business data source normalization tests passed");
