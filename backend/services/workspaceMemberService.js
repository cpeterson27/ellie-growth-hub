const crypto = require("crypto");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const WorkspaceInvitation = require("../models/WorkspaceInvitation");
const CoachProfile = require("../models/CoachProfile");
const CoachingProgram = require("../models/CoachingProgram");
const AmbassadorProfile = require("../models/AmbassadorProfile");
const CrmActivity = require("../models/CrmActivity");
const integrationHub = require("./integrationHub");
const invitationTemplateService = require("./invitationTemplateService");
const ambassadorReferralIdentityService = require("./ambassadorReferralIdentityService");
const { hashPassword } = require("../utils/passwords");
const {
  legacyRoleFor,
  normalizeRoles,
} = require("../authorization/capabilities");

const dependencies = {
  User,
  Workspace,
  WorkspaceConfig,
  WorkspaceMembership,
  WorkspaceInvitation,
  CoachProfile,
  CoachingProgram,
  AmbassadorProfile,
  CrmActivity,
  integrationHub,
  invitationTemplateService,
};
const INVITATION_DAYS = 7;

async function workspaceConfigFor(workspaceId, models) {
  if (!models.WorkspaceConfig?.findOne) return null;
  if (models.WorkspaceConfig.collection?.findOne) {
    const direct = await models.WorkspaceConfig.collection.findOne({
      workspaceId,
      key: "primary",
    });
    if (direct) return direct;
  }
  const query = models.WorkspaceConfig.findOne({
    workspaceId,
    key: "primary",
  });
  const config = await query.select("workspaceName invitationIdentity").lean();
  return config;
}

async function requireOwnerActor(input, models) {
  if (!input.workspaceId || !input.actorUserId)
    throw Object.assign(
      new Error("An authenticated workspace Owner is required"),
      { code: "OWNER_ESCALATION_BLOCKED" },
    );
  const actor = await models.WorkspaceMembership.findOne({
    workspaceId: input.workspaceId,
    userId: input.actorUserId,
    status: "active",
  });
  if (
    !actor ||
    actor.status !== "active" ||
    !normalizeRoles(actor).includes("owner")
  ) {
    const error = new Error(
      "Only an active workspace Owner can grant or manage Owner invitations",
    );
    error.code = "OWNER_ESCALATION_BLOCKED";
    throw error;
  }
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function invitationHash(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}
async function publicFrontendUrl(workspaceId, models) {
  const workspace = workspaceId
    ? await models.Workspace.findById(workspaceId).select("publicHosts").lean()
    : null;
  const publicHost = (workspace?.publicHosts || [])
    .map((host) =>
      String(host || "")
        .trim()
        .toLowerCase(),
    )
    .find((host) => host && !host.startsWith("www."));
  if (publicHost) return `https://${publicHost}`;
  return String(
    process.env.PUBLIC_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173",
  )
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
}

function personIdentity(input) {
  const clean = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  const structured =
    input.firstName !== undefined || input.lastName !== undefined;
  const firstName = clean(input.firstName),
    lastName = clean(input.lastName);
  if (structured && (!firstName || !lastName))
    throw new Error("First name and last name are required");
  const name = structured ? [firstName, lastName].join(" ") : clean(input.name);
  const phone = String(input.phone || "").trim();
  if (
    name.length < 2 ||
    name.length > 120 ||
    firstName.length > 80 ||
    lastName.length > 80 ||
    phone.length > 50
  )
    throw new Error("Check the name and phone length");
  return { name, ...(structured ? { firstName, lastName } : {}), phone };
}

async function findOrCreateUser(
  { name, email, firstName, lastName, phone },
  models,
) {
  let user = await models.User.findOne({ email });
  if (user) return { user, created: false };
  try {
    user = await models.User.create({
      name,
      email,
      firstName,
      lastName,
      phone,
      passwordHash: await hashPassword(
        crypto.randomBytes(32).toString("base64url"),
      ),
    });
    return { user, created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    user = await models.User.findOne({ email });
    if (!user) throw error;
    return { user, created: false };
  }
}

async function deliverInvitation(
  {
    invitation,
    token = crypto.randomBytes(32).toString("base64url"),
    workspaceName,
    invitedBy = "",
    senderEmail = "",
    replyToEmail = "",
  },
  models,
) {
  workspaceName = String(workspaceName || "").trim();
  if (!workspaceName)
    throw Object.assign(
      new Error(
        "Set the Business/display name in Settings → Organization Profile before sending invitations.",
      ),
      { code: "INVITATION_BUSINESS_NAME_REQUIRED" },
    );
  const acceptUrl = `${await publicFrontendUrl(
    invitation.workspaceId,
    models,
  )}/accept-invitation/${encodeURIComponent(token)}`;
  const workspace = invitation.workspaceId
    ? await models.Workspace.findById(invitation.workspaceId)
        .select("publicHosts")
        .lean()
    : null;
  const configuredFallback = String(process.env.EMAIL_FROM || "").trim();
  const fallbackDomain = configuredFallback
    .match(/@([^>\s]+)/)?.[1]
    ?.toLowerCase();
  const mappedHost = (workspace?.publicHosts || []).find(
    (host) => host && !String(host).toLowerCase().startsWith("www."),
  );
  if (!senderEmail && mappedHost && fallbackDomain !== mappedHost) {
    throw new Error(
      "Set the workspace invitation sender email in Organization Profile before sending.",
    );
  }
  const from = senderEmail
    ? `${invitedBy || workspaceName} <${senderEmail}>`
    : configuredFallback || "Lead Porch <onboarding@resend.dev>";
  const vars = {
    firstName: invitation.name.split(/\s+/)[0],
    displayName: invitation.name,
    role:
      invitation.roleKey === "ambassador"
        ? "Brand Ambassador"
        : invitation.roleKey === "closer"
          ? "Closer / Sales"
          : invitation.roleKey === "coach"
            ? "Coach"
            : invitation.roles[0] || "Team Member",
    workspaceName,
    inviteLink: acceptUrl,
    invitedBy,
  };
  for (const [key, message] of Object.entries({
    firstName: "Recipient first name is required before sending.",
    displayName: "Recipient full name is required before sending.",
    role: "Invitation role is required before sending.",
    workspaceName: "Business/display name is required before sending.",
    invitedBy: "Inviter name is required before sending.",
    inviteLink: "Secure invitation link is required before sending.",
  }))
    if (!String(vars[key] || "").trim())
      throw Object.assign(new Error(message), {
        code: `INVITATION_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_REQUIRED`,
      });
  const rendered = invitationTemplateService.render(
    { subject: invitation.subject, body: invitation.body },
    vars,
  );
  const previousAuthorization = {
    tokenHash: invitation.tokenHash,
    expiresAt: invitation.expiresAt,
    status: invitation.status,
  };
  invitation.tokenHash = invitationHash(token);
  invitation.expiresAt = new Date(Date.now() + INVITATION_DAYS * 86400000);
  invitation.renderedSubject = rendered.subject;
  invitation.renderedBody = rendered.body;
  try {
    await models.integrationHub.execute("resend", "sendEmail", {
      from,
      to: invitation.email,
      subject: rendered.subject,
      text: rendered.body,
      html: rendered.html,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
    });
    invitation.deliveryStatus = "sent";
    invitation.status = "pending";
    invitation.sentAt = new Date();
    invitation.deliveryError = "";
  } catch (error) {
    invitation.tokenHash =
      previousAuthorization.tokenHash || invitation.tokenHash;
    invitation.expiresAt =
      previousAuthorization.expiresAt || invitation.expiresAt;
    invitation.status = previousAuthorization.status;
    invitation.deliveryStatus = "failed";
    invitation.deliveryError = String(
      error?.message || "Invitation delivery failed",
    ).slice(0, 500);
  }
  invitation.deliveryHistory = invitation.deliveryHistory || [];
  invitation.deliveryHistory.push({
    sentAt: new Date(),
    status: invitation.deliveryStatus,
    templateVersion: invitation.templateVersion || 1,
    subject: rendered.subject,
    body: rendered.body,
    invitedBy: invitation.invitedBy,
  });
  await invitation.save();
  if (models.CrmActivity)
    await models.CrmActivity.create({
      source: "crm",
      title:
        invitation.deliveryStatus === "sent"
          ? "Team invitation sent"
          : "Team invitation delivery failed",
      createdBy: invitation.invitedBy,
      metadata: {
        eventType:
          invitation.deliveryStatus === "sent"
            ? "team.invitation.sent"
            : "team.invitation.failed",
        invitationId: invitation._id,
        userId: invitation.userId,
        roles: invitation.roles,
      },
    });
  return {
    deliveryStatus: invitation.deliveryStatus,
    deliveryError: invitation.deliveryError || "",
    ...(process.env.NODE_ENV === "production" ? {} : { acceptUrl }),
  };
}

async function inviteMember(input, models = dependencies) {
  const identity = personIdentity(input);
  const email = cleanEmail(input.email);
  let name = identity.name;
  if (!email.includes("@") || name.length < 2)
    throw new Error("Enter a name and valid email");
  const roles = [
    ...new Set(
      (input.roles || []).filter((role) =>
        [
          "owner",
          "admin",
          "coach",
          "closer",
          "ambassador",
          "member",
          "viewer",
        ].includes(role),
      ),
    ),
  ];
  if (!roles.length) roles.push("member");
  if (roles.includes("owner")) await requireOwnerActor(input, models);
  const { user, created: userCreated } = await findOrCreateUser(
    { ...identity, email },
    models,
  );
  name = String(name || "").trim();
  const existing = await models.WorkspaceMembership.findOne({
    workspaceId: input.workspaceId,
    userId: user._id,
  });
  const establishedElsewhere =
    !userCreated &&
    Boolean(
      models.WorkspaceMembership.exists &&
      (await models.WorkspaceMembership.exists({
        userId: user._id,
        status: "active",
        ...(existing?._id ? { _id: { $ne: existing._id } } : {}),
      })),
    );
  if (existing && normalizeRoles(existing).includes("owner"))
    await requireOwnerActor(input, models);
  // Reuse established global identity. Only fill missing fields for an existing
  // membership in this workspace; never edit a foreign workspace's user.
  if (existing) {
    let enriched = false;
    const parts = String(user.name || name)
      .trim()
      .split(/\s+/);
    const missingValues = {
      firstName: parts.shift() || "",
      lastName: parts.join(" "),
      phone: identity.phone,
    };
    for (const key of ["firstName", "lastName", "phone"]) {
      if (!user[key] && identity[key] && missingValues[key]) {
        user[key] = missingValues[key];
        enriched = true;
      }
    }
    if (enriched) await user.save();
  }
  if (existing?.status === "active") {
    const combinedRoles = [...new Set([...normalizeRoles(existing), ...roles])];
    existing.roles = combinedRoles;
    existing.role = legacyRoleFor(combinedRoles);
    await existing.save();
    return {
      user,
      membership: existing,
      invitation: null,
      alreadyActive: true,
    };
  }
  const membership = await models.WorkspaceMembership.findOneAndUpdate(
    { workspaceId: input.workspaceId, userId: user._id },
    { $set: { role: legacyRoleFor(roles), roles, status: "invited" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const token = crypto.randomBytes(32).toString("base64url");
  const key = invitationTemplateService.roleKey(roles);
  const template =
    input.invitationSubject && input.invitationBody
      ? {
          subject: input.invitationSubject,
          body: input.invitationBody,
          version: input.templateVersion || 1,
        }
      : models.invitationTemplateService
        ? await models.invitationTemplateService.get(input.workspaceId, key)
        : { ...invitationTemplateService.defaults[key], version: 1 };
  const invitation = await models.WorkspaceInvitation.findOneAndUpdate(
    { workspaceId: input.workspaceId, email },
    {
      $set: {
        userId: user._id,
        name,
        roles,
        requiresAccountActivation: userCreated || !establishedElsewhere,
        tokenHash: invitationHash(token),
        status: "ready",
        deliveryStatus: "pending",
        deliveryError: "",
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000),
        acceptedAt: null,
        sentAt: null,
        invitedBy: input.actorUserId,
        roleKey: key,
        templateVersion: template.version || 1,
        subject: template.subject,
        body: template.body,
        renderedSubject: "",
        renderedBody: "",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  let delivery = null;
  if (input.deliverInvitation === true) {
    const [workspace, config, inviter] = await Promise.all([
      models.Workspace.findById(input.workspaceId).select("name").lean(),
      workspaceConfigFor(input.workspaceId, models),
      models.User.findById(input.actorUserId).select("name").lean(),
    ]);
    delivery = await deliverInvitation(
      {
        invitation,
        token,
        workspaceName: config?.workspaceName || workspace?.name,
        invitedBy: config?.invitationIdentity?.senderName || inviter?.name,
        senderEmail: config?.invitationIdentity?.senderEmail || "",
        replyToEmail: config?.invitationIdentity?.replyToEmail || "",
      },
      models,
    );
  }
  return {
    user,
    membership,
    invitation,
    delivery,
    invitationToken: token,
    alreadyActive: false,
  };
}

async function onboardCoach(input, models = dependencies) {
  const requestedProgramIds = [
    ...new Set(
      (Array.isArray(input.programIds) ? input.programIds : [])
        .map(String)
        .filter(Boolean),
    ),
  ];
  const programs = requestedProgramIds.length
    ? await models.CoachingProgram.find({
        workspaceId: input.workspaceId,
        _id: { $in: requestedProgramIds },
        status: { $ne: "archived" },
      })
        .select("_id")
        .lean()
    : [];
  if (programs.length !== requestedProgramIds.length) {
    const error = new Error(
      "Every coaching program must belong to this workspace",
    );
    error.code = "PROGRAM_WORKSPACE_MISMATCH";
    throw error;
  }
  const invited = await inviteMember(
    {
      ...input,
      roles: [...new Set([...(input.roles || []), "coach"])],
      deliverInvitation: false,
    },
    models,
  );
  const active = invited.membership.status === "active";
  const update = {
    displayName: invited.user.name,
    timezone: String(input.timezone || "").trim(),
    capacity:
      input.capacity == null || input.capacity === ""
        ? null
        : Math.max(0, Number(input.capacity) || 0),
    status: active ? "active" : "inactive",
    deactivatedAt: active ? null : new Date(),
  };
  const coachProfile = await models.CoachProfile.findOneAndUpdate(
    { workspaceId: input.workspaceId, userId: invited.user._id },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  invited.membership.responsibilities =
    invited.membership.responsibilities || {};
  invited.membership.responsibilities.programIds = programs.map(
    (program) => program._id,
  );
  await invited.membership.save();
  return { ...invited, coachProfile };
}

async function availableAmbassadorCode(input, models) {
  if (input.referralCode) {
    const requested = ambassadorReferralIdentityService.validateCustomCode(
      input.referralCode,
    );
    if (
      await ambassadorReferralIdentityService.codeExists(
        { workspaceId: input.workspaceId, code: requested },
        models,
      )
    )
      throw Object.assign(
        new Error("That referral code is already used in this workspace."),
        { code: "AMBASSADOR_REFERRAL_CODE_CONFLICT" },
      );
    return requested;
  }
  return ambassadorReferralIdentityService.availableCode(
    { workspaceId: input.workspaceId, name: input.name },
    models,
  );
}

async function onboardAmbassador(input, models = dependencies) {
  const invited = await inviteMember(
    {
      ...input,
      roles: [...new Set([...(input.roles || []), "ambassador"])],
      deliverInvitation: false,
    },
    models,
  );
  const existing = await models.AmbassadorProfile.findOne({
    workspaceId: input.workspaceId,
    userId: invited.user._id,
  });
  const code =
    existing?.referralCode ||
    (await availableAmbassadorCode(
      { ...input, name: invited.user.name },
      models,
    ));
  const active = invited.membership.status === "active";
  const values = {
    displayName: invited.user.name,
    status: active ? "active" : "invited",
    referralCode: code,
    referralSlug: code,
    contactId: input.contactId || existing?.contactId || null,
    communityUrl:
      input.communityUrl === undefined
        ? existing?.communityUrl || ""
        : ambassadorReferralIdentityService.validateCommunityUrl(
            input.communityUrl,
          ),
    startDate: input.startDate || existing?.startDate || new Date(),
    notes: String(input.notes || existing?.notes || "").trim(),
    deactivatedAt: active ? null : existing?.deactivatedAt || null,
    commissionConfig: {
      mode: ["manual", "percent", "fixed"].includes(
        input.commissionConfig?.mode,
      )
        ? input.commissionConfig.mode
        : existing?.commissionConfig?.mode || "manual",
      rateBps: Math.min(
        10000,
        Math.max(
          0,
          Number(
            input.commissionConfig?.rateBps ??
              existing?.commissionConfig?.rateBps,
          ) || 0,
        ),
      ),
      fixedAmountMinor: Math.max(
        0,
        Number(
          input.commissionConfig?.fixedAmountMinor ??
            existing?.commissionConfig?.fixedAmountMinor,
        ) || 0,
      ),
      currency: String(
        input.commissionConfig?.currency ||
          existing?.commissionConfig?.currency ||
          "USD",
      )
        .toUpperCase()
        .slice(0, 3),
    },
  };
  let ambassadorProfile;
  try {
    ambassadorProfile = await models.AmbassadorProfile.findOneAndUpdate(
      { workspaceId: input.workspaceId, userId: invited.user._id },
      { $set: values },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );
  } catch (error) {
    if (error?.code !== 11000 || existing) throw error;
    const retryCode = await ambassadorReferralIdentityService.availableCode(
      { workspaceId: input.workspaceId, name: invited.user.name },
      models,
    );
    values.referralCode = retryCode;
    values.referralSlug = retryCode;
    ambassadorProfile = await models.AmbassadorProfile.findOneAndUpdate(
      { workspaceId: input.workspaceId, userId: invited.user._id },
      { $set: values },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );
  }
  if (models.CrmActivity)
    await models.CrmActivity.create({
      workspaceId: input.workspaceId,
      type: "system",
      source: "crm",
      title: existing
        ? "Ambassador onboarding updated"
        : "Ambassador invitation prepared",
      createdBy: input.actorUserId,
      metadata: {
        eventType: existing
          ? "ambassador.onboarding.updated"
          : "ambassador.added",
        ambassadorProfileId: ambassadorProfile._id,
        userId: invited.user._id,
        invitationId: invited.invitation?._id || null,
      },
    });
  return { ...invited, ambassadorProfile };
}

async function sendInvitation(
  { workspaceId, invitationId, subject, body, actorUserId },
  models = dependencies,
) {
  const invitation = await models.WorkspaceInvitation.findOne({
    _id: invitationId,
    workspaceId,
  });
  if (
    !invitation ||
    invitation.status === "accepted" ||
    invitation.status === "revoked"
  )
    throw new Error("Invitation is not available to send");
  if (invitation.roles?.includes("owner"))
    await requireOwnerActor({ workspaceId, actorUserId }, models);
  if (subject !== undefined)
    invitation.subject = String(subject).trim().slice(0, 300);
  if (body !== undefined) invitation.body = String(body).slice(0, 10000);
  if (!invitation.subject || !invitation.body)
    throw new Error("Invitation subject and message are required");
  const token = crypto.randomBytes(32).toString("base64url");
  const [workspace, config, inviter] = await Promise.all([
    models.Workspace.findById(workspaceId).select("name").lean(),
    workspaceConfigFor(workspaceId, models),
    models.User.findById(invitation.invitedBy).select("name").lean(),
  ]);
  const delivery = await deliverInvitation(
    {
      invitation,
      token,
      workspaceName: config?.workspaceName || workspace?.name,
      invitedBy: config?.invitationIdentity?.senderName || inviter?.name,
      replyToEmail: config?.invitationIdentity?.replyToEmail || "",
    },
    models,
  );
  if (delivery.deliveryStatus !== "sent") {
    const error = new Error(
      "Invitation email could not be sent. Check the email connection and try again.",
    );
    error.code = "INVITATION_DELIVERY_FAILED";
    error.deliveryError = delivery.deliveryError || "";
    throw error;
  }
  return delivery;
}

async function removeMember(
  { workspaceId, membershipId, actorUserId, actorRoles = [] },
  models = dependencies,
) {
  const membership = await models.WorkspaceMembership.findOne({
    _id: membershipId,
    workspaceId,
  });
  if (!membership) {
    const error = new Error("Team member not found");
    error.code = "MEMBER_NOT_FOUND";
    throw error;
  }
  if (
    String(membership.userId?._id || membership.userId) === String(actorUserId)
  ) {
    const error = new Error("You cannot remove your own workspace membership");
    error.code = "MEMBER_SELF_REMOVAL_BLOCKED";
    throw error;
  }
  const roles = normalizeRoles(membership);
  if (roles.includes("owner") && !actorRoles.includes("owner")) {
    const error = new Error("Only an Owner can remove another Owner");
    error.code = "OWNER_ESCALATION_BLOCKED";
    throw error;
  }
  if (roles.includes("owner")) {
    const activeOwnerCount = await models.WorkspaceMembership.countDocuments({
      workspaceId,
      status: "active",
      $or: [{ role: "owner" }, { roles: "owner" }],
    });
    if (membership.status === "active" && activeOwnerCount <= 1) {
      const error = new Error(
        "The last active workspace Owner cannot be removed",
      );
      error.code = "OWNER_LOCKOUT_BLOCKED";
      throw error;
    }
  }
  await models.WorkspaceInvitation.updateMany(
    {
      workspaceId,
      userId: membership.userId,
      status: { $in: ["draft", "ready", "pending", "expired"] },
    },
    { $set: { status: "revoked", expiresAt: new Date() } },
  );
  await membership.deleteOne();
  return {
    id: membership._id,
    userId: membership.userId?._id || membership.userId,
  };
}

async function acceptInvitation(
  { token, password, name, firstName, lastName, phone },
  models = dependencies,
) {
  const invitation = await models.WorkspaceInvitation.findOne({
    tokenHash: invitationHash(token),
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).select("+tokenHash +deliveryError");
  if (!invitation) {
    const error = new Error("This invitation is invalid or has expired");
    error.code = "INVITATION_INVALID";
    throw error;
  }
  const user = await models.User.findById(invitation.userId).select(
    "+passwordHash",
  );
  const membership = await models.WorkspaceMembership.findOne({
    workspaceId: invitation.workspaceId,
    userId: invitation.userId,
  });
  if (!user || !membership || membership.status !== "invited") {
    const error = new Error("This invitation is no longer available");
    error.code = "INVITATION_INVALID";
    throw error;
  }
  const hasActiveMembership = Boolean(
    models.WorkspaceMembership.exists &&
    (await models.WorkspaceMembership.exists({
      userId: user._id,
      status: "active",
      _id: { $ne: membership._id },
    })),
  );
  const requiresAccountActivation =
    invitation.requiresAccountActivation !== false && !hasActiveMembership;
  const identity = personIdentity({
    name: name || invitation.name || user.name,
    firstName,
    lastName,
    phone: phone === undefined ? user.phone : phone,
  });
  if (requiresAccountActivation)
    user.passwordHash = await hashPassword(password);
  Object.assign(user, identity);
  user.status = "active";
  await user.save();
  membership.status = "active";
  await membership.save();
  if (normalizeRoles(membership).includes("coach"))
    await models.CoachProfile.findOneAndUpdate(
      { workspaceId: invitation.workspaceId, userId: user._id },
      {
        $set: { status: "active", deactivatedAt: null, displayName: user.name },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  if (normalizeRoles(membership).includes("ambassador"))
    await models.AmbassadorProfile.findOneAndUpdate(
      { workspaceId: invitation.workspaceId, userId: user._id },
      {
        $set: { status: "active", deactivatedAt: null, displayName: user.name },
      },
      { upsert: false, new: true },
    );
  invitation.status = "accepted";
  invitation.acceptedAt = new Date();
  await invitation.save();
  if (models.CrmActivity)
    await models.CrmActivity.create({
      workspaceId: invitation.workspaceId,
      type: "system",
      source: "crm",
      title: "Team invitation accepted; account activated",
      createdBy: user._id,
      metadata: {
        eventType: "team.invitation.accepted",
        invitationId: invitation._id,
        userId: user._id,
        roles: invitation.roles,
      },
    });
  return { email: user.email, workspaceId: invitation.workspaceId };
}

module.exports = {
  acceptInvitation,
  cleanEmail,
  invitationHash,
  inviteMember,
  onboardAmbassador,
  onboardCoach,
  removeMember,
  sendInvitation,
};
