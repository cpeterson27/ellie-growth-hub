const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const salesOpportunitySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  stageKey: { type: String, required: true, default: "new", index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  primaryContactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  value: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "USD", uppercase: true, trim: true, maxlength: 3 },
  probability: { type: Number, default: 0, min: 0, max: 100 },
  expectedCloseAt: { type: Date, default: null },
  nextAction: { type: String, default: "", trim: true, maxlength: 500 },
  nextActionAt: { type: Date, default: null },
  notes: { type: String, default: "", trim: true, maxlength: 5000 },
  wonAt: { type: Date, default: null },
  lostAt: { type: Date, default: null },
  lostReason: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true, collection: "sales_opportunities" });

salesOpportunitySchema.index({ workspaceId: 1, stageKey: 1, updatedAt: -1 });
salesOpportunitySchema.plugin(workspacePlugin);
module.exports = mongoose.model("SalesOpportunity", salesOpportunitySchema);
