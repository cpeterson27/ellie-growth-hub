function normalizePhone(value) {
  const raw = String(value || "").trim().replace(/^whatsapp:/i, "");
  const normalized = raw.startsWith("+") ? `+${raw.slice(1).replace(/\D/g, "")}` : raw.replace(/\D/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "";
}

function localHour(timezone, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).formatToParts(at);
    return Number(parts.find((part) => part.type === "hour")?.value);
  } catch { return null; }
}

function inQuietHours(hour, { startHour = 21, endHour = 8 } = {}) {
  if (!Number.isInteger(hour)) return true;
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}

async function evaluateOutboundCommunication({ channel, address, purpose = "transactional", sender, timezone, at = new Date() }) {
  const CommunicationConsent = require("../models/CommunicationConsent");
  const normalized = normalizePhone(address);
  const reasons = [];
  if (!normalized) reasons.push("A valid E.164 destination number is required");
  const consents = normalized ? await CommunicationConsent.find({ channel: channel === "mms" ? { $in: ["sms", "mms"] } : channel, address: normalized }).lean() : [];
  if (consents.some((item) => item.status === "opted_out")) reasons.push("The recipient has opted out of this channel");
  if (purpose === "marketing" && !consents.some((item) => item.status === "opted_in" && ["marketing", "all"].includes(item.purpose))) reasons.push("Documented marketing consent is required");
  if (["sms", "mms"].includes(channel) && normalized.startsWith("+1") && !["approved", "not_required"].includes(sender?.a2p?.status)) reasons.push("The US sender is not approved for application-to-person messaging");
  if (sender?.status !== "active") reasons.push("The sending number is not active");
  const zone = timezone || sender?.quietHours?.fallbackTimezone || "America/Los_Angeles";
  const hour = localHour(zone, at);
  if (sender?.quietHours?.enabled !== false && inQuietHours(hour, sender?.quietHours)) reasons.push(`Recipient-local quiet hours are active in ${zone}`);
  return { allowed: reasons.length === 0, reasons, address: normalized, timezone: zone, evaluatedAt: at };
}

module.exports = { evaluateOutboundCommunication, inQuietHours, localHour, normalizePhone };
