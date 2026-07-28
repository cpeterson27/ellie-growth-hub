const express = require("express");
const Contact = require("../models/Contact");
const { verifyUnsubscribeToken } = require("../utils/unsubscribe");
const router = express.Router();

async function unsubscribe(req, res, oneClick = false) {
  try {
    const token = req.params.token || req.query.token;
    const payload = verifyUnsubscribeToken(token);
    const contact = await Contact.findOne({ _id: payload.contactId, email: payload.email });
    if (!contact) return res.status(404).send("This contact could not be found.");
    contact.status = "unsubscribed";
    contact.emailPreferences = {
      ...(contact.emailPreferences?.toObject?.() || contact.emailPreferences || {}),
      marketingStatus: "unsubscribed",
      unsubscribedAt: new Date(),
      unsubscribeSource: oneClick ? "email_one_click" : "email_footer",
    };
    await contact.save();
    if (oneClick) return res.status(200).end();
    res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Email preferences updated</title></head><body style="margin:0;background:#f5f2eb;color:#17231f;font-family:Arial,sans-serif"><main style="max-width:620px;margin:10vh auto;background:white;border:1px solid #ded7ca;padding:48px"><p style="color:#997735;letter-spacing:.14em;text-transform:uppercase;font-size:12px">Ellie's Coaching</p><h1 style="font-family:Georgia,serif;font-weight:500">You’re unsubscribed.</h1><p style="color:#68736f;line-height:1.7">We will no longer send marketing or campaign emails to <strong>${payload.email.replace(/[<>&"]/g, "")}</strong>. Personal replies and messages you specifically request are handled separately.</p></main></body></html>`);
  } catch (_error) {
    res.status(400).send("This unsubscribe link is invalid or incomplete.");
  }
}

router.get("/:token", (req, res) => unsubscribe(req, res, false));
router.post("/:token", (req, res) => unsubscribe(req, res, true));

module.exports = router;
