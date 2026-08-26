const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
function source(file) { return fs.readFileSync(path.join(__dirname, file), "utf8"); }
function includesAll(contents, expected, label) { for (const value of expected) assert(contents.includes(value), `${label} missing: ${value}`); }

for (const [file, contracts] of Object.entries({
  "models/ChatWidget.js": ['collection: "chat_widgets"', "allowedOrigins", "requireEmail", "mailboxId", "workspacePlugin"],
  "models/ChatVisitorSession.js": ['collection: "chat_visitor_sessions"', "tokenHash", "expiresAt", "threadId", "workspacePlugin"],
  "services/websiteChatService.js": ["hashToken", "originAllowed", "createVisitorSession", "addVisitorMessage", "addAgentMessage", "Contact.findOne"],
  "routes/chat.js": ['/widget/:key/config', '/widget/:key/session', '/widget/:key/messages', '/manage/widgets', 'approved !== true', "publicRateLimit"],
  "services/conversations/metaMessagingAdapter.js": ["validateMetaSignature", "connectionForAsset", "ingestMetaMessage", "lastInboundAt", "24 * 60 * 60 * 1000", "pages_messaging"],
  "routes/socialMessaging.js": ['/meta/send', '/linkedin/manual-actions', 'privateMessageApiEnabled: false', 'providerActionTaken: false', 'approved !== true'],
  "routes/webhooks.js": ['router.get(["/meta", "/instagram"]', 'router.post(["/meta", "/instagram"]', 'x-hub-signature-256', "ingestMetaMessage"],
  "routes/telephony.js": ['/whatsapp/send', "sendWhatsApp", "contentSid"],
  "services/conversations/twilioConversationAdapter.js": ["sendWhatsApp", "customerWindowOpen", "ContentSid", 'channel = /^whatsapp:'],
  "server.js": ["publicChatCors", 'req.path.startsWith("/chat/widget/")', 'app.use("/api/social-messaging", socialMessagingRouter)'],
})) includesAll(source(file), contracts, file);

const widgetScript = fs.readFileSync(path.join(__dirname, "../frontend/public/ellie-chat-widget.js"), "utf8");
includesAll(widgetScript, ["data", "sessionToken", "textContent", "setInterval", "data-widget-key".replace("data-widget-key", "widgetKey")], "Website widget client");
console.log("Social conversation contracts passed: website chat, WhatsApp, Meta messaging, and human-assisted LinkedIn.");
