const InvitationTemplate = require("../models/InvitationTemplate");
const WorkspaceConfig = require("../models/WorkspaceConfig");
const User = require("../models/User");
const defaults = Object.freeze({
  coach: { subject: "You’re invited to coach with {{workspaceName}}", body: "Hi {{firstName}},\n\n{{invitedBy}} invited you to join {{workspaceName}} as a Coach. Use the secure link below to create your account and access only your assigned coaching workspace.\n\n{{inviteLink}}\n\nWelcome to the team." },
  ambassador: { subject: "You’re invited to become a Brand Ambassador for {{workspaceName}}", body: "Hi {{firstName}},\n\n{{invitedBy}} invited you to join {{workspaceName}} as a Brand Ambassador. Activate your account to access your referral link, referral status, and payout history.\n\n{{inviteLink}}" },
  closer: { subject: "You’re invited to the {{workspaceName}} sales team", body: "Hi {{firstName}},\n\n{{invitedBy}} invited you to join {{workspaceName}} as a Closer / Sales team member. Activate your account to access only the sales records assigned to you.\n\n{{inviteLink}}" },
  general: { subject: "You’re invited to join {{workspaceName}}", body: "Hi {{firstName}},\n\n{{invitedBy}} invited you to join {{workspaceName}} as {{role}}. Create your account using this secure invitation link:\n\n{{inviteLink}}" },
});
function roleKey(roles = []) { return roles.includes("coach") ? "coach" : roles.includes("ambassador") ? "ambassador" : roles.includes("closer") ? "closer" : "general"; }
const FRIENDLY_TOKENS = Object.freeze({ firstName: "First name", displayName: "Full name", role: "Role", workspaceName: "Business name", inviteLink: "Secure invitation button", invitedBy: "Invited by" });
const tokenPattern = () => new RegExp(`(?:{{(${Object.keys(FRIENDLY_TOKENS).join("|")})}}|\\[(${Object.values(FRIENDLY_TOKENS).join("|")})\\])`, "g");
const friendlyKey = Object.freeze(Object.fromEntries(Object.entries(FRIENDLY_TOKENS).map(([key, label]) => [label, key])));
function substitute(value, variables, transform = (_key, resolved) => resolved) {
  return String(value || "").replace(tokenPattern(), (_match, internalKey, label) => {
    const key = internalKey || friendlyKey[label];
    return transform(key, String(variables[key] || ""));
  });
}
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
async function list(workspaceId, models = { InvitationTemplate }) { const saved = await models.InvitationTemplate.find({ workspaceId }).lean(); const map = new Map(saved.map((row) => [row.roleKey, row])); return Object.entries(defaults).map(([key, value]) => ({ roleKey: key, ...(map.get(key) || { ...value, version: 1, customized: false }), customized: Boolean(map.get(key)) })); }
async function get(workspaceId, key, models = { InvitationTemplate }) { const saved = await models.InvitationTemplate.findOne({ workspaceId, roleKey: key }).lean(); return saved || { roleKey: key, ...defaults[key], version: 1, customized: false }; }
async function save({ workspaceId, roleKey: key, subject, body, actorUserId }, models = { InvitationTemplate }) { if (!defaults[key]) throw new Error("Valid invitation role template required"); if (!String(subject || "").trim() || !String(body || "").trim()) throw new Error("Invitation subject and message are required"); const current = await models.InvitationTemplate.findOne({ workspaceId, roleKey: key }).lean(); return models.InvitationTemplate.findOneAndUpdate({ workspaceId, roleKey: key }, { $set: { subject: String(subject).trim(), body: String(body), version: (current?.version || 0) + 1, updatedBy: actorUserId } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
async function reset({ workspaceId, roleKey: key }, models = { InvitationTemplate }) { if (!defaults[key]) throw new Error("Valid invitation role template required"); await models.InvitationTemplate.deleteOne({ workspaceId, roleKey: key }); return { roleKey: key, ...defaults[key], version: 1, customized: false }; }
async function variables({ workspaceId, name, roles, inviteLink, invitedByUserId }, models = { WorkspaceConfig, User }) { const [config, inviter] = await Promise.all([models.WorkspaceConfig.findOne({ workspaceId, key: "primary" }).select("workspaceName invitationIdentity").lean(), models.User.findById(invitedByUserId).select("name").lean()]); const workspaceName = String(config?.workspaceName || "").trim(); if (!workspaceName) throw Object.assign(new Error("Set the Business/display name in Settings → Organization Profile before sending invitations."), { code: "INVITATION_BUSINESS_NAME_REQUIRED" }); return { firstName: String(name || "").trim().split(/\s+/)[0], displayName: name, role: roleKey(roles) === "general" ? (roles[0] || "Team Member") : ({ coach: "Coach", ambassador: "Brand Ambassador", closer: "Closer / Sales" })[roleKey(roles)], workspaceName, inviteLink, invitedBy: String(config?.invitationIdentity?.senderName || inviter?.name || "").trim(), replyToEmail: String(config?.invitationIdentity?.replyToEmail || "").trim() }; }
function render(template, vars) {
  const subject = substitute(template.subject, vars);
  const body = substitute(template.body, vars);
  const htmlBody = substitute(escapeHtml(template.body), vars, (key, resolved) => key === "inviteLink"
    ? `<a href="${escapeHtml(resolved)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#173f36;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a>`
    : escapeHtml(resolved));
  return { subject, body, html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${htmlBody.split("\n").map((line) => line ? `<p>${line}</p>` : "<br>").join("")}</div>` };
}
module.exports = { FRIENDLY_TOKENS, defaults, get, list, render, reset, roleKey, save, substitute, variables };
