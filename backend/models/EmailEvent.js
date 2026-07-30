const mongoose = require("mongoose");

const emailEventSchema = new mongoose.Schema({
  provider: { type: String, default: "resend", index: true },
  providerEventId: { type: String, required: true, unique: true },
  messageId: { type: String, default: "", index: true },
  outreachId: { type: mongoose.Schema.Types.ObjectId, ref: "Outreach", default: null, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
  type: { type: String, required: true, index: true },
  occurredAt: { type: Date, required: true, index: true },
  recipient: { type: String, default: "", lowercase: true, trim: true },
}, { timestamps: true, collection: "email_events" });

module.exports = mongoose.model("EmailEvent", emailEventSchema);
