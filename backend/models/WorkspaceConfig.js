const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const workspaceConfigSchema = new mongoose.Schema({
  key: { type: String, default: "primary", index: true },
  workspaceName: { type: String, default: "Growth Operator", trim: true, maxlength: 120 },
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
  customContactFields: {
    type: [{ _id: false, key: { type: String, required: true }, label: { type: String, required: true }, type: { type: String, enum: ["text", "number", "date", "boolean"], default: "text" } }],
    default: [],
  },
  discoveryTemplates: {
    type: [{
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      mode: { type: String, enum: ["people", "organizations"], default: "people" },
      titles: { type: String, default: "" },
      industries: { type: String, default: "" },
      keywords: { type: String, default: "" },
      locations: { type: String, default: "" },
      employeeMin: { type: String, default: "" },
      employeeMax: { type: String, default: "" },
      employeeRanges: { type: [String], default: [] },
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

workspaceConfigSchema.plugin(workspacePlugin);
workspaceConfigSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model("WorkspaceConfig", workspaceConfigSchema);
