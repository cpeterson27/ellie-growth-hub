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
  branding: {
    logoUrl: { type: String, default: "", maxlength: 1000 }, faviconUrl: { type: String, default: "", maxlength: 1000 },
    primaryColor: { type: String, default: "#173f36" }, accentColor: { type: String, default: "#a8d65e" },
    surfaceMode: { type: String, enum: ["light", "dark", "charcoal"], default: "light" },
    publicSiteName: { type: String, default: "", maxlength: 160 }, publicSiteLogoUrl: { type: String, default: "", maxlength: 1000 },
    poweredByGrowthOperator: { type: Boolean, default: false },
  },
  publicSite: {
    published: { type: Boolean, default: false }, headline: { type: String, default: "", maxlength: 300 }, subheadline: { type: String, default: "", maxlength: 1200 },
    introTitle: { type: String, default: "", maxlength: 300 }, introBody: { type: String, default: "", maxlength: 5000 }, aboutBody: { type: String, default: "", maxlength: 12000 },
    heroMediaUrl: { type: String, default: "", maxlength: 1000 }, primaryCtaLabel: { type: String, default: "Apply Now", maxlength: 80 }, primaryCtaUrl: { type: String, default: "/apply", maxlength: 1000 },
    secondaryCtaLabel: { type: String, default: "", maxlength: 80 }, secondaryCtaUrl: { type: String, default: "", maxlength: 1000 },
    contactEmail: { type: String, default: "", maxlength: 320 }, contactPhone: { type: String, default: "", maxlength: 80 }, footerText: { type: String, default: "", maxlength: 1000 },
    socialLinks: { type: [{ _id: false, label: { type: String, maxlength: 60 }, url: { type: String, maxlength: 1000 } }], default: [] },
  },
  publicApplication: {
    enabled: { type: Boolean, default: true },
    heading: { type: String, default: "Apply for coaching", maxlength: 240 },
    intro: { type: String, default: "Tell us where you are and where you want to go.", maxlength: 1200 },
    confirmationMessage: { type: String, default: "Thank you. Your application has been received.", maxlength: 1000 },
    questionLabels: { investingExperience: { type: String, default: "Investing experience", maxlength: 160 }, currentSituation: { type: String, default: "Current situation", maxlength: 160 }, goals: { type: String, default: "Goals", maxlength: 160 }, desiredStartTimeline: { type: String, default: "Desired start timeline", maxlength: 160 }, message: { type: String, default: "Anything else we should know?", maxlength: 160 } },
    timelineOptions: { type: [String], default: [] },
    nextStepCta: { label: { type: String, default: "", maxlength: 120 }, url: { type: String, default: "", maxlength: 1000 } },
    privacyUrl: { type: String, default: "/privacy", maxlength: 1000 },
    termsUrl: { type: String, default: "/terms", maxlength: 1000 },
    defaultAssigneeUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    programAssignments: { type: [{ _id: false, coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", required: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true } }], default: [] },
  },
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
