const crypto = require("crypto");
const express = require("express");
const AuthSession = require("../models/AuthSession");
const User = require("../models/User");
require("../models/Workspace");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const { ACTIVE_ROLES } = require("../authorization/accessPolicy");
const { normalizeRoles } = require("../authorization/capabilities");
const { hashPassword, verifyPassword } = require("../utils/passwords");
const workspaceMemberService = require("../services/workspaceMemberService");
const imageAssetService = require("../services/imageAssetService");
const {
  clearSessionCookie,
  createAuthContext,
  requireAuth,
  sessionCookie,
  sessionToken,
  tokenHash,
} = require("../middleware/auth");

const router = express.Router();
const SESSION_DAYS = 14;

router.get("/invitations/:token", async (req, res) => {
  try {
    const WorkspaceInvitation = require("../models/WorkspaceInvitation");
    const invitation = await WorkspaceInvitation.findOne({ tokenHash: workspaceMemberService.invitationHash(req.params.token), status: "pending", expiresAt: { $gt: new Date() } }).select("name email expiresAt").lean();
    return invitation ? res.json({ valid: true, name: invitation.name, email: invitation.email, expiresAt: invitation.expiresAt }) : res.status(404).json({ valid: false, error: "This invitation is invalid or has expired" });
  } catch (_error) { return res.status(400).json({ valid: false, error: "Unable to verify invitation" }); }
});

router.post("/invitations/:token/accept", async (req, res) => {
  try {
    await workspaceMemberService.acceptInvitation({ token: req.params.token, password: req.body?.password, name: req.body?.name, firstName: req.body?.firstName, lastName: req.body?.lastName, phone: req.body?.phone });
    return res.json({ success: true });
  } catch (error) { return res.status(400).json({ error: error.message || "Unable to accept invitation", code: error.code }); }
});

function publicSession(req) {
  return {
    user: { id: req.auth.user._id, name: req.auth.user.name, email: req.auth.user.email, avatarUrl: req.auth.user.avatarUrl || "" },
    workspace: {
      id: req.auth.workspace._id,
      name: req.auth.workspace.name,
      slug: req.auth.workspace.slug,
      billingStatus: req.auth.workspace.billingStatus,
    },
    role: req.auth.role,
    roles: req.auth.roles,
    effectivePermissions: req.auth.effectivePermissions,
    membershipStatus: "active",
    isPlatformOwner: Boolean(req.auth.isPlatformOwner),
    csrfToken: req.auth.session.csrfToken,
  };
}

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await User.findOne({ email, status: "active" }).select("+passwordHash");
    const passwordValid = user && await verifyPassword(req.body?.password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }

    const membership = await WorkspaceMembership.findOne({ userId: user._id, status: "active" })
      .populate("workspaceId", "name slug status billingStatus rolePermissionTemplates");
    if (!membership?.workspaceId || membership.workspaceId.status !== "active") {
      return res.status(403).json({ error: "No active workspace is available for this account" });
    }
    if (!normalizeRoles(membership).some((role) => ACTIVE_ROLES.includes(role))) {
      return res.status(403).json({ error: "A valid workspace role is required", code: "ROLE_INVALID" });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const session = await AuthSession.create({
      tokenHash: tokenHash(token),
      csrfToken,
      userId: user._id,
      workspaceId: membership.workspaceId._id,
      expiresAt,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    });

    user.lastLoginAt = new Date();
    await user.save();
    res.setHeader("Set-Cookie", sessionCookie(token, expiresAt));
    req.auth = createAuthContext({ user, workspace: membership.workspaceId, membership, session });
    res.json({ ...publicSession(req), sessionToken: token });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.get("/session", requireAuth, (req, res) => res.json(publicSession(req)));

router.get("/profile", requireAuth, async (req, res) => {
  try { return res.json({ user: await require("../services/userProfileService").load(req.auth) }); }
  catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to load profile" }); }
});
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const previous = await require("../services/userProfileService").load(req.auth);
    const user = await require("../services/userProfileService").save(req.auth, req.body);
    await require("../services/ambassadorProfileActivity").recordProfileUpdate({ workspaceId: req.auth.workspaceId, userId: req.auth.userId, previous, user });
    return res.json({ user });
  } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : "Unable to save profile" }); }
});

router.post("/profile/avatar", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.user._id).select("+avatarPublicId");
    if (!user) return res.status(404).json({ error: "User profile not found" });
    const previousPublicId = user.avatarPublicId;
    const uploaded = await imageAssetService.uploadImage({ file: req.body?.file, folder: "growth-operator/profile-avatars", transformation: "c_fill,g_face,h_512,w_512,q_auto,f_auto" });
    user.avatarUrl = uploaded.url; user.avatarPublicId = uploaded.publicId; await user.save();
    await require("../services/ambassadorProfileActivity").recordHeadshot({ workspaceId: req.auth.workspaceId, user });
    if (previousPublicId && previousPublicId !== uploaded.publicId) imageAssetService.removeImage(previousPublicId).catch(() => {});
    return res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (error) { return res.status(error.status || 502).json({ error: error.message || "Profile photo upload failed", code: error.code }); }
});

router.delete("/profile/avatar", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.user._id).select("+avatarPublicId");
    if (!user) return res.status(404).json({ error: "User profile not found" });
    const previousPublicId = user.avatarPublicId; user.avatarUrl = ""; user.avatarPublicId = ""; await user.save();
    if (previousPublicId) imageAssetService.removeImage(previousPublicId).catch(() => {});
    return res.json({ user: { id: user._id, name: user.name, email: user.email, avatarUrl: "" } });
  } catch (error) { return res.status(error.status || 502).json({ error: error.message || "Unable to remove profile photo", code: error.code }); }
});

router.patch("/password", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.user._id).select("+passwordHash");
    if (!user || !await verifyPassword(req.body?.currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    if (req.body?.newPassword !== req.body?.confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }
    user.passwordHash = await hashPassword(req.body?.newPassword);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id, _id: { $ne: req.auth.session._id } });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to change password" });
  }
});

router.post("/logout", async (req, res) => {
  const token = sessionToken(req);
  if (token) await AuthSession.deleteOne({ tokenHash: tokenHash(token) });
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(204).end();
});

module.exports = router;
