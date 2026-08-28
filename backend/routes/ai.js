const express = require("express");
const aiConfigService = require("../services/aiConfigService");
const aiUsageService = require("../services/aiUsageService");

function requireAiAdministrator(req, res, next) {
  const roles = new Set([...(req.auth?.roles || []), req.auth?.role].filter(Boolean));
  if (req.auth?.isPlatformOwner || roles.has("owner") || roles.has("admin")) return next();
  return res.status(403).json({ error: "Owner or Admin access is required", code: "AI_ADMIN_REQUIRED" });
}

function createAiRouter(dependencies = {}) {
  const router = express.Router();
  const configService = dependencies.aiConfigService || aiConfigService;
  const usageService = dependencies.aiUsageService || aiUsageService;

  router.use(requireAiAdministrator);
  router.get("/usage/summary", async (req, res) => {
    try {
      return res.json({ success: true, data: await usageService.summary(req.auth.workspaceId) });
    } catch (error) {
      return res.status(500).json({ error: "AI usage could not be loaded", code: "AI_USAGE_SUMMARY_FAILED" });
    }
  });
  router.get("/config", async (req, res) => {
    try {
      return res.json({ success: true, data: await configService.get(req.auth.workspaceId) });
    } catch (error) {
      return res.status(500).json({ error: "AI configuration could not be loaded", code: "AI_CONFIG_READ_FAILED" });
    }
  });
  router.patch("/config", async (req, res) => {
    try {
      return res.json({ success: true, data: await configService.save(req.auth.workspaceId, req.body || {}) });
    } catch (error) {
      return res.status(400).json({ error: error.message || "AI configuration could not be saved", code: error.code || "AI_CONFIG_SAVE_FAILED" });
    }
  });
  return router;
}

const router = createAiRouter();
module.exports = router;
module.exports.createAiRouter = createAiRouter;
module.exports.requireAiAdministrator = requireAiAdministrator;
