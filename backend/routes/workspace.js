const express = require("express");
const crypto = require("crypto");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const Workspace = require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const CoachProfile = require("../models/CoachProfile");
const AmbassadorProfile = require("../models/AmbassadorProfile");
const WorkspaceInvitation = require("../models/WorkspaceInvitation");
const invitationTemplateService = require("../services/invitationTemplateService");
const { requireCapability, requireRole } = require("../middleware/auth");
const workspaceMemberService = require("../services/workspaceMemberService");
const launchReadinessService = require("../services/launchReadinessService");
const { CAPABILITIES, OWNER_PROTECTED, ROLE_DEFAULTS, effectivePermissions, legacyRoleFor, normalizeRoles, roleDefaultsForWorkspace, validCapabilities, validateMembershipChange } = require("../authorization/capabilities");
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

function memberResponse(membership, coachProfile = null, ambassadorProfile = null, invitation = null, isSelf = false) {
  const roles = normalizeRoles(membership);
  return {
    id: membership._id, userId: membership.userId?._id || membership.userId,
    firstName: membership.userId?.firstName || "", lastName: membership.userId?.lastName || "", phone: membership.userId?.phone || "", name: membership.userId?.name || "", email: membership.userId?.email || "", avatarUrl: membership.userId?.avatarUrl || "", role: membership.role,
    roles, status: membership.status, lastLoginAt: membership.userId?.lastLoginAt || null, isSelf,
    permissionOverrides: membership.permissionOverrides || { allow: [], deny: [] },
    effectivePermissions: effectivePermissions(membership), responsibilities: membership.responsibilities || {},
    coachProfile: coachProfile ? { id: coachProfile._id, status: coachProfile.status, displayName: coachProfile.displayName } : null,
    ambassadorProfile: ambassadorProfile ? { id: ambassadorProfile._id, status: ambassadorProfile.status, displayName: ambassadorProfile.displayName, referralCode: ambassadorProfile.referralCode } : null,
    invitation: invitation ? { id: invitation._id, status: invitation.expiresAt < new Date() && !["accepted", "revoked"].includes(invitation.status) ? "expired" : invitation.status, deliveryStatus: invitation.deliveryStatus, roleKey: invitation.roleKey, subject: invitation.subject, body: invitation.body, sentAt: invitation.sentAt, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt } : null,
    lifecycle: membership.status === "invited" ? (invitation?.status === "pending" ? "pending_signup" : invitation?.status === "ready" ? "invite_ready" : "draft") : membership.status === "suspended" ? "disabled" : coachProfile?.status === "active" ? "coach_profile_active" : ambassadorProfile?.status === "active" ? "ambassador_profile_active" : "active",
  };
}

const invitationResponse = (invitation) => invitation ? ({
  id: invitation._id, status: invitation.status, deliveryStatus: invitation.deliveryStatus,
  roleKey: invitation.roleKey, templateVersion: invitation.templateVersion,
  subject: invitation.subject, body: invitation.body, sentAt: invitation.sentAt,
  expiresAt: invitation.expiresAt,
}) : null;

const ROLE_DESCRIPTIONS = Object.freeze({
  owner: "Full workspace access, including team administration, workspace settings, integrations, security, CRM, coaching, communications, automation, and analytics.",
  admin: "Full operational workspace access, including team administration and integrations; cannot grant, remove, or deactivate Owner access.",
  coach: "Assigned coaching students, notes, handoffs, individual communications, own referrals and commissions, and own Calendar/Zoom connections.",
  ambassador: "Self-service access to their own ambassador profile, referrals, conversion status, payout history, and explicitly configured community entry point.",
  closer: "Assigned CRM contacts, applications, sales opportunities, and individual follow-up communications.",
  member: "General CRM, opportunities, communications, campaigns, outreach, discovery, and analytics access.",
  viewer: "Read-only CRM, opportunity, communications, and analytics access.",
});

router.get("/capabilities", requireCapability("team.view", "team.manage"), (req, res) => {
  res.json({ capabilities: CAPABILITIES, roleDefaults: roleDefaultsForWorkspace(req.auth.workspace), systemRoleDefaults: ROLE_DEFAULTS, roleDescriptions: ROLE_DESCRIPTIONS, ownerProtected: OWNER_PROTECTED, canEditRoleTemplates: req.auth.roles.includes("owner") || req.auth.isPlatformOwner });
});
router.put("/role-permissions/:role", requireCapability("team.manage"), async (req, res) => {
  try {
    if (!req.auth.roles.includes("owner") && !req.auth.isPlatformOwner) return res.status(403).json({ error: "Only a workspace owner can change role templates", code: "OWNER_REQUIRED" });
    const role = String(req.params.role || "").toLowerCase();
    if (!ROLE_DEFAULTS[role]) return res.status(404).json({ error: "Role template not found" });
    if (role === "owner") return res.status(409).json({ error: "Owner permissions are protected and cannot be customized", code: "OWNER_TEMPLATE_PROTECTED" });
    const workspace = await Workspace.findOne({ _id: req.auth.workspaceId, status: "active" });
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    if (!workspace.rolePermissionTemplates) workspace.rolePermissionTemplates = new Map();
    workspace.rolePermissionTemplates.set(role, validCapabilities(req.body?.permissions));
    workspace.markModified("rolePermissionTemplates");
    await workspace.save();
    return res.json({ role, roleDefaults: roleDefaultsForWorkspace(workspace) });
  } catch (error) { return res.status(400).json({ error: error.message || "Unable to save role permissions" }); }
});
router.delete("/role-permissions/:role", requireCapability("team.manage"), async (req, res) => {
  if (!req.auth.roles.includes("owner") && !req.auth.isPlatformOwner) return res.status(403).json({ error: "Only a workspace owner can reset role templates", code: "OWNER_REQUIRED" });
  const role = String(req.params.role || "").toLowerCase();
  if (!ROLE_DEFAULTS[role] || role === "owner") return res.status(409).json({ error: "This role template cannot be reset" });
  const workspace = await Workspace.findById(req.auth.workspaceId);
  if (!workspace) return res.status(404).json({ error: "Workspace not found" });
  workspace.rolePermissionTemplates?.delete(role); workspace.markModified("rolePermissionTemplates"); await workspace.save();
  return res.json({ role, roleDefaults: roleDefaultsForWorkspace(workspace) });
});
router.get("/invitation-templates", requireCapability("team.view", "team.manage"), async (req, res) => res.json({ templates: await invitationTemplateService.list(req.auth.workspaceId) }));
router.put("/invitation-templates/:roleKey", requireCapability("team.manage"), async (req, res) => { try { res.json({ template: await invitationTemplateService.save({ workspaceId: req.auth.workspaceId, roleKey: req.params.roleKey, subject: req.body?.subject, body: req.body?.body, actorUserId: req.auth.user._id }) }); } catch (error) { res.status(400).json({ error: error.message }); } });
router.post("/invitation-templates/:roleKey/reset", requireCapability("team.manage"), async (req, res) => { try { res.json({ template: await invitationTemplateService.reset({ workspaceId: req.auth.workspaceId, roleKey: req.params.roleKey }) }); } catch (error) { res.status(400).json({ error: error.message }); } });

router.get("/members", requireCapability("team.view", "team.manage"), async (req, res) => {
  const memberships = await WorkspaceMembership.find({ workspaceId: req.auth.workspaceId })
    .populate("userId", "name firstName lastName phone email status lastLoginAt avatarUrl")
    .sort({ createdAt: 1 });
  const profiles = await CoachProfile.find({ workspaceId: req.auth.workspaceId, userId: { $in: memberships.map((item) => item.userId?._id || item.userId) } }).lean();
  const ambassadorProfiles = await AmbassadorProfile.find({ workspaceId: req.auth.workspaceId, userId: { $in: memberships.map((item) => item.userId?._id || item.userId) } }).lean();
  const invitations = await WorkspaceInvitation.find({ workspaceId: req.auth.workspaceId, userId: { $in: memberships.map((item) => item.userId?._id || item.userId) } }).sort({ updatedAt: -1 }).lean();
  const profileByUser = new Map(profiles.map((item) => [String(item.userId), item]));
  const ambassadorByUser = new Map(ambassadorProfiles.map((item) => [String(item.userId), item]));
  const invitationByUser = new Map(); for (const item of invitations) if (!invitationByUser.has(String(item.userId))) invitationByUser.set(String(item.userId), item);
  res.json({ members: memberships.map((membership) => memberResponse(membership, profileByUser.get(String(membership.userId?._id || membership.userId)), ambassadorByUser.get(String(membership.userId?._id || membership.userId)), invitationByUser.get(String(membership.userId?._id || membership.userId)), String(membership.userId?._id || membership.userId) === String(req.auth.user._id))) });
});
router.post("/invitations/:id/send", requireCapability("team.manage"), async (req, res) => { try { const delivery = await workspaceMemberService.sendInvitation({ workspaceId: req.auth.workspaceId, invitationId: req.params.id, actorUserId: req.auth.user._id, subject: req.body?.subject, body: req.body?.body }); const invitation = await WorkspaceInvitation.findOne({ _id: req.params.id, workspaceId: req.auth.workspaceId }).lean(); res.json({ invitation: { id: invitation._id, status: invitation.status, deliveryStatus: delivery.deliveryStatus, sentAt: invitation.sentAt, expiresAt: invitation.expiresAt, subject: invitation.subject, body: invitation.body } }); } catch (error) { res.status(400).json({ error: error.message }); } });
router.delete("/invitations/:id", requireCapability("team.manage"), async (req, res) => { try { const invitation = await WorkspaceInvitation.findOne({ _id: req.params.id, workspaceId: req.auth.workspaceId }); if (!invitation) return res.status(404).json({ error: "Invitation not found" }); if (invitation.status === "accepted") return res.status(409).json({ error: "Accepted invitations cannot be cancelled; remove workspace access instead" }); invitation.status = "revoked"; invitation.expiresAt = new Date(); await invitation.save(); await WorkspaceMembership.updateOne({ workspaceId: req.auth.workspaceId, userId: invitation.userId, status: "invited" }, { $set: { status: "suspended" } }); return res.json({ success: true }); } catch (error) { return res.status(400).json({ error: error.message }); } });
router.delete("/members/:id", requireRole("owner", "admin"), requireCapability("team.manage"), async (req, res) => { try { const removed = await workspaceMemberService.removeMember({ workspaceId: req.auth.workspaceId, membershipId: req.params.id, actorUserId: req.auth.user._id, actorRoles: req.auth.roles }); return res.json({ success: true, removed }); } catch (error) { const status = error.code === "MEMBER_NOT_FOUND" ? 404 : error.code?.includes("BLOCKED") ? 409 : 400; return res.status(status).json({ error: error.message, code: error.code }); } });

router.post("/members", requireCapability("team.manage"), async (req, res) => {
  try {
    const roles = [...new Set((Array.isArray(req.body?.roles) ? req.body.roles : [req.body?.role || "member"]).filter((role) => ROLE_DEFAULTS[role]))];
    if (!roles.length) roles.push("member");
    validateMembershipChange({ currentRoles: [], requestedRoles: roles, actorRoles: req.auth.roles || [req.auth.role].filter(Boolean) });
    if (roles.includes("ambassador")) {
      const data = await workspaceMemberService.onboardAmbassador({ ...req.body, roles, workspaceId: req.auth.workspaceId, actorUserId: req.auth.user._id });
      return res.status(data.alreadyActive ? 200 : 201).json({ member: memberResponse({ ...data.membership.toObject(), userId: data.user }, null, data.ambassadorProfile, data.invitation), invitation: invitationResponse(data.invitation), alreadyActive: data.alreadyActive });
    }
    if (roles.includes("coach") && (req.body?.timezone !== undefined || req.body?.capacity !== undefined || req.body?.programIds !== undefined)) {
      const data = await workspaceMemberService.onboardCoach({ ...req.body, roles, workspaceId: req.auth.workspaceId, actorUserId: req.auth.user._id });
      return res.status(data.alreadyActive ? 200 : 201).json({ member: memberResponse({ ...data.membership.toObject(), userId: data.user }, data.coachProfile, null, data.invitation), invitation: invitationResponse(data.invitation), alreadyActive: data.alreadyActive });
    }
    const result = await workspaceMemberService.inviteMember({ workspaceId: req.auth.workspaceId, actorUserId: req.auth.user._id, name: req.body?.name, firstName: req.body?.firstName, lastName: req.body?.lastName, phone: req.body?.phone, email: req.body?.email, roles });
    const profile = roles.includes("coach") ? await CoachProfile.findOne({ workspaceId: req.auth.workspaceId, userId: result.user._id }) : null;
    res.status(result.alreadyActive ? 200 : 201).json({ member: memberResponse({ ...result.membership.toObject(), userId: result.user }, profile, null, result.invitation), invitation: invitationResponse(result.invitation), alreadyActive: result.alreadyActive });
  } catch (error) {
    res.status(400).json({ error: error.code === 11000 ? "That email already belongs to an account" : error.message });
  }
});

router.patch("/members/:id", requireCapability("team.manage"), async (req, res) => {
  try {
    const membership = await WorkspaceMembership.findOne({ _id: req.params.id, workspaceId: req.auth.workspaceId }).populate("userId", "name firstName lastName phone email status lastLoginAt avatarUrl");
    if (!membership) return res.status(404).json({ error: "Team member not found" });
    const currentRoles = normalizeRoles(membership);
    const requestedRoles = req.body.roles === undefined ? currentRoles : [...new Set((Array.isArray(req.body.roles) ? req.body.roles : []).filter((role) => ROLE_DEFAULTS[role]))];
    const self = String(membership.userId?._id || membership.userId) === String(req.auth.user._id);
    const activeOwnerCount = await WorkspaceMembership.countDocuments({ workspaceId: req.auth.workspaceId, status: "active", $or: [{ role: "owner" }, { roles: "owner" }] });
    validateMembershipChange({ currentRoles, requestedRoles, requestedStatus: req.body.status, self, actorRoles: req.auth.roles, activeOwnerCount });
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
    let ambassadorProfile = await AmbassadorProfile.findOne({ workspaceId: req.auth.workspaceId, userId: membership.userId._id });
    if (requestedRoles.includes("coach")) profile = await CoachProfile.findOneAndUpdate({ workspaceId: req.auth.workspaceId, userId: membership.userId._id }, { $set: { displayName: profile?.displayName || membership.userId.name, status: "active", deactivatedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    else if (profile?.status === "active") { profile.status = "inactive"; profile.deactivatedAt = new Date(); await profile.save(); }
    if (requestedRoles.includes("ambassador") && !ambassadorProfile) { const linked = await workspaceMemberService.onboardAmbassador({ workspaceId: req.auth.workspaceId, actorUserId: req.auth.user._id, name: membership.userId.name, email: membership.userId.email, roles: requestedRoles }); ambassadorProfile = linked.ambassadorProfile; }
    else if (requestedRoles.includes("ambassador") && ambassadorProfile) { ambassadorProfile.status = membership.status === "active" ? "active" : ambassadorProfile.status; ambassadorProfile.deactivatedAt = null; await ambassadorProfile.save(); }
    else if (ambassadorProfile?.status === "active") { ambassadorProfile.status = "inactive"; ambassadorProfile.deactivatedAt = new Date(); await ambassadorProfile.save(); }
    return res.json({ member: memberResponse(membership, profile, ambassadorProfile) });
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
