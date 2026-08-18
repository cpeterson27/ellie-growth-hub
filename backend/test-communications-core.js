const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
function source(file) { return fs.readFileSync(path.join(__dirname, file), "utf8"); }
function includesAll(contents, expected, label) { for (const value of expected) assert(contents.includes(value), `${label} missing: ${value}`); }

for (const [file, contracts] of Object.entries({
  "models/CommunicationConsent.js": ['collection: "communication_consents"', '"unknown", "opted_in", "opted_out"', "consentedAt", "revokedAt", "proof", "workspacePlugin"],
  "models/MessagingSender.js": ['collection: "messaging_senders"', "a2p", "quietHours", "recordingPolicy", "transcriptionPolicy", "workspacePlugin"],
  "models/CallRecord.js": ['collection: "call_records"', "providerCallId", "recording", "transcription", "consentConfirmed", "workspacePlugin"],
  "models/MessageDeliveryEvent.js": ['collection: "message_delivery_events"', "providerMessageId", "errorCode", "workspacePlugin"],
  "routes/telephony.js": ['router.post("/messages/preview"', 'router.post("/messages/send"', 'approved !== true', 'code: "COMMUNICATION_BLOCKED"', 'router.post("/calls"', "recordingConsentConfirmed", "purchaseEnabled: false"],
  "routes/webhooks.js": ['/twilio/message-inbound', "/twilio/message-status", "/twilio/call-status", "/twilio/recording-status", "validTwilioRequest", "OptOutType"],
  "services/conversations/twilioConversationAdapter.js": ["validateTwilioSignature", "sendMessage", "placeCall", "searchAvailableNumbers", "purchaseNumber", "ingestInbound"],
  "server.js": ['req.path.startsWith("/webhooks/twilio/")', 'app.use("/api/telephony", telephonyRouter)'],
})) includesAll(source(file), contracts, file);

const { inQuietHours, localHour, normalizePhone } = require("./services/communicationPolicyService");
assert.equal(normalizePhone("+1 (310) 555-1212"), "+13105551212");
assert.equal(normalizePhone("310-555-1212"), "");
assert.equal(inQuietHours(22, { startHour: 21, endHour: 8 }), true);
assert.equal(inQuietHours(12, { startHour: 21, endHour: 8 }), false);
assert.equal(Number.isInteger(localHour("America/Los_Angeles", new Date("2026-08-18T19:00:00Z"))), true);
console.log("Communication core contracts passed: consent, A2P gates, quiet hours, messaging, calls, callbacks, and recording policy.");
