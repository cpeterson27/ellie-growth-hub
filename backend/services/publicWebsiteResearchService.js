const axios = require("axios");
const dns = require("node:dns").promises;
const net = require("node:net");

const USER_AGENT = "GrowthOperatorResearchBot/1.0 (+https://ellie-ai-backend.onrender.com/gpt-actions/privacy; support@elliescoaching.com)";
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ROLE_LINK_PATTERN = /(?:about|team|leadership|people|management|founder|contact)/i;

async function safeUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only public HTTP websites can be researched.");
  const addresses = await dns.lookup(url.hostname, { all: true });
  for (const { address } of addresses) {
    if ((net.isIPv4(address) && PRIVATE_IPV4.test(address)) || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80")) throw new Error("Private-network URLs are blocked.");
  }
  return url;
}

function plainText(html) {
  return String(html || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;/g, " ").replace(/\s+/g, " ").trim();
}

function pageLinks(html, baseUrl) {
  const links = [...String(html || "").matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
    try { return { url: new URL(match[1], baseUrl), label: plainText(match[2]) }; } catch (_error) { return null; }
  }).filter(Boolean);
  const base = new URL(baseUrl);
  return [...new Map(links.filter((link) => link.url.hostname === base.hostname && ROLE_LINK_PATTERN.test(`${link.label} ${link.url.pathname}`)).map((link) => [link.url.toString(), link.url])).values()].slice(0, 4);
}

function jsonLdPeople(html, evidenceUrl) {
  const people = [];
  for (const match of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) { queue.push(...item); continue; }
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (types.includes("Person") && item.name) people.push({ name: String(item.name), title: String(item.jobTitle || ""), evidenceUrl });
        for (const value of Object.values(item)) if (value && typeof value === "object") queue.push(value);
      }
    } catch (_error) {}
  }
  return people;
}

async function robotsAllows(origin, pathname) {
  try {
    const response = await axios.get(`${origin}/robots.txt`, { timeout: 6000, responseType: "text", maxContentLength: 256000, headers: { "User-Agent": USER_AGENT } });
    const lines = String(response.data || "").split(/\r?\n/);
    let applies = false;
    for (const rawLine of lines) {
      const line = rawLine.split("#")[0].trim();
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) applies = value === "*" || /GrowthOperatorResearchBot/i.test(value);
      if (applies && /^disallow$/i.test(key) && value && pathname.startsWith(value)) return false;
    }
  } catch (_error) {}
  return true;
}

async function fetchPublicPage(url) {
  let parsed = await safeUrl(url);
  let response;
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    if (!(await robotsAllows(parsed.origin, parsed.pathname))) return { blocked: true, url: parsed.toString(), html: "" };
    response = await axios.get(parsed.toString(), { timeout: 15000, responseType: "text", maxContentLength: 2 * 1024 * 1024, maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400, headers: { Accept: "text/html", "User-Agent": USER_AGENT } });
    if (response.status < 300) break;
    const location = response.headers.location;
    if (!location || redirect === 4) throw new Error("The public website redirected too many times.");
    parsed = await safeUrl(new URL(location, parsed).toString());
  }
  if (!String(response.headers["content-type"] || "").includes("text/html")) throw new Error("The public source was not an HTML page.");
  return { blocked: false, url: parsed.toString(), html: String(response.data || "") };
}

async function researchPublicWebsite(startUrl) {
  const first = await fetchPublicPage(startUrl);
  if (first.blocked) return { status: "blocked", emails: [], people: [], evidence: [] };
  const targets = [new URL(first.url), ...pageLinks(first.html, first.url)];
  const pages = [first];
  for (const target of targets.slice(1, 5)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const page = await fetchPublicPage(target.toString());
      if (!page.blocked) pages.push(page);
    } catch (_error) {}
  }
  const emails = [...new Set(pages.flatMap((page) => plainText(page.html).match(EMAIL_PATTERN) || []).map((email) => email.toLowerCase()).filter((email) => !/example\.(?:com|org)|sentry|wixpress|cloudflare/i.test(email)))].slice(0, 20);
  const people = [...new Map(pages.flatMap((page) => jsonLdPeople(page.html, page.url)).map((person) => [`${person.name}|${person.title}`, person])).values()].slice(0, 25);
  return { status: "completed", emails, people, evidence: pages.map((page) => ({ label: "Public company website", url: page.url, observedAt: new Date() })) };
}

module.exports = { pageLinks, plainText, researchPublicWebsite, safeUrl };
