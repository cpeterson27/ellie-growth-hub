const mongoose = require("mongoose");

const businessIndexRecordSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, index: true },
  domain: { type: String, default: "", lowercase: true, trim: true, index: true },
  website: { type: String, default: "" },
  industry: { type: String, default: "", index: true },
  description: { type: String, default: "" },
  employeeCount: { type: Number, default: null },
  location: { type: String, default: "", index: true },
  city: { type: String, default: "", index: true },
  state: { type: String, default: "", index: true },
  country: { type: String, default: "US" },
  phone: { type: String, default: "" },
  keywords: { type: [String], default: [] },
  locationCount: { type: Number, default: null },
  rating: { type: Number, default: null },
  reviewCount: { type: Number, default: null },
  sourceDataset: { type: String, required: true, index: true },
  sourceRecordId: { type: String, required: true },
  sourceUrl: { type: String, required: true },
  license: { type: String, default: "" },
  observedAt: { type: Date, default: Date.now },
}, { timestamps: true });

businessIndexRecordSchema.index({ sourceDataset: 1, sourceRecordId: 1 }, { unique: true });
businessIndexRecordSchema.index({ name: "text", description: "text", industry: "text", keywords: "text", city: "text", state: "text" });
module.exports = mongoose.model("BusinessIndexRecord", businessIndexRecordSchema);
