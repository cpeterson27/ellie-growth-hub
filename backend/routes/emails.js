const express = require("express");
const Outreach = require("../models/Outreach");
const { sendEmail } = require("../services/email");
const router = express.Router();

router.post("/send", async (req, res) => {
  try {
    const { outreachIds } = req.body;
    if (!Array.isArray(outreachIds) || outreachIds.length === 0) {
      return res.status(400).json({ error: "outreachIds array is required" });
    }

    const items = await Outreach.find({
      _id: { $in: outreachIds },
      status: "approved",
    });

    if (items.length === 0) {
      return res
        .status(400)
        .json({ error: "No approved outreach items found" });
    }

    let failedCount = 0;
    const failures = [];
    for (const item of items) {
      const result = await sendEmail(item);
      if (!result.success) {
        item.status = "failed";
        item.errorMessage = result.message;
        await item.save();
        failedCount += 1;
        failures.push({ outreachId: item._id, email: item.contactEmail, message: result.message });
        continue;
      }
      item.status = "sent";
      item.sentAt = new Date();
      item.messageId = result.id;

      await item.save();
    }

    res.json({ success: true, sentCount: items.length - failedCount, failedCount, failures });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send emails" });
  }
});

module.exports = router;
