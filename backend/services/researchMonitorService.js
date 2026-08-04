const crypto = require("node:crypto");
const os = require("node:os");
const OpenAI = require("openai");
const IntentSignal = require("../models/IntentSignal");
const ResearchMonitor = require("../models/ResearchMonitor");
const MonitorActivity = require("../models/MonitorActivity");
const InAppNotification = require("../models/InAppNotification");
const { collectMonitorSignals } = require("./intentSourceService");
const { researchPublicWebsite } = require("./publicWebsiteResearchService");

const RUNNER_INTERVAL_MS = Math.max(15000, Number(process.env.RESEARCH_WORKER_POLL_MS) || 60000);
const LEASE_MS = Math.max(120000, Number(process.env.RESEARCH_WORKER_LEASE_MS) || 20 * 60000);
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
let timer = null;
let polling = false;

function scoreSignal(signal, monitor) {
  const content = `${signal.title || ""} ${signal.excerpt || ""}`.toLowerCase();
  const categoryPhrases = (monitor.intentCategories || []).flatMap((category) => category.phrases || []);
  const positive = [...(monitor.keywords || []), ...categoryPhrases, ...(monitor.locations || [])].map((value) => String(value).toLowerCase()).filter(Boolean);
  const negative = (monitor.negativeKeywords || []).map((value) => String(value).toLowerCase()).filter(Boolean);
  const matched = positive.filter((keyword) => content.includes(keyword));
  const excluded = negative.filter((keyword) => content.includes(keyword));
  let score = 20 + Math.min(50, matched.length * 12);
  const reasons = matched.map((keyword) => `Matched “${keyword}”`);
  if (signal.authorName) { score += 5; reasons.push("Public author identity available"); }
  if (signal.organizationDomain) { score += 10; reasons.push("Public organization domain available"); }
  if (signal.publishedAt && Date.now() - new Date(signal.publishedAt).valueOf() < 7 * 86400000) { score += 10; reasons.push("Recent signal"); }
  if (excluded.length) { score = Math.max(0, score - 60); reasons.push(`Excluded terms: ${excluded.join(", ")}`); }
  return { score: Math.min(100, score), reasons, matched };
}

function rulesClassify(signal) {
  const text = `${signal.title || ""} ${signal.excerpt || ""}`.toLowerCase();
  const patterns = [
    ["hypothetical_or_student", /assignment|homework|student|case study|hypothetical|for a class/],
    ["promotion", /my course|our service|book a call|limited offer|use my code|subscribe|we help/],
    ["job_seeker", /looking for (a )?job|seeking employment|resume|hiring|open to work/],
    ["buyer_intent", /i need|looking for|recommend|how (do|can) i|ready to|want to|planning to|help me/],
  ];
  const match = patterns.find(([, pattern]) => pattern.test(text));
  return { classification: match?.[0] || "uncertain", method: "rules", reason: match ? "Matched a transparent rules-based intent pattern." : "No decisive buyer or exclusion pattern was present." };
}

async function classifySignal(signal) {
  const fallback = rulesClassify(signal);
  if (process.env.JARVIS_OPENAI_ENABLED !== "true" || !process.env.OPENAI_API_KEY?.trim()) return fallback;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
    const response = await client.chat.completions.create({
      model: process.env.INTENT_CLASSIFICATION_OPENAI_MODEL || process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: "Classify public content into exactly one category: buyer_intent, hypothetical_or_student, promotion, job_seeker, irrelevant, uncertain. Buyer intent requires first-person or clearly attributable evidence of a real current need. Return JSON with classification and a short reason. Do not infer identity or company affiliation." },
        { role: "user", content: JSON.stringify({ title: signal.title || "", excerpt: signal.excerpt || "", source: signal.source }) },
      ],
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || "{}");
    const allowed = new Set(["buyer_intent", "hypothetical_or_student", "promotion", "job_seeker", "irrelevant", "uncertain"]);
    if (!allowed.has(parsed.classification)) return fallback;
    return { classification: parsed.classification, method: "openai", reason: String(parsed.reason || "AI classification completed.").slice(0, 500) };
  } catch (_error) { return fallback; }
}

function identityResolution(signal) {
  const evidenceUrls = (signal.evidence || []).map((item) => item.url).filter(Boolean);
  const hasAuthorEvidence = Boolean(signal.authorName && (signal.authorUrl || evidenceUrls.length));
  const hasOrganizationEvidence = Boolean(signal.organizationDomain && evidenceUrls.some((url) => {
    try { return new URL(url).hostname.replace(/^www\./, "") === signal.organizationDomain; } catch (_error) { return false; }
  }));
  if (hasAuthorEvidence && (!signal.organizationDomain || hasOrganizationEvidence)) return { status: "supported", reason: hasOrganizationEvidence ? "The public source supports both the author and organization domain." : "The public source supports the displayed author only; no company affiliation was inferred.", evidenceUrls };
  return { status: "unresolved", reason: "A username, person, or company is displayed only where public evidence directly supports it. Affiliation remains unresolved.", evidenceUrls };
}

async function activity(monitor, runId, type, message, count = 0, details = {}) {
  return MonitorActivity.create({ workspaceId: monitor.workspaceId, monitorId: monitor._id, runId, type, message, count, details });
}
async function notify(monitor, type, title, message, signalId = null) {
  return InAppNotification.create({ workspaceId: monitor.workspaceId, userId: monitor.userId, monitorId: monitor._id, signalId, type, title, message });
}

async function acquireMonitor(monitorId) {
  const now = new Date();
  return ResearchMonitor.findOneAndUpdate({ _id: monitorId, enabled: true, $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }] }, { $set: { leaseOwner: WORKER_ID, leaseExpiresAt: new Date(Date.now() + LEASE_MS), lastRunStatus: "running", lastRunAt: now }, $unset: { runRequestedAt: 1 } }, { new: true });
}

async function runResearchMonitor(monitorId) {
  const monitor = await acquireMonitor(monitorId);
  if (!monitor) return null;
  const runId = crypto.randomUUID();
  await activity(monitor, runId, "run_started", "Monitoring run started.");
  try {
    const collected = await collectMonitorSignals(monitor.toObject());
    const candidates = collected.groups.reduce((sum, group) => sum + group.signals.length, 0);
    await activity(monitor, runId, "sources_checked", `Checked ${collected.groups.length + collected.failures.length} sources.`, collected.groups.length + collected.failures.length);
    await activity(monitor, runId, "candidates_collected", `Collected ${candidates} public candidates.`, candidates);
    let found = 0; let qualified = 0; let rejected = 0;
    const websiteCandidates = [];
    for (const group of collected.groups) {
      for (const signal of group.signals) {
        const ranking = scoreSignal(signal, monitor);
        if (!ranking.matched.length || ranking.score < 30) { rejected += 1; continue; }
        const classification = await classifySignal(signal);
        if (["hypothetical_or_student", "promotion", "job_seeker", "irrelevant"].includes(classification.classification)) { rejected += 1; continue; }
        const saved = await IntentSignal.findOneAndUpdate(
          { workspaceId: monitor.workspaceId, source: signal.source, sourceId: signal.sourceId },
          { $setOnInsert: { workspaceId: monitor.workspaceId, monitorId: monitor._id, ...signal }, $set: { matchedKeywords: ranking.matched, score: ranking.score, scoreReasons: ranking.reasons, discoveredAt: new Date(), classification: classification.classification, classificationMethod: classification.method, classificationReason: classification.reason, identityResolution: identityResolution(signal) } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        found += 1;
        if (ranking.score >= 60) qualified += 1;
        if (["bing_web", "duckduckgo"].includes(signal.source) && signal.organizationDomain && ranking.score >= 55) websiteCandidates.push({ signalId: saved._id, domain: signal.organizationDomain });
        if (ranking.score >= 75) await notify(monitor, "high_scoring_lead", "High-scoring lead found", `${saved.title || "A public signal"} scored ${ranking.score}.`, saved._id);
      }
    }
    await activity(monitor, runId, "weak_matches_rejected", `Rejected ${rejected} weak or non-buyer matches.`, rejected);
    let websitesResearched = 0;
    for (const candidate of websiteCandidates.slice(0, 10)) {
      try {
        await IntentSignal.updateOne({ _id: candidate.signalId }, { $set: { websiteResearchStatus: "pending" } });
        const research = await researchPublicWebsite(`https://${candidate.domain}`);
        const publishedEmails = research.emails || [];
        await IntentSignal.updateOne({ _id: candidate.signalId }, { $set: { publishedEmails, people: research.people || [], websiteResearchStatus: research.status || "completed" }, $addToSet: { evidence: { $each: research.evidence || [] } } });
        websitesResearched += 1;
        if (publishedEmails.length) await notify(monitor, "published_email", "Published email found", `A public website listed ${publishedEmails.length} email address${publishedEmails.length === 1 ? "" : "es"}. They remain unverified.`, candidate.signalId);
      } catch (_error) { await IntentSignal.updateOne({ _id: candidate.signalId }, { $set: { websiteResearchStatus: "failed" } }); }
    }
    await activity(monitor, runId, "websites_researched", `Researched ${websitesResearched} public websites.`, websitesResearched);
    await activity(monitor, runId, "leads_prepared", `Prepared ${found} leads for individual review.`, found);
    for (const failure of collected.failures) {
      await activity(monitor, runId, "source_failure", `${failure.source} failed: ${failure.message}`, 1, failure);
      await notify(monitor, "source_failure", "Monitoring source needs attention", `${failure.source}: ${failure.message}`);
    }
    const nextRunAt = new Date(Date.now() + monitor.intervalMinutes * 60000);
    const priorHealth = new Map((monitor.sourceHealth || []).map((item) => [item.source, item.toObject ? item.toObject() : item]));
    for (const group of collected.groups) priorHealth.set(group.source, { source: group.source, enabled: true, lastSuccessfulCheck: new Date(), lastErrorAt: priorHealth.get(group.source)?.lastErrorAt || null, lastError: "", resultsCollected: (priorHealth.get(group.source)?.resultsCollected || 0) + group.signals.length, state: "healthy", nextScheduledAttempt: nextRunAt });
    for (const failure of collected.failures) priorHealth.set(failure.source, { source: failure.source, enabled: true, lastSuccessfulCheck: priorHealth.get(failure.source)?.lastSuccessfulCheck || null, lastErrorAt: new Date(), lastError: failure.message, resultsCollected: priorHealth.get(failure.source)?.resultsCollected || 0, state: failure.state, nextScheduledAttempt: nextRunAt });
    monitor.lastRunStatus = collected.failures.length ? "partial" : "completed";
    monitor.lastRunMessage = `${found} leads prepared; ${rejected} weak matches rejected${collected.failures.length ? `; ${collected.failures.length} source failure(s)` : ""}.`;
    monitor.totals.runs += 1; monitor.totals.signalsFound += found; monitor.totals.signalsQualified += qualified;
    monitor.nextRunAt = nextRunAt; monitor.sourceHealth = [...priorHealth.values()]; monitor.leaseOwner = ""; monitor.leaseExpiresAt = null;
    await monitor.save();
    await activity(monitor, runId, "run_completed", monitor.lastRunMessage, found);
    await notify(monitor, "monitor_complete", "Monitor completed", monitor.lastRunMessage);
    return monitor;
  } catch (error) {
    monitor.lastRunStatus = "failed"; monitor.lastRunMessage = error.message || "Monitoring failed."; monitor.nextRunAt = new Date(Date.now() + Math.max(15, monitor.intervalMinutes) * 60000); monitor.leaseOwner = ""; monitor.leaseExpiresAt = null;
    await monitor.save();
    await activity(monitor, runId, "run_completed", `Run failed: ${monitor.lastRunMessage}`);
    return monitor;
  }
}

async function requestResearchMonitorRun(monitorId) {
  return ResearchMonitor.findByIdAndUpdate(monitorId, { $set: { runRequestedAt: new Date(), nextRunAt: new Date() } }, { new: true });
}

async function runDueResearchMonitors() {
  if (polling) return;
  polling = true;
  try {
    const now = new Date();
    await ResearchMonitor.updateMany({ lastRunStatus: "running", leaseExpiresAt: { $lte: now } }, { $set: { lastRunStatus: "failed", lastRunMessage: "A previous worker stopped unexpectedly; the run was safely released for retry.", nextRunAt: now, leaseOwner: "", leaseExpiresAt: null } });
    const due = await ResearchMonitor.find({ enabled: true, $and: [{ $or: [{ runRequestedAt: { $lte: now } }, { nextRunAt: { $lte: now } }] }, { $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }] }] }).sort({ runRequestedAt: 1, nextRunAt: 1 }).limit(10).select("_id");
    for (const monitor of due) await runResearchMonitor(monitor._id);
  } finally { polling = false; }
}

function startResearchMonitorRunner() {
  if (timer) return timer;
  timer = setInterval(() => runDueResearchMonitors().catch((error) => console.error("Research worker failed:", error.message)), RUNNER_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => runDueResearchMonitors().catch(() => {}), 1000).unref?.();
  return timer;
}

module.exports = { classifySignal, requestResearchMonitorRun, runResearchMonitor, runDueResearchMonitors, startResearchMonitorRunner, scoreSignal };
