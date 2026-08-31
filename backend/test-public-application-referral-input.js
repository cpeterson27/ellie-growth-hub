const assert = require("node:assert/strict");
const service = require("./services/publicApplicationService");

assert.equal(service.normalizeReferralInput("Freedom-Lead"), "freedom-lead");
assert.equal(service.normalizeReferralInput("https://elliescoaching.com/ref/Freedom-Lead"), "freedom-lead");
assert.equal(service.normalizeReferralInput("https://elliescoaching.com/apply?ref=Freedom-Lead"), "freedom-lead");
assert.equal(service.normalizeReferralInput("https://elliescoaching.com/apply?referral=Freedom-Lead"), "freedom-lead");
assert.equal(service.normalizeReferralInput(""), "");

console.log("Public application referral code and full-link normalization passed.");
