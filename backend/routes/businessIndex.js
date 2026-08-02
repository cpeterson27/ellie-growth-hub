const express = require("express");
const BusinessIndexRecord = require("../models/BusinessIndexRecord");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/status", async (_req, res) => {
  const [records, californiaRecords] = await Promise.all([
    BusinessIndexRecord.countDocuments(),
    BusinessIndexRecord.countDocuments({ state: { $in: [/^ca$/i, /california/i] } }),
  ]);
  res.json({ success: true, data: { records, californiaRecords, ready: records > 0 } });
});

router.post("/imports", requireRole("owner", "admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 10000) : [];
  const sourceDataset = String(req.body?.sourceDataset || "").trim();
  const license = String(req.body?.license || "").trim();
  if (!rows.length || !sourceDataset) return res.status(400).json({ success: false, error: "rows and sourceDataset are required" });
  let imported = 0;
  for (const [index, row] of rows.entries()) {
    const name = String(row.name || "").trim();
    const sourceUrl = String(row.sourceUrl || "").trim();
    if (!name || !sourceUrl) continue;
    const sourceRecordId = String(row.sourceRecordId || row.id || `${sourceDataset}-${index}`);
    await BusinessIndexRecord.findOneAndUpdate(
      { sourceDataset, sourceRecordId },
      { ...row, name, normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), sourceDataset, sourceRecordId, sourceUrl, license },
      { upsert: true, new: true, runValidators: true },
    );
    imported += 1;
  }
  res.status(201).json({ success: true, data: { imported, skipped: rows.length - imported } });
});

module.exports = router;
