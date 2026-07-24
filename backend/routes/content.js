const express = require("express");
const ContentBrief = require("../models/ContentBrief");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const query = req.query.type ? { type: req.query.type } : {};
    const items = await ContentBrief.find(query).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, data: items });
  } catch {
    res.status(500).json({ success: false, error: "Unable to load AI Content drafts" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, type = "brief", body, subject = "", callToAction = "", campaignId = null, source = "manual" } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ success: false, error: "A title and draft content are required" });
    const item = await ContentBrief.create({ title, type, body, subject, callToAction, campaignId, source });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || "Unable to save AI Content draft" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const item = await ContentBrief.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, error: "Content draft not found" });
    res.json({ success: true, data: item });
  } catch {
    res.status(400).json({ success: false, error: "Unable to update AI Content draft" });
  }
});

module.exports = router;
