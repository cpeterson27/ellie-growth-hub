const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  status: { type: String, required: true },
  referrals: { type: Number, default: 0 },
  revenue: { type: String, default: "$0" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Partner", partnerSchema);
