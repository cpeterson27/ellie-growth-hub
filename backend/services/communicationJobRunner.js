const { processDueJobs } = require("./coachingCommunicationService");

let timer = null;
let running = false;
async function runDueCommunicationJobs() {
  if (running) return [];
  running = true;
  try { return await processDueJobs({ limit: 100 }); }
  finally { running = false; }
}
function startCommunicationJobRunner({ force = false } = {}) {
  if (timer || (!force && process.env.COMMUNICATION_WORKER_MODE === "external")) return timer;
  const interval = Math.max(15000, Number(process.env.COMMUNICATION_WORKER_INTERVAL_MS) || 60000);
  timer = setInterval(() => runDueCommunicationJobs().catch((error) => console.error("Communication worker failed:", error.message)), interval);
  timer.unref?.();
  return timer;
}
function stopCommunicationJobRunner() { if (timer) clearInterval(timer); timer = null; }
module.exports = { runDueCommunicationJobs, startCommunicationJobRunner, stopCommunicationJobRunner };
