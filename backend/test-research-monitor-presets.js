const assert = require("node:assert/strict");
const { STUDENT_BUYER_PRESET, INVESTOR_PROSPECT_PRESET, COMMUNITY_PARTNER_PRESET, RESEARCH_MONITOR_PRESETS } = require("./services/researchMonitorPresets");

assert.equal(RESEARCH_MONITOR_PRESETS.length, 3);

assert.equal(STUDENT_BUYER_PRESET.name, "Ellie Multifamily Student Intent");
assert.equal(STUDENT_BUYER_PRESET.monitorType, "buyer_intent");
assert.equal(STUDENT_BUYER_PRESET.query, "Adults actively learning or entering multifamily investing who are publicly asking for help with underwriting, analyzing an early deal, cap rates, NOI, debt service, financing, syndication, raising capital, moving from single-family to multifamily, or finding relevant mentorship, training, courses, bootcamps, or investor education.");
assert.deepEqual(STUDENT_BUYER_PRESET.intentCategories.map((item) => item.name), ["Early multifamily deal", "Underwriting help", "Deal analysis help", "Moving into multifamily", "Learning request", "Mentor or coaching search", "Course or training search", "Execution questions"]);
for (const exclusion of ["Jobs and job seekers", "Homework or school assignments", "Institutional funds", "Venture capital", "Private equity", "Hedge funds", "SEC filings", "Generic promotions", "Service providers pitching", "Unrelated commercial finance"]) assert.ok(STUDENT_BUYER_PRESET.negativeKeywords.includes(exclusion));
assert.deepEqual(STUDENT_BUYER_PRESET.sources, ["bing_web", "reddit_rss"]);
assert.deepEqual(STUDENT_BUYER_PRESET.feedUrls, [], "BiggerPockets must not be presented as a reliable direct feed");

assert.equal(INVESTOR_PROSPECT_PRESET.monitorType, "investor_profile");
assert.match(INVESTOR_PROSPECT_PRESET.query, /title alone never qualifies/i);
assert.ok(INVESTOR_PROSPECT_PRESET.intentCategories.some((item) => item.name === "Active evaluation"));
assert.ok(INVESTOR_PROSPECT_PRESET.negativeKeywords.includes("Professional title only"));
assert.deepEqual(INVESTOR_PROSPECT_PRESET.sources, ["bing_web", "reddit_rss"]);
assert.deepEqual(INVESTOR_PROSPECT_PRESET.feedUrls, []);

assert.equal(COMMUNITY_PARTNER_PRESET.monitorType, "community_partner");
assert.match(COMMUNITY_PARTNER_PRESET.query, /must never be treated as individual buyer intent/i);
assert.ok(COMMUNITY_PARTNER_PRESET.intentCategories.some((item) => item.name === "Community leadership"));
assert.deepEqual(COMMUNITY_PARTNER_PRESET.sources, ["linkedin_public", "facebook_public", "meetup_public", "community_directories", "bing_web"]);
assert.deepEqual(COMMUNITY_PARTNER_PRESET.feedUrls, []);
assert.ok(COMMUNITY_PARTNER_PRESET.negativeKeywords.includes("Private member lists"));

console.log("Research monitor preset payload checks passed");
