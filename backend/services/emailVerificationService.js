const axios = require("axios");
const crypto = require("crypto");

const emailable = axios.create({
  baseURL: "https://api.emailable.com/v1",
  timeout: 20000,
});

function getApiKey() {
  return String(process.env.EMAILABLE_API_KEY || "").trim();
}

function requireApiKey() {
  const key = getApiKey();
  if (!key) {
    const error = new Error("Email verification is not configured");
    error.code = "email_verification_not_configured";
    throw error;
  }
  return key;
}

function cleanEmails(emails) {
  return [...new Set(
    (Array.isArray(emails) ? emails : [])
      .map((email) => String(email || "").trim().toLowerCase())
      .filter(Boolean),
  )];
}

function fingerprintEmails(emails) {
  return crypto.createHash("sha256").update(cleanEmails(emails).sort().join("\n")).digest("hex");
}

function normalizeVerificationResult(result = {}) {
  const email = String(result.email || "").trim().toLowerCase();
  return {
    email,
    state: String(result.state || "unknown").toLowerCase(),
    reason: String(result.reason || ""),
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
    didYouMean: String(result.did_you_mean || ""),
    acceptAll: Boolean(result.accept_all),
    disposable: Boolean(result.disposable),
    role: Boolean(result.role),
  };
}

function normalizeBatch(data = {}) {
  const results = Array.isArray(data.emails)
    ? data.emails.map(normalizeVerificationResult).filter((item) => item.email)
    : [];
  const processed = Number(data.processed || results.length || 0);
  const total = Number(data.total || processed || 0);
  return {
    id: String(data.id || ""),
    processed,
    total,
    complete: total > 0 && processed >= total,
    counts: data.total_counts || {},
    results,
  };
}

async function createBatch(emails) {
  const cleaned = cleanEmails(emails);
  if (!cleaned.length) throw new Error("At least one email is required");
  if (cleaned.length > 500) throw new Error("A maximum of 500 emails can be verified at once");

  const response = await emailable.post(
    "/batch",
    { emails: cleaned.join(","), retries: true },
    { headers: { Authorization: `Bearer ${requireApiKey()}` } },
  );
  return { id: String(response.data?.id || ""), total: cleaned.length };
}

async function getBatch(id) {
  const response = await emailable.get("/batch", {
    params: { id, partial: true },
    headers: { Authorization: `Bearer ${requireApiKey()}` },
  });
  return normalizeBatch({ ...response.data, id: response.data?.id || id });
}

module.exports = {
  cleanEmails,
  fingerprintEmails,
  createBatch,
  getBatch,
  getApiKey,
  normalizeBatch,
  normalizeVerificationResult,
};
