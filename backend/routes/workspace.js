const express = require("express");
const crypto = require("crypto");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const User = require("../models/User");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const CoachProfile = require("../models/CoachProfile");
const { hashPassword } = require("../utils/passwords");
const { requireCapability } = require("../middleware/auth");
const launchReadinessService = require("../services/launchReadinessService");
const { CAPABILITIES, OWNER_PROTECTED, ROLE_DEFAULTS, effectivePermissions, legacyRoleFor, normalizeRoles, validCapabilities, validateMembershipChange } = require("../authorization/capabilities");
const router = express.Router();
router.get("/readiness",requireCapability("workspace.manage"),async(req,res)=>res.json({success:true,data:await launchReadinessService.readiness(req.auth.workspaceId)}));

router.get("/", async (_req, res) => {
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { workspaceName: "Growth Operator" } },
    { upsert: true, new: true },
  );
  if (["Ellie AI Growth Operator", "Growth Operator Growth Operator"].includes(config.workspaceName)) {
    config.workspaceName = "Growth Operator";
    await config.save();
  }
  res.json({
    workspaceName: config.workspaceName,
    legalBusinessName: config.legalBusinessName,
    postalAddress: config.postalAddress,
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    addressCity: config.addressCity,
    addressRegion: config.addressRegion,
    addressPostalCode: config.addressPostalCode,
    addressCountry: config.addressCountry,
    websiteUrl: config.websiteUrl,
    organizationLogoUrl: config.organizationLogoUrl,
  });
});

router.patch("/", async (req, res) => {
  const workspaceName = String(req.body?.workspaceName || "").trim();
  if (workspaceName.length < 2) return res.status(400).json({ error: "Enter a workspace name." });
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $set: {
      workspaceName,
      legalBusinessName: String(req.body?.legalBusinessName || "").trim(),
      postalAddress: String(req.body?.postalAddress || "").trim(),
      addressLine1: String(req.body?.addressLine1 || "").trim(),
      addressLine2: String(req.body?.addressLine2 || "").trim(),
      addressCity: String(req.body?.addressCity || "").trim(),
      addressRegion: String(req.body?.addressRegion || "").trim(),
      addressPostalCode: String(req.body?.addressPostalCode || "").trim(),
      addressCountry: String(req.body?.addressCountry || "").trim(),
      websiteUrl: String(req.body?.websiteUrl || "").trim(),
      organizationLogoUrl: String(req.body?.organizationLogoUrl || "").trim(),
    } },
    { upsert: true, new: true },
  );
  res.json({
    workspaceName: config.workspaceName,
    legalBusinessName: config.legalBusinessName,
    postalAddress: config.postalAddress,
    addressLine1: config.addressLine1,
    addressLine2: config.addressLine2,
    addressCity: config.addressCity,
    addressRegion: config.addressRegion,
    addressPostalCode: config.addressPostalCode,
    addressCountry: config.addressCountry,
    websiteUrl: config.websiteUrl,
    organizationLogoUrl: config.organizationLogoUrl,
  });
});

function memberResponse(membership, coachProfile = null) {
  const roles = normalizeRoles(membership);
  return {
    id: membership._id, userId: membership.userId?._id || membership.userId,
    name: membership.userId?.name || "", email: membership.userId?.email || "", role: membership.role,
    roles, status: membership.status, lastLoginAt: membership.userId?.lastLoginAt || null,
    permissionOverrides: membership.permissionOverrides || { allow: [], deny: [] },
    effectivePermissions: effectivePermissions(membership), responsibilities: membership.responsibilities || {},
    coachProfile: coachProfile ? { id: coachProfile._id, status: coachProfile.status, displayName: coachProfile.displayName } : null,
  };
}

router.get("/capabilities", requireCapability("team.view", "team.manage"), (_req, res) => {
  res.json({ capabilities: CAPABILITIES, roleDefaults: ROLE_DEFAULTS, ownerProtected: OWNER_PROTECTED });
});

router.get("/members", requireCapability("team.view", "team.manage"), async (req, res) => {
  const memberships = await WorkspaceMembership.find({ workspaceId: req.auth.workspaceId })
    .populate("userId", "name email status lastLoginAt")
    .sort({ createdAt: 1 });
  const profiles = await CoachProfile.find({ workspaceId: req.auth.workspaceId, userId: { $in: memberships.map((item) => item.userId?._id || item.userId) } }).lean();
  const profileByUser = new Map(profiles.map((item) => [String(item.userId), item]));
  res.json({ members: memberships.map((membership) => memberResponse(membership, profileByUser.get(String(membership.userId?._id || membership.userId)))) });
});

router.post("/members", requireCapability("team.manage"), async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const roles = [...new Set((Array.isArray(req.body?.roles) ? req.body.roles : [req.body?.role || "member"]).filter((role) => ROLE_DEFAULTS[role] && role !== "owner"))];
    if (!roles.length) roles.push("member");
    const role = legacyRoleFor(roles);
    if (!email.includes("@") || name.length < 2) return res.status(400).json({ error: "Enter a name and valid email" });
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email, passwordHash: await hashPassword(req.body?.temporaryPassword) });
    }
    const membership = await WorkspaceMembership.findOneAndUpdate(
      { workspaceId: req.auth.workspaceId, userId: user._id },
      { $set: { role, roles, status: "active" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (roles.includes("coach")) await CoachProfile.findOneAndUpdate({ workspaceId: req.auth.workspaceId, userId: user._id }, { $set: { displayName: user.name, status: "active", deactivatedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.status(201).json({ member: memberResponse({ ...membership.toObject(), userId: user }) });
  } catch (error) {
    res.status(400).json({ error: error.code === 11000 ? "That email already belongs to an account" : error.message });
  }
});

router.patch("/members/:id", requireCapability("team.manage"), async (req, res) => {
  try {
    const membership = await WorkspaceMembership.findOne({ _id: req.params.id, workspaceId: req.auth.workspaceId }).populate("userId", "name email status lastLoginAt");
    if (!membership) return res.status(404).json({ error: "Team member not found" });
    const currentRoles = normalizeRoles(membership);
    const requestedRoles = req.body.roles === undefined ? currentRoles : [...new Set((Array.isArray(req.body.roles) ? req.body.roles : []).filter((role) => ROLE_DEFAULTS[role]))];
    const self = String(membership.userId?._id || membership.userId) === String(req.auth.user._id);
    validateMembershipChange({ currentRoles, requestedRoles, requestedStatus: req.body.status, self, actorRoles: req.auth.roles });
    if (!requestedRoles.length) return res.status(400).json({ error: "At least one role is required" });
    const allow = validCapabilities(req.body.permissionOverrides?.allow ?? membership.permissionOverrides?.allow);
    let deny = validCapabilities(req.body.permissionOverrides?.deny ?? membership.permissionOverrides?.deny);
    if (requestedRoles.includes("owner")) deny = deny.filter((item) => !OWNER_PROTECTED.includes(item));
    membership.roles = requestedRoles;
    membership.role = legacyRoleFor(requestedRoles);
    membership.status = req.body.status === "suspended" ? "suspended" : req.body.status === "active" ? "active" : membership.status;
    membership.permissionOverrides = { allow, deny };
    if (req.body.responsibilities) membership.responsibilities = {
      programIds: Array.isArray(req.body.responsibilities.programIds) ? req.body.responsibilities.programIds : membership.responsibilities?.programIds || [],
      applicationProgramIds: Array.isArray(req.body.responsibilities.applicationProgramIds) ? req.body.responsibilities.applicationProgramIds : membership.responsibilities?.applicationProgramIds || [],
      salesPipelineIds: Array.isArray(req.body.responsibilities.salesPipelineIds) ? req.body.responsibilities.salesPipelineIds.map(String).slice(0, 50) : membership.responsibilities?.salesPipelineIds || [],
    };
    await membership.save();
    let profile = await CoachProfile.findOne({ workspaceId: req.auth.workspaceId, userId: membership.userId._id });
    if (requestedRoles.includes("coach")) profile = await CoachProfile.findOneAndUpdate({ workspaceId: req.auth.workspaceId, userId: membership.userId._id }, { $set: { displayName: profile?.displayName || membership.userId.name, status: "active", deactivatedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    else if (profile?.status === "active") { profile.status = "inactive"; profile.deactivatedAt = new Date(); await profile.save(); }
    return res.json({ member: memberResponse(membership, profile) });
  } catch (error) { return res.status(400).json({ error: error.message || "Unable to update team access", code: error.code }); }
});

router.get("/discovery-templates", async (_req, res) => {
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { workspaceName: "Growth Operator" } },
    { upsert: true, new: true },
  );
  res.json({ templates: config.discoveryTemplates || [] });
});

router.put("/discovery-templates", async (req, res) => {
  const templates = (Array.isArray(req.body?.templates) ? req.body.templates : [])
    .slice(0, 30)
    .map((template) => ({
      id: String(template.id || crypto.randomUUID()),
      name: String(template.name || "").trim().slice(0, 120),
      mode: ["people", "organizations"].includes(template.mode) ? template.mode : "people",
      titles: String(template.titles || "").slice(0, 500),
      industries: String(template.industries || "").slice(0, 500),
      keywords: String(template.keywords || "").slice(0, 1000),
      locations: String(template.locations || "").slice(0, 500),
      employeeMin: String(template.employeeMin ?? "").slice(0, 12),
      employeeMax: String(template.employeeMax ?? "").slice(0, 12),
      employeeRanges: (Array.isArray(template.employeeRanges) ? template.employeeRanges : []).map(String).slice(0, 12),
      industryIds: (Array.isArray(template.industryIds) ? template.industryIds : []).map(String).slice(0, 20),
      emailStatuses: (Array.isArray(template.emailStatuses) ? template.emailStatuses : []).map(String).slice(0, 5),
      seniorities: (Array.isArray(template.seniorities) ? template.seniorities : []).map(String).slice(0, 12),
      technologiesAny: String(template.technologiesAny || "").slice(0, 1000),
      technologiesAll: String(template.technologiesAll || "").slice(0, 1000),
      technologiesExclude: String(template.technologiesExclude || "").slice(0, 1000),
      revenueMin: String(template.revenueMin ?? "").slice(0, 20),
      revenueMax: String(template.revenueMax ?? "").slice(0, 20),
      fundingMin: String(template.fundingMin ?? "").slice(0, 20),
      fundingMax: String(template.fundingMax ?? "").slice(0, 20),
    }))
    .filter((template) => template.name);
  const config = await WorkspaceConfig.findOneAndUpdate(
    { key: "primary" },
    { $set: { discoveryTemplates: templates } },
    { upsert: true, new: true },
  );
  res.json({ templates: config.discoveryTemplates });
});

module.exports = router;
