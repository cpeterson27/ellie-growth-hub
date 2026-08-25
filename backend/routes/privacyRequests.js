const express = require("express");
const PrivacyRequest = require("../models/PrivacyRequest");
const service = require("../services/privacyRequestService");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireRole("owner", "admin"));

router.get("/", async (req, res, next) => {
  try { const rows = await PrivacyRequest.find({ workspaceId: req.auth.workspaceId }).sort({ createdAt: -1 }).limit(200).lean(); res.json({ success: true, data: rows }); }
  catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try { const request = await PrivacyRequest.findOne({ _id: req.params.id, workspaceId: req.auth.workspaceId }).lean(); if (!request) return res.status(404).json({ error: "Privacy request not found" }); const candidates = await service.candidates(req.auth.workspaceId, request); return res.json({ success: true, data: { request, candidates, confirmationPhrase: service.CONFIRMATION } }); }
  catch (error) { return next(error); }
});

router.patch("/:id/status", async (req, res) => {
  try { const request = await service.transition({ workspaceId: req.auth.workspaceId, requestId: req.params.id, action: req.body?.action, notes: req.body?.notes, userId: req.auth.userId }); return res.json({ success: true, data: request }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post("/:id/approve", async (req, res) => {
  try { const result = await service.approve({ workspaceId: req.auth.workspaceId, requestId: req.params.id, contactIds: req.body?.contactIds, categories: req.body?.categories, confirmation: req.body?.confirmation, userId: req.auth.userId }); return res.json({ success: true, data: result }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
});

module.exports = router;
