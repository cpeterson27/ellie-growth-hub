const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, default: "" },
  email: { type: String, default: "", lowercase: true },
  phone: { type: String, default: "" },
  type: { type: String, enum: ["affiliate", "speaker", "sponsor", "referral_partner", "organization", "community", "podcast", "influencer"], default: "affiliate" },
  status: { type: String, default: "active" },
  referralCode: { type: String, default: "", index: true },
  referralLink: { type: String, default: "" },
  commissionRate: { type: Number, default: 0 },
  ticketsSold: { type: Number, default: 0 },
  notes: { type: String, default: "" },
  referrals: { type: Number, default: 0 },
  revenue: { type: String, default: "$0" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Partner", partnerSchema);
