const assert = require("assert");
const { matchReasons, searchableText } = require("./services/campaignAudienceService");

const multifamilyInvestor = {
  title: "Real Estate Investor and Developer",
  industry: "real estate",
  keywords: ["multifamily", "property acquisitions"],
  tags: ["event-lead"],
};

assert(searchableText(multifamilyInvestor).includes("multifamily"));
const reasons = matchReasons(multifamilyInvestor, ["Multifamily investors", "Real estate investors"]);
assert.strictEqual(reasons.length, 2);
assert(reasons.some((reason) => reason.audience === "Multifamily investors"));
assert(reasons.some((reason) => reason.audience === "Real estate investors"));
assert.deepStrictEqual(matchReasons({ title: "Dentist" }, ["Airbnb investors"]), []);

console.log("Campaign audience matching tests passed");
