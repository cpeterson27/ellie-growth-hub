const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const affiliateSaleSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true, index: true },
  localEventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  eventbriteEventId: { type: String, required: true, index: true },
  eventbriteAttendeeId: { type: String, required: true },
  eventbriteOrderId: { type: String, default: "", index: true },
  affiliateCode: { type: String, required: true, index: true },
  buyerName: { type: String, default: "" },
  buyerEmail: { type: String, default: "", lowercase: true },
  ticketClassName: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  grossRevenue: { type: Number, default: 0 },
  currency: { type: String, default: "USD" },
  status: { type: String, enum: ["active", "cancelled", "refunded"], default: "active", index: true },
  purchasedAt: { type: Date, default: null, index: true },
  lastSyncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

affiliateSaleSchema.index({ partnerId: 1, eventbriteAttendeeId: 1 }, { unique: true });

affiliateSaleSchema.plugin(workspacePlugin);
module.exports = mongoose.model("AffiliateSale", affiliateSaleSchema);
