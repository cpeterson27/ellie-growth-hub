const crypto = require("crypto");
const ConversationMessage = require("../../models/ConversationMessage");
const ConversationThread = require("../../models/ConversationThread");
const MessagingSender = require("../../models/MessagingSender");
const Contact = require("../../models/Contact");
const { ConversationChannelAdapter, registerConversationAdapter } = require("./channelAdapters");
const { ingestProviderMessage } = require("./conversationIngestionService");
const { evaluateOutboundCommunication, normalizePhone } = require("../communicationPolicyService");

function configured() { return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.PUBLIC_BACKEND_URL); }
function credentials() {
  if (!configured()) throw new Error("Twilio is not configured");
  return { accountSid: String(process.env.TWILIO_ACCOUNT_SID).trim(), authToken: String(process.env.TWILIO_AUTH_TOKEN).trim() };
}
async function twilioRequest(path, { method = "GET", body } = {}) {
  const { accountSid, authToken } = credentials();
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`, { method, headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(body ? { body: new URLSearchParams(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Twilio request failed");
  return data;
}

function validateTwilioSignature(url, params, signature) {
  if (!configured() || !signature || !url) return false;
  const { authToken } = credentials();
  const payload = Object.keys(params || {}).sort().reduce((value, key) => `${value}${key}${Array.isArray(params[key]) ? params[key].join("") : params[key]}`, url);
  const expected = crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

class TwilioConversationAdapter extends ConversationChannelAdapter {
  constructor() { super("sms", "twilio"); }
  async status() { return { configured: configured(), capabilities: ["sms", "mms", "voice", "delivery_events", "recording_callbacks"], sendsEnabled: configured() }; }
  async sendMessage({ sender, to, body, mediaUrls = [], purpose = "transactional", timezone, statusCallback }) {
    const policy = await evaluateOutboundCommunication({ channel: mediaUrls.length ? "mms" : "sms", address: to, purpose, sender, timezone });
    if (!policy.allowed) { const error = new Error(policy.reasons.join("; ")); error.code = "COMMUNICATION_BLOCKED"; throw error; }
    const payload = { To: policy.address, Body: String(body || "").trim(), StatusCallback: statusCallback };
    if (sender.messagingServiceId) payload.MessagingServiceSid = sender.messagingServiceId; else payload.From = sender.phoneNumber;
    mediaUrls.slice(0, 10).forEach((url, index) => { payload[`MediaUrl${index}`] = url; });
    return twilioRequest("/Messages.json", { method: "POST", body: payload });
  }
  async placeCall({ sender, to, twimlUrl, statusCallback, recordingStatusCallback, record = false }) {
    if (!normalizePhone(to) || !twimlUrl) throw new Error("A valid destination and TwiML URL are required");
    if (record && sender.recordingPolicy?.mode !== "consent_required") throw new Error("Recording is disabled by workspace policy");
    return twilioRequest("/Calls.json", { method: "POST", body: { To: normalizePhone(to), From: sender.phoneNumber, Url: twimlUrl, StatusCallback: statusCallback, StatusCallbackEvent: "initiated ringing answered completed", ...(record ? { Record: "true", RecordingStatusCallback: recordingStatusCallback, RecordingStatusCallbackEvent: "in-progress completed absent", RecordingChannels: "dual", RecordingTrack: "both" } : {}) } });
  }
  async searchAvailableNumbers({ areaCode, country = "US", limit = 20 }) { return twilioRequest(`/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?${new URLSearchParams({ AreaCode: String(areaCode || ""), PageSize: String(Math.min(50, limit)) })}`); }
  async purchaseNumber() { throw new Error("Number purchasing requires a separate explicit billing confirmation workflow"); }
  async ingestInbound(payload, sender) {
    const from = normalizePhone(payload.From); const to = normalizePhone(payload.To);
    const channel = Number(payload.NumMedia || 0) > 0 ? "mms" : "sms";
    const contact = await Contact.findOne({ $or: ["phone", "mobilePhone", "workDirectPhone", "homePhone", "corporatePhone", "otherPhone"].map((field) => ({ [field]: from })), status: { $ne: "archived" } }).select("_id organizationId").lean();
    return ingestProviderMessage({ thread: { channel, provider: "twilio", providerThreadId: `${channel}:${from}:${to}`, contactIds: contact ? [contact._id] : [], organizationId: contact?.organizationId || null, participants: [{ kind: contact ? "contact" : "external", role: "from", address: from, contactId: contact?._id || null }, { kind: "user", role: "to", address: to }] }, message: { providerMessageId: payload.MessageSid, direction: "inbound", body: payload.Body || "", sender: { address: from }, recipients: [{ address: to, role: "to" }], attachments: Array.from({ length: Math.min(10, Number(payload.NumMedia || 0)) }, (_, index) => ({ url: payload[`MediaUrl${index}`] || "", contentType: payload[`MediaContentType${index}`] || "" })), deliveryStatus: "received", contactId: contact?._id || null, metadata: { optOutType: payload.OptOutType || "", messagingServiceSid: payload.MessagingServiceSid || "", senderId: sender?._id || null } } });
  }
  async findMessage(providerMessageId) { return ConversationMessage.findOne({ provider: "twilio", providerMessageId }); }
  async findThread(providerThreadId) { return ConversationThread.findOne({ provider: "twilio", providerThreadId }); }
}

const twilioConversationAdapter = registerConversationAdapter(new TwilioConversationAdapter());
module.exports = { TwilioConversationAdapter, configured, twilioConversationAdapter, twilioRequest, validateTwilioSignature };
