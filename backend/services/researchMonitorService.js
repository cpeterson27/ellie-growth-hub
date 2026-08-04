const IntentSignal = require("../models/IntentSignal");
const ResearchMonitor = require("../models/ResearchMonitor");
const { collectMonitorSignals } = require("./intentSourceService");
const { researchPublicWebsite } = require("./publicWebsiteResearchService");

const RUNNER_INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let running = false;

function scoreSignal(signal, monitor) {
  const content = `${signal.title || ""} ${signal.excerpt || ""}`.toLowerCase();
  const positive = [...(monitor.keywords || []), ...(monitor.locations || [])].map((value) => String(value).toLowerCase()).filter(Boolean);
  const negative = (monitor.negativeKeywords || []).map((value) => String(value).toLowerCase()).filter(Boolean);
  const matched = positive.filter((keyword) => content.includes(keyword));
  const excluded = negative.filter((keyword) => content.includes(keyword));
  let score = 20 + Math.min(50, matched.length * 12);
  const reasons = matched.map((keyword) => `Matched “${keyword}”`);
  if (signal.authorName) { score += 5; reasons.push("Public author identity available"); }
  if (signal.organizationDomain) { score += 10; reasons.push("Organization domain available"); }
  if (signal.publishedAt && Date.now() - new Date(signal.publishedAt).valueOf() < 7 * 86400000) { score += 10; reasons.push("Recent signal"); }
  if (excluded.length) { score = Math.max(0, score - 60); reasons.push(`Excluded terms: ${excluded.join(", ")}`); }
  return { score: Math.min(100, score), reasons, matched };
}

async function runResearchMonitor(monitorId) {
  const monitor = await ResearchMonitor.findById(monitorId);
  if (!monitor || !monitor.enabled || monitor.lastRunStatus === "running") return monitor;
  monitor.lastRunStatus = "running";
  monitor.lastRunAt = new Date();
  await monitor.save();
  try {
    const collected = await collectMonitorSignals(monitor.toObject());
    let found = 0;
    let qualified = 0;
    const websiteCandidates = [];
    for (const group of collected.groups) {
      for (const signal of group.signals) {
        const ranking = scoreSignal(signal, monitor);
        if (!ranking.matched.length || ranking.score < 30) continue;
        const saved = await IntentSignal.findOneAndUpdate(
          { workspaceId: monitor.workspaceId, source: signal.source, sourceId: signal.sourceId },
          { $setOnInsert: { workspaceId: monitor.workspaceId, monitorId: monitor._id, ...signal }, $set: { matchedKeywords: ranking.matched, score: ranking.score, scoreReasons: ranking.reasons, discoveredAt: new Date() } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        found += 1;
        if (saved.score >= 55) qualified += 1;
        const researchUrl = ["duckduckgo", "bing_web"].includes(signal.source) ? signal.sourceUrl : signal.source === "hacker_news" ? signal.raw?.storyUrl : "";
        if (saved.score >= 55 && researchUrl && websiteCandidates.length < 8) websiteCandidates.push({ signalId: saved._id, url: researchUrl });
      }
    }
    for (const candidate of websiteCandidates) {
      try {
        await IntentSignal.updateOne({ _id: candidate.signalId }, { $set: { websiteResearchStatus: "pending" } });
        const research = await researchPublicWebsite(candidate.url);
        await IntentSignal.updateOne({ _id: candidate.signalId }, {
          $set: { websiteResearchStatus: research.status, publishedEmails: research.emails, people: research.people },
          $addToSet: { evidence: { $each: research.evidence } },
        });
      } catch (_error) {
        await IntentSignal.updateOne({ _id: candidate.signalId }, { $set: { websiteResearchStatus: "failed" } });
      }
    }
    monitor.lastRunStatus = collected.errors.length ? "partial" : "completed";
    monitor.lastRunMessage = collected.errors.length ? `${found} signals collected. ${collected.errors.length} source(s) unavailable: ${collected.errors.slice(0, 3).join("; ")}` : `${found} signals collected from ${collected.groups.length} sources.`;
    monitor.totals.runs += 1;
    monitor.totals.signalsFound += found;
    monitor.totals.signalsQualified += qualified;
    monitor.nextRunAt = new Date(Date.now() + monitor.intervalMinutes * 60000);
    await monitor.save();
    return monitor;
  } catch (error) {
    monitor.lastRunStatus = "failed";
    monitor.lastRunMessage = error.message || "Monitoring failed.";
    monitor.nextRunAt = new Date(Date.now() + Math.max(15, monitor.intervalMinutes) * 60000);
    await monitor.save();
    return monitor;
  }
}

async function runDueResearchMonitors() {
  if (running) return;
  running = true;
  try {
    const due = await ResearchMonitor.find({ enabled: true, nextRunAt: { $lte: new Date() }, lastRunStatus: { $ne: "running" } }).sort({ nextRunAt: 1 }).limit(10).select("_id");
    for (const monitor of due) await runResearchMonitor(monitor._id);
  } finally { running = false; }
}

function startResearchMonitorRunner() {
  if (timer || process.env.RESEARCH_MONITOR_ENABLED === "false") return;
  timer = setInterval(() => runDueResearchMonitors().catch((error) => console.error("Research monitor runner failed:", error.message)), RUNNER_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => runDueResearchMonitors().catch(() => {}), 15000).unref?.();
}

module.exports = { runResearchMonitor, runDueResearchMonitors, startResearchMonitorRunner, scoreSignal };
