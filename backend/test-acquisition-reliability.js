const assert = require("node:assert/strict");
const axios = require("axios");
const { communityPartnerAssessment, scoreSignal } = require("./services/researchMonitorService");
const sources = require("./services/intentSourceService");

async function redditChecks() {
  let calls = 0;
  const successful = { fetchFeed: async () => { calls += 1; return [{ sourceUrl: "https://reddit.com/r/test/one", sourceId: "one" }, { sourceUrl: "https://reddit.com/r/test/one", sourceId: "duplicate" }]; } };
  sources.resetRedditPublicState();
  const monitor = { keywords: ["underwriting help"], locations: [] };
  const first = await sources.searchRedditRss(monitor, 20, successful);
  const cached = await sources.searchRedditRss(monitor, 20, successful);
  assert.equal(first.length, 1, "duplicate Reddit links must collapse");
  assert.equal(cached.length, 1);
  assert.equal(calls, 1, "same query must use the responsible cache");

  sources.resetRedditPublicState(); calls = 0;
  const limited = { fetchFeed: async () => { calls += 1; const error = new Error("Request failed with status code 429"); error.response = { status: 429, headers: { "retry-after": "60" } }; throw error; } };
  await assert.rejects(() => sources.searchRedditRss(monitor, 20, limited), /429/);
  await assert.rejects(() => sources.searchRedditRss(monitor, 20, limited), /waiting for retry/);
  assert.equal(calls, 1, "cooldown must prevent repeated calls during Reddit backoff");
  sources.resetRedditPublicState();
}

async function biggerPocketsChecks() {
  const original = axios.get; let calls = 0; axios.get = async () => { calls += 1; throw new Error("must not crawl BiggerPockets directly"); };
  const results = await sources.searchConfiguredFeeds({ feedUrls: ["https://www.biggerpockets.com/forums"] }, 20);
  assert.deepEqual(results, []); assert.equal(calls, 0);
  axios.get = original;
}

function meetupAndScoringChecks() {
  assert.deepEqual(sources.explicitOrganizerCandidates("Hosted by Cassandra Peterson, and organized by Ellie Perlman."), ["Cassandra Peterson", "Ellie Perlman"]);
  const monitor = { monitorType: "community_partner", keywords: ["multifamily investors"], intentCategories: [], negativeKeywords: [] };
  const open = { source: "meetup_public", title: "Multifamily Investors Meetup", excerpt: "Active real estate community hosted by Ellie Perlman", organizationName: "Investors Meetup", raw: { memberCount: 700, recentActivity: true } };
  const restricted = { ...open, excerpt: `${open.excerpt}. No pitching, no promotions, and no solicitation.` };
  assert.equal(communityPartnerAssessment(restricted, monitor).eligible, true, "restrictions affect fit but do not auto-reject");
  const openScore = scoreSignal(open, monitor); const restrictedScore = scoreSignal(restricted, monitor);
  assert.ok(openScore.score < 90, "generic communities must not cluster around 90");
  assert.ok(restrictedScore.score <= openScore.score - 20);
  assert.ok(restrictedScore.reasons.some((reason) => /restrictions affect partnership fit/i.test(reason)));
}

Promise.resolve().then(redditChecks).then(biggerPocketsChecks).then(meetupAndScoringChecks)
  .then(() => console.log("Acquisition reliability checks passed"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
