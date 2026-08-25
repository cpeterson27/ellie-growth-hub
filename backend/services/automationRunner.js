const { runAutomationCycle } = require("./automationEngineService");
let timer = null; let running = false;
async function runDueAutomations() { if (running) return []; running = true; try { return await runAutomationCycle({ limit: 100 }); } finally { running = false; } }
function startAutomationRunner({ force = false } = {}) { if (timer || (!force && process.env.AUTOMATION_WORKER_MODE === "external")) return timer; const interval = Math.max(15000, Number(process.env.AUTOMATION_WORKER_INTERVAL_MS) || 60000); timer = setInterval(() => runDueAutomations().catch((error) => console.error("Automation worker failed:", error.message)), interval); timer.unref?.(); return timer; }
function stopAutomationRunner() { if (timer) clearInterval(timer); timer = null; }
module.exports = { runDueAutomations, startAutomationRunner, stopAutomationRunner };
