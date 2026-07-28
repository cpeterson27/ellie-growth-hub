const express = require("express");
const IntegrationConnection = require("../models/IntegrationConnection");
const gmail = require("../services/gmailOAuthService");
const router = express.Router();

router.get("/status", async (_req, res) => {
  try { res.json(await gmail.status()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get("/oauth/start", (_req, res) => {
  try { res.json({ authorizationUrl: gmail.authorizationUrl() }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.get("/oauth/callback", async (req, res) => {
  const frontend = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  try {
    if (!gmail.verifyState(req.query.state)) throw new Error("Google connection request expired or is invalid");
    if (!req.query.code) throw new Error(req.query.error || "Google did not return an authorization code");
    const tokens = await gmail.exchangeCode(req.query.code);
    const profile = await gmail.googleProfile(tokens.access_token);
    await gmail.saveConnection(tokens, profile);
    res.redirect(`${frontend}/integrations?gmail=connected`);
  } catch (error) {
    res.redirect(`${frontend}/integrations?gmail=error&message=${encodeURIComponent(error.message)}`);
  }
});

router.post("/disconnect", async (_req, res) => {
  await IntegrationConnection.findOneAndUpdate(
    { provider: "gmail" },
    { $set: { status: "disconnected", credentialsEncrypted: null, connectedAt: null, oauth: {} } },
  );
  res.json({ success: true });
});

router.get("/threads", async (req, res) => {
  try { res.json(await gmail.listThreads({ query: req.query.q || "in:inbox", maxResults: Number(req.query.limit || 20) })); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/send", async (req, res) => {
  try {
    const result = await gmail.sendMessage(req.body || {});
    res.json({ success: true, messageId: result.id, threadId: result.threadId });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
