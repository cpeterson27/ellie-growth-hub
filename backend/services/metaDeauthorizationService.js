const crypto = require("node:crypto");
const SocialConnection = require("../models/SocialConnection");

const dependencies = { SocialConnection };

function decodeBase64Url(value) {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Malformed signed_request");
  }
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function validateSignedRequest(signedRequest, appSecret = process.env.META_APP_SECRET) {
  if (!appSecret) throw new Error("Meta deauthorization is not configured");
  if (typeof signedRequest !== "string") throw new Error("Malformed signed_request");
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Malformed signed_request");

  const supplied = decodeBase64Url(parts[0]);
  const expected = crypto.createHmac("sha256", appSecret).update(parts[1]).digest();
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid signed_request signature");
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(parts[1]).toString("utf8"));
  } catch {
    throw new Error("Malformed signed_request payload");
  }
  if (String(payload.algorithm || "").toUpperCase() !== "HMAC-SHA256") {
    throw new Error("Unsupported signed_request algorithm");
  }
  const providerUserId = String(payload.user_id || "").trim();
  if (!providerUserId) throw new Error("signed_request does not identify an authorization");
  return { providerUserId };
}

async function deauthorize(signedRequest, models = dependencies) {
  const { providerUserId } = validateSignedRequest(signedRequest);
  const result = await models.SocialConnection.updateMany(
    {
      provider: { $in: ["meta", "instagram"] },
      $or: [
        { "authorization.userId": providerUserId },
        { "providerAccount.id": providerUserId },
      ],
    },
    {
      $set: {
        status: "disconnected",
        assets: [],
        selectedAssetIds: [],
        webhookSubscriptions: [],
        scopes: [],
        declinedScopes: [],
        authorization: { valid: false, userId: "", dataAccessExpiresAt: null, verifiedAt: null },
        providerAccount: {},
        connectedAt: null,
        lastVerifiedAt: null,
        lastError: "",
      },
      $unset: { credentialsEncrypted: 1, expiresAt: 1 },
    },
  );
  return { disconnected: Number(result?.modifiedCount || 0) };
}

module.exports = { deauthorize, validateSignedRequest };
