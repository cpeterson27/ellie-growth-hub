const axios = require("axios");
const crypto = require("node:crypto");
const { safeUrl } = require("./publicWebsiteResearchService");

const USER_AGENT = "GrowthOperatorResearchBot/1.0 (+https://ellie-ai-backend.onrender.com/gpt-actions/privacy; support@elliescoaching.com)";
const REQUEST_TIMEOUT = 20000;

const clean = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const decodeEntities = (value) => String(value || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const hashId = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);

function queryFor(monitor) {
  const keywords = (monitor.keywords || []).map(clean).filter(Boolean);
  const locations = (monitor.locations || []).map(clean).filter(Boolean);
  return [...keywords, ...locations].join(" ") || clean(monitor.query);
}

function termsFor(monitor, max = 6) {
  const terms = (monitor.keywords || []).map(clean).filter(Boolean);
  return (terms.length ? terms : [clean(monitor.query)]).slice(0, max);
}

function booleanQueryFor(monitor, max = 6) {
  return termsFor(monitor, max).map((term) => /\s/.test(term) ? `"${term.replace(/"/g, "")}"` : term).join(" OR ");
}

function normalizeSignal(source, item = {}) {
  const sourceUrl = String(item.sourceUrl || "").trim();
  if (!sourceUrl) return null;
  return {
    source,
    sourceId: String(item.sourceId || hashId(sourceUrl)).trim(),
    sourceUrl,
    title: decodeEntities(clean(item.title)).slice(0, 1000),
    excerpt: decodeEntities(clean(item.excerpt)).slice(0, 6000),
    authorName: decodeEntities(clean(item.authorName)),
    authorUrl: String(item.authorUrl || "").trim(),
    organizationName: decodeEntities(clean(item.organizationName)),
    organizationDomain: String(item.organizationDomain || "").trim().toLowerCase(),
    publishedAt: item.publishedAt && !Number.isNaN(new Date(item.publishedAt).valueOf()) ? new Date(item.publishedAt) : null,
    evidence: [{ label: item.evidenceLabel || source.replaceAll("_", " "), url: sourceUrl, observedAt: new Date() }],
    raw: item.raw || {},
  };
}

function extractXmlItems(xml) {
  const blocks = String(xml || "").match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  const tag = (block, names) => {
    for (const name of names) {
      const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, "i"));
      if (match?.[1]) return match[1];
    }
    return "";
  };
  return blocks.map((block) => {
    const href = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || tag(block, ["link"]);
    return {
      id: tag(block, ["guid", "id"]) || href,
      link: decodeEntities(href),
      title: tag(block, ["title"]),
      description: tag(block, ["description", "summary", "content"]),
      author: tag(block, ["author", "dc:creator", "name"]),
      publishedAt: tag(block, ["pubDate", "published", "updated"]),
    };
  });
}

async function fetchJson(url, params = {}) {
  try {
    return await axios.get(url, { params, timeout: REQUEST_TIMEOUT, maxContentLength: 8 * 1024 * 1024, headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  } catch (error) {
    if (error.response?.status !== 429) throw error;
    await new Promise((resolve) => setTimeout(resolve, 6500));
    return axios.get(url, { params, timeout: REQUEST_TIMEOUT, maxContentLength: 8 * 1024 * 1024, headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  }
}

async function searchGdelt(monitor, limit) {
  const response = await fetchJson("https://api.gdeltproject.org/api/v2/doc/doc", {
    query: booleanQueryFor(monitor), mode: "artlist", maxrecords: Math.min(250, limit), format: "json", sort: "datedesc",
  });
  return (response.data?.articles || []).map((article) => normalizeSignal("gdelt", {
    sourceId: article.url,
    sourceUrl: article.url,
    title: article.title,
    excerpt: [article.domain, article.sourcecountry, article.language].filter(Boolean).join(" · "),
    organizationDomain: article.domain,
    publishedAt: article.seendate,
    evidenceLabel: "GDELT indexed public news",
    raw: { domain: article.domain, sourcecountry: article.sourcecountry, language: article.language },
  })).filter(Boolean);
}

async function searchBluesky(monitor, limit) {
  const requests = termsFor(monitor, 4).map((term) => fetchJson("https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts", { q: term, limit: Math.min(25, limit), sort: "latest" }));
  const responses = await Promise.all(requests);
  const posts = responses.flatMap((response) => response.data?.posts || []);
  return [...new Map(posts.map((post) => [post.uri || post.cid, post])).values()].slice(0, limit).map((post) => {
    const handle = post.author?.handle || "";
    const recordKey = String(post.uri || "").split("/").pop();
    return normalizeSignal("bluesky", {
      sourceId: post.uri || post.cid,
      sourceUrl: handle && recordKey ? `https://bsky.app/profile/${handle}/post/${recordKey}` : `https://bsky.app/profile/${handle}`,
      title: post.record?.text,
      excerpt: post.record?.text,
      authorName: post.author?.displayName || handle,
      authorUrl: handle ? `https://bsky.app/profile/${handle}` : "",
      publishedAt: post.record?.createdAt || post.indexedAt,
      evidenceLabel: "Public Bluesky post",
      raw: { handle, replyCount: post.replyCount, repostCount: post.repostCount, likeCount: post.likeCount },
    });
  }).filter(Boolean);
}

async function searchHackerNews(monitor, limit) {
  const responses = await Promise.all(termsFor(monitor, 5).map((term) => fetchJson("https://hn.algolia.com/api/v1/search_by_date", { query: term, tags: "story,comment", hitsPerPage: Math.min(30, limit) })));
  const hits = responses.flatMap((response) => response.data?.hits || []);
  return [...new Map(hits.map((hit) => [hit.objectID, hit])).values()].slice(0, limit).map((hit) => normalizeSignal("hacker_news", {
    sourceId: hit.objectID,
    sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: hit.title || hit.story_title || hit.comment_text,
    excerpt: hit.comment_text || hit.story_text || hit.title,
    authorName: hit.author,
    authorUrl: hit.author ? `https://news.ycombinator.com/user?id=${encodeURIComponent(hit.author)}` : "",
    publishedAt: hit.created_at,
    evidenceLabel: "Public Hacker News discussion",
    raw: { points: hit.points, numComments: hit.num_comments, storyUrl: hit.url || hit.story_url },
  })).filter(Boolean);
}

async function searchStackExchange(monitor, limit) {
  const responses = await Promise.all(termsFor(monitor, 5).map((term) => fetchJson("https://api.stackexchange.com/2.3/search/advanced", {
    order: "desc", sort: "creation", q: term, site: "workplace", pagesize: Math.min(30, limit), filter: "withbody",
  })));
  const items = responses.flatMap((response) => response.data?.items || []);
  return [...new Map(items.map((item) => [item.question_id, item])).values()].slice(0, limit).map((item) => normalizeSignal("stack_exchange", {
    sourceId: item.question_id,
    sourceUrl: item.link,
    title: item.title,
    excerpt: item.body,
    authorName: item.owner?.display_name,
    authorUrl: item.owner?.link,
    publishedAt: item.creation_date ? item.creation_date * 1000 : null,
    evidenceLabel: "Public Stack Exchange question",
    raw: { score: item.score, answerCount: item.answer_count, tags: item.tags },
  })).filter(Boolean);
}

async function fetchFeed(url, source, label, limit) {
  await safeUrl(url);
  const response = await axios.get(url, { timeout: REQUEST_TIMEOUT, responseType: "text", maxContentLength: 5 * 1024 * 1024, headers: { Accept: "application/rss+xml, application/atom+xml, text/xml", "User-Agent": USER_AGENT } });
  return extractXmlItems(response.data).slice(0, limit).map((item) => normalizeSignal(source, {
    sourceId: item.id || item.link,
    sourceUrl: item.link,
    title: item.title,
    excerpt: item.description,
    authorName: item.author,
    publishedAt: item.publishedAt,
    evidenceLabel: label,
  })).filter(Boolean);
}

async function searchRedditRss(monitor, limit) {
  const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(booleanQueryFor(monitor))}&sort=new&t=month`;
  return fetchFeed(url, "reddit_rss", "Public Reddit search feed", limit);
}

async function searchBingWeb(monitor, limit) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(booleanQueryFor(monitor))}&format=rss`;
  const signals = await fetchFeed(url, "bing_web", "Bing public web result feed", limit);
  return signals.map((signal) => {
    try { return { ...signal, organizationDomain: new URL(signal.sourceUrl).hostname.replace(/^www\./, "") }; }
    catch (_error) { return signal; }
  });
}

async function searchBingNews(monitor, limit) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(booleanQueryFor(monitor))}&format=rss`;
  const signals = await fetchFeed(url, "bing_news", "Bing public news result feed", limit);
  return signals.map((signal) => {
    try { return { ...signal, organizationDomain: new URL(signal.sourceUrl).hostname.replace(/^www\./, "") }; }
    catch (_error) { return signal; }
  });
}

async function searchSecFormD(monitor, limit) {
  const url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&company=&dateb=&owner=include&start=0&count=100&output=atom";
  const signals = await fetchFeed(url, "sec_form_d", "SEC EDGAR Form D filing", 100);
  const terms = termsFor(monitor, 12).map((term) => term.toLowerCase());
  const filtered = signals.filter((signal) => {
    const text = `${signal.title} ${signal.excerpt}`.toLowerCase();
    return !terms.length || terms.some((term) => text.includes(term));
  });
  return filtered.slice(0, limit);
}

async function searchConfiguredFeeds(monitor, limit) {
  const urls = (monitor.feedUrls || []).filter(Boolean).slice(0, 30);
  const groups = await Promise.allSettled(urls.map((url) => fetchFeed(url, url.includes("discourse") ? "discourse" : "rss", "Public RSS or Atom feed", limit)));
  return groups.flatMap((group) => group.status === "fulfilled" ? group.value : []);
}

function unwrapDuckDuckGoUrl(rawUrl) {
  try {
    const url = new URL(decodeEntities(rawUrl), "https://html.duckduckgo.com");
    return url.searchParams.get("uddg") || url.toString();
  } catch (_error) { return ""; }
}

async function searchDuckDuckGo(monitor, limit) {
  const response = await axios.get("https://html.duckduckgo.com/html/", {
    params: { q: booleanQueryFor(monitor) }, timeout: REQUEST_TIMEOUT, responseType: "text", maxContentLength: 4 * 1024 * 1024,
    headers: { Accept: "text/html", "User-Agent": USER_AGENT },
  });
  if (response.status !== 200 || /anomaly-modal|challenge-form|bots use duckduckgo/i.test(String(response.data || ""))) throw new Error("DuckDuckGo returned an automated-access challenge.");
  const matches = [...String(response.data || "").matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.slice(0, limit).map((match) => {
    const sourceUrl = unwrapDuckDuckGoUrl(match[1]);
    let domain = "";
    try { domain = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch (_error) {}
    return normalizeSignal("duckduckgo", { sourceId: sourceUrl, sourceUrl, title: match[2], organizationDomain: domain, evidenceLabel: "DuckDuckGo public search result" });
  }).filter(Boolean);
}

const ADAPTERS = {
  bing_web: searchBingWeb,
  bing_news: searchBingNews,
  gdelt: searchGdelt,
  sec_form_d: searchSecFormD,
  bluesky: searchBluesky,
  hacker_news: searchHackerNews,
  stack_exchange: searchStackExchange,
  reddit_rss: searchRedditRss,
  duckduckgo: searchDuckDuckGo,
};

async function collectMonitorSignals(monitor) {
  const limit = Math.min(100, Math.max(5, Number(monitor.maxResultsPerSource) || 25));
  const selected = monitor.sources?.length ? monitor.sources : ["bing_web", "bing_news", "gdelt", "sec_form_d", "bluesky", "hacker_news", "stack_exchange", "reddit_rss", "duckduckgo"];
  const work = selected.filter((source) => ADAPTERS[source]).map(async (source) => ({ source, signals: await ADAPTERS[source](monitor, limit) }));
  if ((monitor.feedUrls || []).length) work.push(searchConfiguredFeeds(monitor, limit).then((signals) => ({ source: "feeds", signals })));
  const settled = await Promise.allSettled(work);
  const sourceOrder = [...selected.filter((source) => ADAPTERS[source]), ...((monitor.feedUrls || []).length ? ["feeds"] : [])];
  const failures = settled.map((item, index) => ({ item, source: sourceOrder[index] || "feeds" })).filter(({ item }) => item.status === "rejected");
  return {
    groups: settled.filter((item) => item.status === "fulfilled").map((item) => item.value),
    errors: failures.map(({ item, source }) => `${source}: ${item.reason?.response?.status || item.reason?.message || "source failed"}`),
    failures: failures.map(({ item, source }) => {
      const status = item.reason?.response?.status;
      const message = String(status || item.reason?.message || "Source failed");
      return { source, message, state: status === 429 ? "rate_limited" : /challenge|blocked|forbidden|403/i.test(message) ? "blocked" : "failed" };
    }),
  };
}

module.exports = { booleanQueryFor, collectMonitorSignals, extractXmlItems, normalizeSignal, queryFor, termsFor };
