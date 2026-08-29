const assert = require("node:assert/strict");
const axios = require("axios");
const { buyerIntentAssessment, communityPartnerAssessment, scoreSignal } = require("./services/researchMonitorService");
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

  const monitor = { monitorType: "buyer_intent", keywords: ["early multifamily deal", "underwriting help", "deal analysis", "moving into multifamily", "learning request", "mentor search", "coaching program"], locations: [] };
  const queries = sources.bingQueriesFor(monitor);
  assert.equal(queries[0].type, "biggerpockets_forum");
  assert.match(queries[0].query, /site:biggerpockets\.com\/forums/);
  assert.match(queries[0].query, /coaching OR coach OR mentor/);

  const fixtureUrl = "https://www.biggerpockets.com/forums/432/topics/1227552-coaching-for-multifamily";
  const mockFetchFeed = async (url, source, label) => {
    const query = decodeURIComponent(new URL(url).searchParams.get("q") || "");
    if (query.includes("site:biggerpockets.com/forums")) return [sources.normalizeSignal(source, {
      sourceUrl: `${fixtureUrl}?utm_source=bing#reply`, title: "Coaching for multifamily?",
      excerpt: "Posted January 23, 2025. I'm exploring mentoring programs for larger multifamily. It feels overwhelming. Programs cost $20k-$30k. Was coaching worth it?",
      publishedAt: new Date(), evidenceLabel: label,
    })];
    return Array.from({ length: 10 }, (_item, index) => sources.normalizeSignal(source, { sourceUrl: `https://example.com/${encodeURIComponent(query.slice(0, 8))}/${index}`, title: "generic result" }));
  };
  const indexed = await sources.searchBingWeb(monitor, 5, { fetchFeed: mockFetchFeed });
  const fixture = indexed.find((signal) => signal.sourceUrl === fixtureUrl);
  assert.ok(fixture, "dedicated BiggerPockets results must survive the shared Bing result cap");
  assert.equal(fixture.publishedAt.toISOString(), "2025-01-23T00:00:00.000Z", "the original indexed post date must override the Bing RSS crawl date");
  assert.equal(fixture.raw.indexedSourceLabel, "BiggerPockets forum via Bing");
  assert.equal(buyerIntentAssessment(fixture).eligible, false, "the historical fixture must not become a current outreach target");

  const recentEquivalent = { ...fixture, publishedAt: new Date(), excerpt: "I'm exploring mentoring programs for multifamily investing. I'm overwhelmed and need guidance. Coaching programs cost $20k-$30k. Was it worth it?" };
  assert.equal(buyerIntentAssessment(recentEquivalent).eligible, true);
  const ranking = scoreSignal(recentEquivalent, monitor);
  assert.ok(ranking.score >= 85, `recent equivalent should be high intent, received ${ranking.score}`);
  assert.ok(ranking.reasons.some((reason) => /price or budget awareness/i.test(reason)));
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
