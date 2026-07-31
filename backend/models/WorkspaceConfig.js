const mongoose = require("mongoose");

const workspaceConfigSchema = new mongoose.Schema({
  key: { type: String, default: "primary", unique: true, index: true },
  workspaceName: { type: String, default: "Ellie AI Growth Operator", trim: true, maxlength: 120 },
  legalBusinessName: { type: String, default: "Ellie's Coaching", trim: true, maxlength: 160 },
  postalAddress: { type: String, default: "", trim: true, maxlength: 300 },
  addressLine1: { type: String, default: "", trim: true, maxlength: 160 },
  addressLine2: { type: String, default: "", trim: true, maxlength: 160 },
  addressCity: { type: String, default: "", trim: true, maxlength: 100 },
  addressRegion: { type: String, default: "", trim: true, maxlength: 100 },
  addressPostalCode: { type: String, default: "", trim: true, maxlength: 30 },
  addressCountry: { type: String, default: "", trim: true, maxlength: 100 },
  websiteUrl: { type: String, default: "", trim: true, maxlength: 300 },
  organizationLogoUrl: { type: String, default: "", trim: true, maxlength: 600 },
  discoveryTemplates: {
    type: [{
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      titles: { type: String, default: "" },
      industries: { type: String, default: "" },
      keywords: { type: String, default: "" },
      locations: { type: String, default: "" },
      employeeMin: { type: String, default: "" },
      employeeMax: { type: String, default: "" },
      industryIds: { type: [String], default: [] },
      emailStatuses: { type: [String], default: [] },
      seniorities: { type: [String], default: [] },
      technologiesAny: { type: String, default: "" },
      technologiesAll: { type: String, default: "" },
      technologiesExclude: { type: String, default: "" },
      revenueMin: { type: String, default: "" },
      revenueMax: { type: String, default: "" },
      fundingMin: { type: String, default: "" },
      fundingMax: { type: String, default: "" },
    }],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model("WorkspaceConfig", workspaceConfigSchema);
