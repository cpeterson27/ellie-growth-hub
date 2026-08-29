const AmbassadorProfile = require("../models/AmbassadorProfile");
const CoachProfile = require("../models/CoachProfile");
const CrmActivity = require("../models/CrmActivity");

const dependencies = { AmbassadorProfile, CoachProfile, CrmActivity };
const MIN_CODE_LENGTH = 3;
const MAX_CODE_LENGTH = 70;

function failure(message, code) { const error = new Error(message); error.code = code; return error; }
function normalizeReferralCode(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_CODE_LENGTH).replace(/-+$/g, "");
}
function validateCustomCode(value) {
  const raw = String(value || "").trim();
  if (!/^[a-z0-9-]+$/i.test(raw) || raw.startsWith("-") || raw.endsWith("-") || raw.includes("--")) throw failure("Use 3–70 letters, numbers, or single hyphens. Do not start or end with a hyphen.", "AMBASSADOR_REFERRAL_CODE_INVALID");
  const normalized = raw.toLowerCase();
  if (normalized.length < MIN_CODE_LENGTH || normalized.length > MAX_CODE_LENGTH) throw failure("Referral code must be 3–70 characters.", "AMBASSADOR_REFERRAL_CODE_INVALID");
  return normalized;
}
function validateCommunityUrl(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  try { const parsed = new URL(clean); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol"); return parsed.toString(); }
  catch { throw failure("Enter a complete http:// or https:// community URL, or leave this field blank.", "AMBASSADOR_COMMUNITY_URL_INVALID"); }
}
function frontendBaseUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_FRONTEND_URL || environment.FRONTEND_URL || "").split(",")[0].trim().replace(/\/$/, "");
  if (configured) return configured;
  if (environment.NODE_ENV === "production") throw failure("Configure PUBLIC_FRONTEND_URL before using ambassador referral links.", "REFERRAL_FRONTEND_URL_REQUIRED");
  return "http://localhost:5173";
}
function referralUrl(code, environment = process.env) { return `${frontendBaseUrl(environment)}/ref/${encodeURIComponent(validateCustomCode(code))}`; }
async function codeExists({ workspaceId, code, excludeProfileId = null }, models = dependencies) {
  const exact = new RegExp(`^${code}$`, "i");
  const ambassadorFilter = { workspaceId, $or: [{ referralCode: exact }, { referralSlug: exact }] };
  if (excludeProfileId) ambassadorFilter._id = { $ne: excludeProfileId };
  const [ambassador, coach] = await Promise.all([
    models.AmbassadorProfile.findOne(ambassadorFilter).select("_id").lean(),
    models.CoachProfile.findOne({ workspaceId, $or: [{ referralCode: exact }, { referralSlug: exact }] }).select("_id").lean(),
  ]);
  return Boolean(ambassador || coach);
}
async function availableCode({ workspaceId, name, excludeProfileId = null }, models = dependencies) {
  const base = normalizeReferralCode(name) || "ambassador";
  for (let number = 1; number <= 10000; number += 1) {
    const suffix = number === 1 ? "" : `-${number}`;
    const candidate = `${base.slice(0, MAX_CODE_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!await codeExists({ workspaceId, code: candidate, excludeProfileId }, models)) return candidate;
  }
  throw failure("Growth Operator could not generate a unique referral code. Try a custom code.", "AMBASSADOR_REFERRAL_GENERATION_FAILED");
}
async function updateIdentity({ workspaceId, profileId, referralCode: requestedCode, regenerate = false, actorUserId }, models = dependencies) {
  const profile = await models.AmbassadorProfile.findOne({ _id: profileId, workspaceId });
  if (!profile) throw failure("Ambassador profile not found", "AMBASSADOR_NOT_FOUND");
  const next = regenerate ? await availableCode({ workspaceId, name: profile.displayName, excludeProfileId: profile._id }, models) : validateCustomCode(requestedCode);
  if (await codeExists({ workspaceId, code: next, excludeProfileId: profile._id }, models)) throw failure("That referral code is already used in this workspace.", "AMBASSADOR_REFERRAL_CODE_CONFLICT");
  const previousCode = profile.referralCode;
  profile.referralCode = next;
  profile.referralSlug = next;
  try { await profile.save(); }
  catch (error) { if (error?.code === 11000) throw failure("That referral code is already used in this workspace.", "AMBASSADOR_REFERRAL_CODE_CONFLICT"); throw error; }
  if (previousCode !== next && models.CrmActivity) await models.CrmActivity.create({ workspaceId, type: "system", source: "crm", title: regenerate ? "Ambassador referral code regenerated" : "Ambassador referral code changed", createdBy: actorUserId, metadata: { eventType: "ambassador.referral_identity.changed", ambassadorProfileId: profile._id, previousReferralCode: previousCode, referralCode: next } });
  return { profile, referralUrl: referralUrl(next) };
}

module.exports = { MAX_CODE_LENGTH, MIN_CODE_LENGTH, availableCode, codeExists, frontendBaseUrl, normalizeReferralCode, referralUrl, updateIdentity, validateCommunityUrl, validateCustomCode };
