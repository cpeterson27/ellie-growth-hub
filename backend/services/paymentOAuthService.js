const crypto = require("crypto");
const PaymentOAuthState = require("../models/PaymentOAuthState");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const Workspace = require("../models/Workspace");
const { effectivePermissions } = require("../authorization/capabilities");

const b64 = (value) => Buffer.from(value).toString("base64url");
const secret = () => process.env.PAYMENT_OAUTH_STATE_SECRET || process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY;
const sign = (encoded) => crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function createPaymentOAuthState({ provider, workspaceId, userId }, deps = {}) {
  if (!secret()) throw Object.assign(new Error("Payment OAuth state signing is not configured"), { code: "PAYMENT_OAUTH_NOT_CONFIGURED" });
  const nonce = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await (deps.PaymentOAuthState || PaymentOAuthState).create({ provider, workspaceId, userId, nonceHash: hash(nonce), expiresAt });
  const encoded = b64(JSON.stringify({ provider, workspaceId: String(workspaceId), userId: String(userId), nonce, exp: expiresAt.getTime() }));
  return `${encoded}.${sign(encoded)}`;
}
async function consumePaymentOAuthState(state, deps = {}) {
  const [encoded, signature] = String(state || "").split(".");
  const expected = encoded && secret() ? Buffer.from(sign(encoded)) : Buffer.alloc(0); const received = Buffer.from(signature || "");
  if (!encoded || !signature || !secret() || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw Object.assign(new Error("OAuth state is invalid"), { code: "PAYMENT_OAUTH_STATE_INVALID" });
  let payload; try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw Object.assign(new Error("OAuth state is malformed"), { code: "PAYMENT_OAUTH_STATE_INVALID" }); }
  if (payload.exp <= Date.now()) throw Object.assign(new Error("OAuth state expired"), { code: "PAYMENT_OAUTH_STATE_EXPIRED" });
  const stateModel = deps.PaymentOAuthState || PaymentOAuthState;
  const membershipModel = deps.WorkspaceMembership || WorkspaceMembership;
  const workspaceModel = deps.Workspace || Workspace;
  const record = await stateModel.findOneAndUpdate({ provider: payload.provider, workspaceId: payload.workspaceId, userId: payload.userId, nonceHash: hash(payload.nonce), consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!record) throw Object.assign(new Error("OAuth state was already used or is invalid"), { code: "PAYMENT_OAUTH_STATE_REPLAYED" });
  const [membership, workspace] = await Promise.all([membershipModel.findOne({ workspaceId: payload.workspaceId, userId: payload.userId, status: "active" }), workspaceModel.findById(payload.workspaceId)]);
  if (!membership || !workspace || !effectivePermissions(membership, workspace).includes("payments.manage")) throw Object.assign(new Error("Payment connection access is no longer authorized"), { code: "PAYMENT_OAUTH_ACCESS_REVOKED" });
  return payload;
}
module.exports = { createPaymentOAuthState, consumePaymentOAuthState };
