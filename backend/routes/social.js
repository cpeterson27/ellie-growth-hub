const express = require("express");
const { requireRole } = require("../middleware/auth");
const socialOAuth = require("../services/socialOAuthService");
const metaDeauthorization = require("../services/metaDeauthorizationService");

const router = express.Router();
const PROVIDERS = new Set(require("../services/socialProviderConfig").SOCIAL_PROVIDERS);

function provider(req, res) {
  const value = String(req.params.provider || "").toLowerCase();
  if (!PROVIDERS.has(value)) {
    res.status(404).json({ error: "Social provider not found" });
    return null;
  }
  return value;
}

function frontendRedirect(params) {
  const frontend = String(process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
  return `${frontend}/integrations?${new URLSearchParams(params)}`;
}

router.post("/meta/deauthorize", async (req, res) => {
  try {
    await metaDeauthorization.deauthorize(req.body?.signed_request);
    return res.status(200).json({ success: true });
  } catch (error) {
    const status = /not configured/i.test(error.message) ? 503 : 400;
    return res.status(status).json({ error: status === 503 ? "Meta deauthorization is unavailable" : "Invalid signed_request" });
  }
});

router.get("/:provider/oauth/status", async (req, res, next) => {
  try {
    const id = provider(req, res);
    if (!id) return;
    return res.json(await socialOAuth.status(req.auth.workspaceId, id));
  } catch (error) { return next(error); }
});

router.get("/:provider/oauth/start", requireRole("owner", "admin"), (req, res) => {
  const id = provider(req, res);
  if (!id) return;
  try {
    return res.json({ authorizationUrl: socialOAuth.authorizationUrl(id, req.auth) });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Social OAuth is not configured" });
  }
});

router.get("/:provider/oauth/callback", async (req, res) => {
  const id = provider(req, res);
  if (!id) return;
  if (req.query.error) return res.redirect(frontendRedirect({ social: id, status: "denied", message: "Authorization was declined or unavailable." }));
  if (!req.query.code || !req.query.state) return res.redirect(frontendRedirect({ social: id, status: "failed", message: "The provider did not return an authorization code." }));
  try {
    await socialOAuth.exchangeCode(id, String(req.query.code), String(req.query.state));
    return res.redirect(frontendRedirect({ social: id, status: "connected" }));
  } catch (error) {
    const safeError = socialOAuth.safeProviderError(error, "Social connection failed");
    console.error(`[social oauth] ${id} callback failed: ${safeError}`);
    return res.redirect(frontendRedirect({ social: id, status: "failed", message: safeError }));
  }
});

router.patch("/:provider/assets", requireRole("owner", "admin"), async (req, res) => {
  const id = provider(req, res);
  if (!id) return;
  try {
    const connection = await socialOAuth.selectAssets(req.auth.workspaceId, id, req.body?.assetIds);
    return res.json({ success: true, connection });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post("/instagram/oauth/refresh", requireRole("owner", "admin"), async (req, res) => {
  try { return res.json(await socialOAuth.refreshInstagram(req.auth.workspaceId)); }
  catch { return res.status(400).json({ error: "Instagram authorization could not be refreshed. It must be unexpired and at least 24 hours old. Reconnect if necessary." }); }
});

router.post("/:provider/oauth/disconnect", requireRole("owner", "admin"), async (req, res, next) => {
  const id = provider(req, res);
  if (!id) return;
  try { return res.json(await socialOAuth.disconnect(req.auth.workspaceId, id)); }
  catch (error) { return next(error); }
});

module.exports = router;
