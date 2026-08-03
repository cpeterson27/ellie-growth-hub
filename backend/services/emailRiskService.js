const dns = require("node:dns").promises;
const EmailSuppression = require("../models/EmailSuppression");

const ROLE_LOCAL_PARTS = new Set(["admin", "billing", "contact", "hello", "info", "office", "sales", "support"]);
const DISPOSABLE_DOMAINS = new Set(["10minutemail.com", "guerrillamail.com", "mailinator.com", "tempmail.com", "yopmail.com"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function assessEmail(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  const syntaxValid = EMAIL_PATTERN.test(email);
  const [localPart = "", domain = ""] = syntaxValid ? email.split("@") : [];
  let mxRecords = [];
  if (syntaxValid) {
    try { mxRecords = await dns.resolveMx(domain); } catch (_error) { mxRecords = []; }
  }
  const suppression = email ? await EmailSuppression.findOne({ email }).lean() : null;
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const roleAddress = ROLE_LOCAL_PARTS.has(localPart);
  let classification = "domain_valid";
  let recommendation = "manual_confirmation_required";
  if (!syntaxValid) { classification = "invalid_syntax"; recommendation = "do_not_send"; }
  else if (suppression) { classification = "suppressed"; recommendation = "do_not_send"; }
  else if (!mxRecords.length) { classification = "no_mail_server"; recommendation = "do_not_send"; }
  else if (disposable) { classification = "disposable"; recommendation = "do_not_send"; }
  else if (roleAddress) { classification = "role_address"; recommendation = "review_before_sending"; }

  return {
    email, classification, recommendation,
    verified: false,
    checks: { syntaxValid, domain, hasMx: mxRecords.length > 0, mxHosts: mxRecords.map((item) => item.exchange), disposable, roleAddress, suppressed: Boolean(suppression) },
    explanation: classification === "domain_valid"
      ? "The address format and receiving domain are valid. This does not prove that the individual mailbox exists."
      : "Growth Operator found a risk signal that should be resolved before outreach.",
  };
}

module.exports = { assessEmail };
