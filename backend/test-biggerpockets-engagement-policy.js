const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const policy = require("./services/biggerPocketsEngagementPolicy");

const biggerPockets = {
  source: "bing_web",
  sourceUrl: "https://www.biggerpockets.com/forums/432/topics/1227552-coaching-for-multifamily",
  title: "Coaching for multifamily?",
  excerpt: "I'm overwhelmed and exploring mentoring programs that cost $20k-$30k.",
  raw: { indexedSourceLabel: "BiggerPockets forum via Bing" },
};

assert.equal(policy.isBiggerPocketsSignal(biggerPockets), true);
assert.equal(policy.isBiggerPocketsSignal({ sourceUrl: "https://reddit.com/r/realestate/comments/one" }), false);

const draft = policy.publicResponseDraft(biggerPockets);
assert.match(draft, /curriculum|instructor|feedback/i, "draft must directly address evaluating mentorship");
assert.match(draft, /quoted price|lower-cost/i, "draft must address the person's stated price concern");
assert.deepEqual(policy.prohibitedPublicResponseContent(draft), []);
assert.notEqual(draft, policy.publicResponseDraft({ ...biggerPockets, excerpt: "I need help underwriting NOI and debt service on my first multifamily deal." }), "response guidance must vary with the individual question");

for (const prohibited of [
  "I work with Ellie, who coaches investors specifically in multifamily, and I’d be happy to share a little about what she does if you’re interested.",
  "Ellie's Coaching can help—apply now.",
  "I work with a company that provides this service.",
  "Our client has a product for multifamily investors.",
  "We help investors with this. Let me know if you want details.",
  "I can share more if you're interested.",
  "Check us out for more information.",
  "Visit https://elliescoaching.com",
  "DM me and I will share the details.",
  "Email support@example.com for our program.",
]) assert.ok(policy.prohibitedPublicResponseContent(prohibited).length, `must block: ${prohibited}`);
const removedModeratorSentence = "I work with Ellie, who coaches investors specifically in multifamily, and I’d be happy to share a little about what she does if you’re interested.";
const removedSentenceViolations = policy.prohibitedPublicResponseContent(removedModeratorSentence);
assert.ok(removedSentenceViolations.length >= 3, "the removed moderator sentence must be blocked for identity, affiliation, and invitation language");
assert.doesNotMatch(draft, /Ellie|Growth Operator|Classifieds|\b(?:I|we) (?:work|help|offer|provide)\b|https?:|www\.|@/i);

for (const action of ["Private-message generation", "Author enrichment", "Email outreach", "Closer sequence transfer"]) {
  assert.throws(() => policy.assertNoBiggerPocketsSolicitation(biggerPockets, action), (error) => error.code === "BIGGERPOCKETS_OUTREACH_BLOCKED");
}
assert.doesNotThrow(() => policy.assertNoBiggerPocketsSolicitation({ sourceUrl: "https://reddit.com/r/realestate/comments/one" }, "Email outreach"), "other source policies must remain unchanged");
assert.equal(policy.validIndependentRelationship({ relationshipBasis: "inbound_interest", relationshipNote: "The person independently submitted the public program application." }), true);
assert.equal(policy.validIndependentRelationship({ relationshipBasis: "biggerpockets_post", relationshipNote: "Found from the forum post and enriched elsewhere." }), false);
assert.equal(policy.validIndependentRelationship({ relationshipBasis: "independent_relationship", relationshipNote: "short" }), false);

const route = fs.readFileSync(path.join(__dirname, "routes/audience.js"), "utf8");
const monitorService = fs.readFileSync(path.join(__dirname, "services/researchMonitorService.js"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/Discovery.jsx"), "utf8");
assert.match(route, /identity-research[\s\S]*Author enrichment for solicitation/);
assert.match(route, /email-drafts[\s\S]*Email-draft generation/);
assert.match(route, /Outbound sequence transfer/);
assert.match(route, /BIGGERPOCKETS_RELATIONSHIP_EVIDENCE_REQUIRED/);
assert.match(monitorService, /websiteCandidates\.push[\s\S]*!isBiggerPocketsForumTopicUrl|!isBiggerPocketsForumTopicUrl[\s\S]*websiteCandidates\.push/, "BiggerPockets authors must not enter automatic public contact enrichment");
assert.match(ui, /No promotional outreach — BiggerPockets policy\./);
assert.match(ui, /manual posting only/i);

console.log("BiggerPockets engagement policy checks passed");
