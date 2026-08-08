const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  name: { type: String, required: true },
  company: { type: String, default: "" },
  email: { type: String, default: "", lowercase: true },
  phone: { type: String, default: "" },
  type: { type: String, enum: ["affiliate", "speaker", "sponsor", "referral_partner", "organization", "community", "podcast", "influencer"], default: "affiliate" },
  status: { type: String, default: "active" },
  referralCode: { type: String, default: "", index: true },
  referralLink: { type: String, default: "" },
  localEventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", default: null, index: true },
  eventbriteEventId: { type: String, default: "", index: true },
  eventName: { type: String, default: "" },
  trackingProvider: { type: String, enum: ["", "eventbrite", "manual"], default: "" },
  commissionRate: { type: Number, default: 0 },
  ticketsSold: { type: Number, default: 0 },
  notes: { type: String, default: "" },
  referrals: { type: Number, default: 0 },
  revenue: { type: String, default: "$0" },
  grossRevenue: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  lastSyncedAt: { type: Date, default: null },
  lastSaleAt: { type: Date, default: null },
  lastSyncStatus: { type: String, enum: ["", "success", "failed"], default: "" },
  lastSyncError: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

partnerSchema.index({ eventbriteEventId: 1, referralCode: 1 });

module.exports = mongoose.model("Partner", partnerSchema);
