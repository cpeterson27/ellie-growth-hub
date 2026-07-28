const crypto = require("crypto");

function secret() {
  return String(
    process.env.UNSUBSCRIBE_SIGNING_SECRET ||
    process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.RESEND_API_KEY ||
    "",
  ).trim();
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function createUnsubscribeToken(contact) {
  if (!secret()) throw new Error("Unsubscribe signing is not configured.");
  const payload = encode(JSON.stringify({
    contactId: String(contact._id),
    email: String(contact.email || "").toLowerCase(),
  }));
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyUnsubscribeToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !secret()) throw new Error("Invalid unsubscribe link.");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid unsubscribe link.");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function publicBackendUrl() {
  return String(
    process.env.PUBLIC_BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:5001",
  ).replace(/\/$/, "");
}

module.exports = { createUnsubscribeToken, verifyUnsubscribeToken, publicBackendUrl };
