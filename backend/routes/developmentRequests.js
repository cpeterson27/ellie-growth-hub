const crypto = require("crypto");
const express = require("express");
const DevelopmentRequest = require("../models/DevelopmentRequest");
const { buildCodexBrief } = require("../services/developmentRequestService");

const router = express.Router();

function hasApprovalAccess(req) {
  const provided = String(req.get("x-development-approval-secret") || "");
  const expected = String(process.env.DEVELOPMENT_APPROVAL_SECRET || "");
  if (!provided || !expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

router.use((req, res, next) => {
  if (!process.env.DEVELOPMENT_APPROVAL_SECRET) {
    return res.status(503).json({ success: false, error: "Development approval is not configured" });
  }
  if (!hasApprovalAccess(req)) {
    return res.status(401).json({ success: false, error: "Developer approval secret is invalid" });
  }
  return next();
});

router.get("/", async (req, res) => {
  try {
    const status = req.query.status;
    const filter = status ? { status } : {};
    const requests = await DevelopmentRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: requests });
  } catch {
    res.status(500).json({ success: false, error: "Unable to load development requests" });
  }
});

router.patch("/:id/approve", async (req, res) => {
  try {
    const request = await DevelopmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: "Development request not found" });
    if (request.status !== "pending_approval") {
      return res.status(409).json({ success: false, error: "Only pending requests can be approved" });
    }
    request.status = "approved";
    request.approvalNote = String(req.body?.note || "").trim();
    request.approvedAt = new Date();
    request.codexBrief = buildCodexBrief(request);
    await request.save();
    return res.json({ success: true, data: request.toObject() });
  } catch {
    return res.status(400).json({ success: false, error: "Unable to approve development request" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    const request = await DevelopmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: "Development request not found" });
    if (request.status !== "pending_approval") {
      return res.status(409).json({ success: false, error: "Only pending requests can be rejected" });
    }
    request.status = "rejected";
    request.approvalNote = String(req.body?.note || "").trim();
    request.rejectedAt = new Date();
    await request.save();
    return res.json({ success: true, data: request.toObject() });
  } catch {
    return res.status(400).json({ success: false, error: "Unable to reject development request" });
  }
});

module.exports = router;
