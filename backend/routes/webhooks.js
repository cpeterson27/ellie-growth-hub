const express = require("express");
const Outreach = require("../models/Outreach");
const Campaign = require("../models/Campaign");

const router = express.Router();


// ======================================
// RESEND WEBHOOK
// Receives email events from Resend
// ======================================

router.post("/resend", async (req, res) => {

  try {

    const event = req.body;


    console.log("[Resend webhook] received", { type: event.type || "unknown" });



    const data = event.data || {};
    const messageId = String(data.email_id || data.id || "");
    if (["email.delivered", "email.opened"].includes(event.type) && messageId) {
      const outreach = await Outreach.findOne({ messageId });
      if (outreach) {
        const field = event.type === "email.delivered" ? "deliveredAt" : "openedAt";
        if (!outreach[field]) {
          outreach[field] = new Date();
          await outreach.save();
          await Campaign.updateOne(
            { _id: outreach.campaignId },
            { $inc: { [event.type === "email.delivered" ? "metrics.delivered" : "metrics.opened"]: 1 } },
          );
        }
      }
      return res.json({ received: true });
    }

    // Reply handling uses Resend's inbound email event.
    if (
      event.type !== "email.received"
    ) {

      return res.json({
        received: true,
      });

    }



    const senderEmail =
      data.from
        ?.replace(/^.*</, "")
        ?.replace(/>$/, "")
        ?.toLowerCase()
        ?.trim();



    if (!senderEmail) {

      console.warn("[Resend webhook] received message missing sender");

      return res.json({
        received: true,
      });

    }



    const outreach =
      await Outreach.findOne({

        contactEmail: senderEmail,

        status: "sent",

      });



    if (!outreach) {

      console.log("[Resend webhook] no matching sent outreach");


      return res.json({
        received: true,
      });

    }



    outreach.status = "replied";

    outreach.repliedAt = new Date();



    // Save reply content
   outreach.replyText =
  data.text ||
  data.content?.text ||
  data.body?.text ||
  data.body ||
  data.content ||
  data.html ||
  "Reply received";



    await outreach.save();



    console.log("[Resend webhook] outreach reply recorded");



    res.json({
      success: true,
    });



  } catch(error) {

    console.error(
      "RESEND WEBHOOK ERROR:",
      error
    );


    res.status(500).json({
      error: "Webhook failed",
    });

  }

});


module.exports = router;
