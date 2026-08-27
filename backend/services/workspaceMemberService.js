const crypto = require("crypto");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const WorkspaceInvitation = require("../models/WorkspaceInvitation");
const CoachProfile = require("../models/CoachProfile");
const CoachingProgram = require("../models/CoachingProgram");
const AmbassadorProfile = require("../models/AmbassadorProfile");
const CrmActivity = require("../models/CrmActivity");
const integrationHub = require("./integrationHub");
const invitationTemplateService = require("./invitationTemplateService");
const { hashPassword } = require("../utils/passwords");
const { legacyRoleFor, normalizeRoles } = require("../authorization/capabilities");

const dependencies = { User, Workspace, WorkspaceMembership, WorkspaceInvitation, CoachProfile, CoachingProgram, AmbassadorProfile, CrmActivity, integrationHub, invitationTemplateService };
const INVITATION_DAYS = 7;

async function requireOwnerActor(input, models) {
  if (!input.workspaceId || !input.actorUserId) throw Object.assign(new Error("An authenticated workspace Owner is required"), { code: "OWNER_ESCALATION_BLOCKED" });
  const actor = await models.WorkspaceMembership.findOne({ workspaceId: input.workspaceId, userId: input.actorUserId, status: "active" });
  if (!actor || actor.status !== "active" || !normalizeRoles(actor).includes("owner")) {
    const error = new Error("Only an active workspace Owner can grant or manage Owner invitations");
    error.code = "OWNER_ESCALATION_BLOCKED"; throw error;
  }
}

function cleanEmail(value) { return String(value || "").trim().toLowerCase(); }
function invitationHash(token) { return crypto.createHash("sha256").update(String(token || "")).digest("hex"); }
function publicFrontendUrl() { return String(process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""); }

function personIdentity(input) {
  const clean = value => String(value || "").trim().replace(/\s+/g, " ");
  const structured = input.firstName !== undefined || input.lastName !== undefined;
  const firstName = clean(input.firstName), lastName = clean(input.lastName);
  if (structured && (!firstName || !lastName)) throw new Error("First name and last name are required");
  const name = structured ? [firstName, lastName].join(" ") : clean(input.name);
  const phone = String(input.phone || "").trim();
  if (name.length < 2 || name.length > 120 || firstName.length > 80 || lastName.length > 80 || phone.length > 50) throw new Error("Check the name and phone length");
  return { name, ...(structured ? { firstName, lastName } : {}), phone };
}

async function findOrCreateUser({ name, email, firstName, lastName, phone }, models) {
  let user = await models.User.findOne({ email });
  if (user) return { user, created: false };
  try {
    user = await models.User.create({ name, email, firstName, lastName, phone, passwordHash: await hashPassword(crypto.randomBytes(32).toString("base64url")) });
    return { user, created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    user = await models.User.findOne({ email });
    if (!user) throw error;
    return { user, created: false };
  }
}

async function deliverInvitation({ invitation, token = crypto.randomBytes(32).toString("base64url"), workspaceName, invitedBy = "A workspace administrator" }, models) {
  const acceptUrl = `${publicFrontendUrl()}/accept-invitation/${encodeURIComponent(token)}`;
  const vars = { firstName: invitation.name.split(/\s+/)[0], displayName: invitation.name, role: invitation.roleKey === "ambassador" ? "Brand Ambassador" : invitation.roleKey === "closer" ? "Closer / Sales" : invitation.roleKey === "coach" ? "Coach" : invitation.roles[0] || "Team Member", workspaceName, inviteLink: acceptUrl, invitedBy };
  const rendered = invitationTemplateService.render({ subject: invitation.subject, body: invitation.body }, vars);
  const previousAuthorization = { tokenHash: invitation.tokenHash, expiresAt: invitation.expiresAt, status: invitation.status };
  invitation.tokenHash = invitationHash(token); invitation.expiresAt = new Date(Date.now() + INVITATION_DAYS * 86400000); invitation.renderedSubject = rendered.subject; invitation.renderedBody = rendered.body;
  try {
    await models.integrationHub.execute("resend", "sendEmail", {
      from: process.env.EMAIL_FROM || "Growth Operator <onboarding@resend.dev>",
      to: invitation.email,
      subject: rendered.subject,
      text: rendered.body,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${rendered.body.split("\n").map((line) => `<p>${line.replace(/[<>&"]/g, "")}</p>`).join("")}</div>`,
    });
    invitation.deliveryStatus = "sent";
    invitation.status = "pending"; invitation.sentAt = new Date();
    invitation.deliveryError = "";
  } catch (error) {
    invitation.tokenHash = previousAuthorization.tokenHash;
    invitation.expiresAt = previousAuthorization.expiresAt;
    invitation.status = previousAuthorization.status;
    invitation.deliveryStatus = "failed";
    invitation.deliveryError = String(error?.message || "Invitation delivery failed").slice(0, 500);
  }
  invitation.deliveryHistory = invitation.deliveryHistory || [];
  invitation.deliveryHistory.push({ sentAt: new Date(), status: invitation.deliveryStatus, templateVersion: invitation.templateVersion || 1, subject: rendered.subject, body: rendered.body, invitedBy: invitation.invitedBy });
  await invitation.save();
  if (models.CrmActivity) await models.CrmActivity.create({ workspaceId: invitation.workspaceId, type: "system", source: "crm", title: invitation.deliveryStatus === "sent" ? "Team invitation sent" : "Team invitation delivery failed", createdBy: invitation.invitedBy, metadata: { eventType: invitation.deliveryStatus === "sent" ? "team.invitation.sent" : "team.invitation.failed", invitationId: invitation._id, userId: invitation.userId, roles: invitation.roles } });
  return { deliveryStatus: invitation.deliveryStatus, ...(process.env.NODE_ENV === "production" ? {} : { acceptUrl }) };
}

async function inviteMember(input, models = dependencies) {
  const identity = personIdentity(input);
  const email = cleanEmail(input.email);
  let name = identity.name;
  if (!email.includes("@") || name.length < 2) throw new Error("Enter a name and valid email");
  const roles = [...new Set((input.roles || []).filter((role) => ["owner", "admin", "coach", "closer", "ambassador", "member", "viewer"].includes(role)))];
  if (!roles.length) roles.push("member");
  if (roles.includes("owner")) await requireOwnerActor(input, models);
  const { user } = await findOrCreateUser({ ...identity, email }, models);
  name = user.name || name;
  const existing = await models.WorkspaceMembership.findOne({ workspaceId: input.workspaceId, userId: user._id });
  if (existing && normalizeRoles(existing).includes("owner")) await requireOwnerActor(input, models);
  // Reuse established global identity. Only fill missing fields for an existing
  // membership in this workspace; never edit a foreign workspace's user.
  if (existing) {
    let enriched = false;
    const parts = String(user.name || name).trim().split(/\s+/);
    const missingValues = { firstName: parts.shift() || "", lastName: parts.join(" "), phone: identity.phone };
    for (const key of ["firstName", "lastName", "phone"]) {
      if (!user[key] && identity[key] && missingValues[key]) { user[key] = missingValues[key]; enriched = true; }
    }
    if (enriched) await user.save();
  }
  if (existing?.status === "active") {
    const combinedRoles = [...new Set([...normalizeRoles(existing), ...roles])];
    existing.roles = combinedRoles;
    existing.role = legacyRoleFor(combinedRoles);
    await existing.save();
    return { user, membership: existing, invitation: null, alreadyActive: true };
  }
  const membership = await models.WorkspaceMembership.findOneAndUpdate(
    { workspaceId: input.workspaceId, userId: user._id },
    { $set: { role: legacyRoleFor(roles), roles, status: "invited" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const token = crypto.randomBytes(32).toString("base64url");
  const key = invitationTemplateService.roleKey(roles);
  const template = input.invitationSubject && input.invitationBody ? { subject: input.invitationSubject, body: input.invitationBody, version: input.templateVersion || 1 } : models.invitationTemplateService ? await models.invitationTemplateService.get(input.workspaceId, key) : { ...invitationTemplateService.defaults[key], version: 1 };
  const invitation = await models.WorkspaceInvitation.findOneAndUpdate(
    { workspaceId: input.workspaceId, email },
    { $set: { userId: user._id, name, roles, tokenHash: invitationHash(token), status: "ready", deliveryStatus: "pending", deliveryError: "", expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000), acceptedAt: null, sentAt: null, invitedBy: input.actorUserId, roleKey: key, templateVersion: template.version || 1, subject: template.subject, body: template.body, renderedSubject: "", renderedBody: "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  let delivery = null;
  if (input.deliverInvitation === true) {
    const workspace = await models.Workspace.findById(input.workspaceId).select("name").lean();
    delivery = await deliverInvitation({ invitation, token, workspaceName: workspace?.name || "Growth Operator" }, models);
  }
  return { user, membership, invitation, delivery, invitationToken: token, alreadyActive: false };
}

async function onboardCoach(input, models = dependencies) {
  const requestedProgramIds = [...new Set((Array.isArray(input.programIds) ? input.programIds : []).map(String).filter(Boolean))];
  const programs = requestedProgramIds.length ? await models.CoachingProgram.find({ workspaceId: input.workspaceId, _id: { $in: requestedProgramIds }, status: { $ne: "archived" } }).select("_id").lean() : [];
  if (programs.length !== requestedProgramIds.length) { const error = new Error("Every coaching program must belong to this workspace"); error.code = "PROGRAM_WORKSPACE_MISMATCH"; throw error; }
  const invited = await inviteMember({ ...input, roles: [...new Set([...(input.roles || []), "coach"])], deliverInvitation: false }, models);
  const active = invited.membership.status === "active";
  const update = {
    displayName: invited.user.name,
    timezone: String(input.timezone || "").trim(),
    capacity: input.capacity == null || input.capacity === "" ? null : Math.max(0, Number(input.capacity) || 0),
    status: active ? "active" : "inactive",
    deactivatedAt: active ? null : new Date(),
  };
  const coachProfile = await models.CoachProfile.findOneAndUpdate(
    { workspaceId: input.workspaceId, userId: invited.user._id }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  invited.membership.responsibilities = invited.membership.responsibilities || {};
  invited.membership.responsibilities.programIds = programs.map((program) => program._id);
  await invited.membership.save();
  return { ...invited, coachProfile };
}

function referralCode(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70); }
async function availableAmbassadorCode(input, models) {
  const base = referralCode(input.referralCode || input.name) || `ambassador-${crypto.randomBytes(3).toString("hex")}`;
  for (let index = 0; index < 20; index += 1) {
    const candidate = index ? `${base}-${index + 1}` : base;
    const [ambassador, coach] = await Promise.all([models.AmbassadorProfile.findOne({ workspaceId: input.workspaceId, $or: [{ referralCode: candidate }, { referralSlug: candidate }] }).lean(), models.CoachProfile.findOne({ workspaceId: input.workspaceId, $or: [{ referralCode: candidate }, { referralSlug: candidate }] }).lean()]);
    if (!ambassador && !coach) return candidate;
  }
  throw new Error("Unable to create a unique referral code; enter a different code");
}

async function onboardAmbassador(input, models = dependencies) {
  const invited = await inviteMember({ ...input, roles: [...new Set([...(input.roles || []), "ambassador"])], deliverInvitation: false }, models);
  const existing = await models.AmbassadorProfile.findOne({ workspaceId: input.workspaceId, userId: invited.user._id });
  const code = existing?.referralCode || await availableAmbassadorCode({ ...input, name: invited.user.name }, models);
  const active = invited.membership.status === "active";
  const values = {
    displayName: invited.user.name, status: active ? "active" : "invited", referralCode: code, referralSlug: code,
    contactId: input.contactId || existing?.contactId || null, communityUrl: String(input.communityUrl || existing?.communityUrl || "").trim(),
    startDate: input.startDate || existing?.startDate || new Date(), notes: String(input.notes || existing?.notes || "").trim(), deactivatedAt: active ? null : existing?.deactivatedAt || null,
    commissionConfig: { mode: ["manual", "percent", "fixed"].includes(input.commissionConfig?.mode) ? input.commissionConfig.mode : existing?.commissionConfig?.mode || "manual", rateBps: Math.min(10000, Math.max(0, Number(input.commissionConfig?.rateBps ?? existing?.commissionConfig?.rateBps) || 0)), fixedAmountMinor: Math.max(0, Number(input.commissionConfig?.fixedAmountMinor ?? existing?.commissionConfig?.fixedAmountMinor) || 0), currency: String(input.commissionConfig?.currency || existing?.commissionConfig?.currency || "USD").toUpperCase().slice(0, 3) },
  };
  const ambassadorProfile = await models.AmbassadorProfile.findOneAndUpdate({ workspaceId: input.workspaceId, userId: invited.user._id }, { $set: values }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
  if (models.CrmActivity) await models.CrmActivity.create({ workspaceId: input.workspaceId, type: "system", source: "crm", title: existing ? "Ambassador onboarding updated" : "Ambassador invitation prepared", createdBy: input.actorUserId, metadata: { eventType: existing ? "ambassador.onboarding.updated" : "ambassador.added", ambassadorProfileId: ambassadorProfile._id, userId: invited.user._id, invitationId: invited.invitation?._id || null } });
  return { ...invited, ambassadorProfile };
}

async function sendInvitation({ workspaceId, invitationId, subject, body, actorUserId }, models = dependencies) { const invitation = await models.WorkspaceInvitation.findOne({ _id: invitationId, workspaceId }); if (!invitation || invitation.status === "accepted" || invitation.status === "revoked") throw new Error("Invitation is not available to send"); if (invitation.roles?.includes("owner")) await requireOwnerActor({ workspaceId, actorUserId }, models); if (subject !== undefined) invitation.subject = String(subject).trim().slice(0, 300); if (body !== undefined) invitation.body = String(body).slice(0, 10000); if (!invitation.subject || !invitation.body) throw new Error("Invitation subject and message are required"); const [workspace, inviter] = await Promise.all([models.Workspace.findById(workspaceId).select("name").lean(), models.User.findById(invitation.invitedBy).select("name").lean()]); const delivery = await deliverInvitation({ invitation, workspaceName: workspace?.name || "Growth Operator", invitedBy: inviter?.name || "A workspace administrator" }, models); if (delivery.deliveryStatus !== "sent") { const error = new Error("Invitation email could not be sent. Check the email connection and try again."); error.code = "INVITATION_DELIVERY_FAILED"; throw error; } return delivery; }

async function acceptInvitation({ token, password, name, firstName, lastName, phone }, models = dependencies) {
  const invitation = await models.WorkspaceInvitation.findOne({ tokenHash: invitationHash(token), status: "pending", expiresAt: { $gt: new Date() } }).select("+tokenHash +deliveryError");
  if (!invitation) { const error = new Error("This invitation is invalid or has expired"); error.code = "INVITATION_INVALID"; throw error; }
  const user = await models.User.findById(invitation.userId).select("+passwordHash");
  const membership = await models.WorkspaceMembership.findOne({ workspaceId: invitation.workspaceId, userId: invitation.userId });
  if (!user || !membership || membership.status !== "invited") { const error = new Error("This invitation is no longer available"); error.code = "INVITATION_INVALID"; throw error; }
  const identity = personIdentity({ name: name || invitation.name || user.name, firstName, lastName, phone: phone === undefined ? user.phone : phone });
  user.passwordHash = await hashPassword(password);
  Object.assign(user, identity);
  user.status = "active";
  await user.save();
  membership.status = "active";
  await membership.save();
  if (normalizeRoles(membership).includes("coach")) await models.CoachProfile.findOneAndUpdate(
    { workspaceId: invitation.workspaceId, userId: user._id }, { $set: { status: "active", deactivatedAt: null, displayName: user.name } }, { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (normalizeRoles(membership).includes("ambassador")) await models.AmbassadorProfile.findOneAndUpdate(
    { workspaceId: invitation.workspaceId, userId: user._id }, { $set: { status: "active", deactivatedAt: null, displayName: user.name } }, { upsert: false, new: true },
  );
  invitation.status = "accepted";
  invitation.acceptedAt = new Date();
  await invitation.save();
  if (models.CrmActivity) await models.CrmActivity.create({ workspaceId: invitation.workspaceId, type: "system", source: "crm", title: "Team invitation accepted; account activated", createdBy: user._id, metadata: { eventType: "team.invitation.accepted", invitationId: invitation._id, userId: user._id, roles: invitation.roles } });
  return { email: user.email, workspaceId: invitation.workspaceId };
}

module.exports = { acceptInvitation, cleanEmail, invitationHash, inviteMember, onboardAmbassador, onboardCoach, sendInvitation };
