const express = require("express");
const IntegrationConnection = require("../models/IntegrationConnection");
const Outreach = require("../models/Outreach");
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

router.get("/threads/:threadId", async (req, res) => {
  try { res.json(await gmail.getThread(req.params.threadId)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/threads/:threadId/action", async (req, res) => {
  try {
    await gmail.modifyThread(req.params.threadId, req.body?.action);
    res.json({ success: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/send", async (req, res) => {
  try {
    const result = await gmail.sendMessage(req.body || {});
    res.json({ success: true, messageId: result.id, threadId: result.threadId });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post("/sync-outreach-replies", async (_req, res) => {
  try {
    const sent = await Outreach.find({ status: "sent", contactEmail: { $ne: "" } }).select("contactEmail sentAt");
    if (!sent.length) return res.json({ success: true, repliesFound: 0 });
    const emails = [...new Set(sent.map((item) => item.contactEmail.toLowerCase()))];
    const search = emails.slice(0, 40).map((email) => `from:${email}`).join(" OR ");
    const { threads } = await gmail.listThreads({ query: `in:inbox newer_than:1y (${search})`, maxResults: 50 });
    let repliesFound = 0;
    for (const thread of threads) {
      const sender = String(thread.from || "").match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase();
      if (!sender || !emails.includes(sender)) continue;
      const receivedAt = thread.date ? new Date(thread.date) : new Date();
      const result = await Outreach.updateMany(
        { contactEmail: sender, status: "sent", sentAt: { $lte: receivedAt } },
        { $set: { status: "replied", repliedAt: receivedAt, replyText: thread.snippet || "" } },
      );
      repliesFound += result.modifiedCount;
    }
    res.json({ success: true, repliesFound });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get("/contact-history", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "A contact email is required" });
    const outreach = await Outreach.find({ contactEmail: email })
      .populate("campaignId", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      outreach: outreach.map((item) => ({
        id: item._id,
        campaignName: item.campaignId?.name || "Campaign outreach",
        subject: item.subject,
        body: item.emailDraft,
        htmlBody: item.htmlBody,
        status: item.status,
        sentAt: item.sentAt,
        repliedAt: item.repliedAt,
        replyText: item.replyText,
      })),
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
