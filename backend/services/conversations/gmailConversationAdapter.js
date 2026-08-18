const Contact = require("../../models/Contact");
const ConversationMailbox = require("../../models/ConversationMailbox");
const ConversationThread = require("../../models/ConversationThread");
const IntegrationConnection = require("../../models/IntegrationConnection");
const gmail = require("../gmailOAuthService");
const { ConversationChannelAdapter, registerConversationAdapter } = require("./channelAdapters");
const { ingestProviderMessage } = require("./conversationIngestionService");

function participant(value, role, mailboxAddress) {
  const address = gmail.emailAddress(value);
  if (!address) return null;
  return { kind: address === mailboxAddress ? "user" : "external", role, name: gmail.displayName(value), address };
}

async function ensureMailbox() {
  const connection = await IntegrationConnection.findOne({ provider: "gmail", status: "connected" }).lean();
  if (!connection) throw new Error("Gmail is not connected");
  const address = String(connection.settings?.email || "").trim().toLowerCase();
  if (!address) throw new Error("The connected Gmail account has no email address");
  return ConversationMailbox.findOneAndUpdate(
    { provider: "gmail", address },
    { $set: { provider: "gmail", providerAccountId: connection.oauth?.providerAccountId || "", name: connection.settings?.name || address, address, status: "connected" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function matchContacts(addresses) {
  const clean = [...new Set(addresses.filter(Boolean).map((value) => value.toLowerCase()))];
  if (!clean.length) return [];
  return Contact.find({ email: { $in: clean }, status: { $ne: "archived" } }).select("_id email organizationId").lean();
}

async function syncGmailThread(threadId, suppliedThread = null) {
  const [mailbox, gmailThread] = await Promise.all([ensureMailbox(), suppliedThread ? Promise.resolve(suppliedThread) : gmail.getThread(threadId)]);
  const mailboxAddress = mailbox.address.toLowerCase();
  const addresses = gmailThread.messages.flatMap((message) => [gmail.emailAddress(message.from), gmail.emailAddress(message.to), gmail.emailAddress(message.cc), gmail.emailAddress(message.bcc)]).filter((address) => address && address !== mailboxAddress);
  const contacts = await matchContacts(addresses);
  const contactsByEmail = new Map(contacts.map((contact) => [contact.email, contact]));
  const contactIds = [...new Set(contacts.map((contact) => String(contact._id)))];
  const organizationIds = [...new Set(contacts.map((contact) => String(contact.organizationId || "")).filter(Boolean))];
  let canonicalThread = null;

  for (const item of gmailThread.messages) {
    const from = gmail.emailAddress(item.from);
    const direction = from === mailboxAddress || item.labels?.includes("SENT") ? "outbound" : "inbound";
    const counterpart = direction === "inbound" ? from : gmail.emailAddress(item.to);
    const result = await ingestProviderMessage({
      thread: {
        channel: "email", provider: "gmail", providerThreadId: gmailThread.id, mailboxId: mailbox._id,
        subject: item.subject, contactIds, organizationId: organizationIds.length === 1 ? organizationIds[0] : null,
        participants: [participant(item.from, "from", mailboxAddress), participant(item.to, "to", mailboxAddress), participant(item.cc, "cc", mailboxAddress), participant(item.bcc, "bcc", mailboxAddress)].filter(Boolean),
      },
      message: {
        providerMessageId: item.id, direction, subject: item.subject, body: item.body || item.snippet,
        sender: { name: gmail.displayName(item.from), address: from },
        recipients: [participant(item.to, "to", mailboxAddress), participant(item.cc, "cc", mailboxAddress), participant(item.bcc, "bcc", mailboxAddress)].filter(Boolean).map(({ name, address, role }) => ({ name, address, role })),
        attachments: item.attachments || [], deliveryStatus: direction === "inbound" ? "received" : "sent",
        sentAt: item.internalDate || item.date, contactId: contactsByEmail.get(counterpart)?._id || null,
        metadata: { gmailMessageId: item.messageId || "", labels: item.labels || [] },
      },
    });
    canonicalThread = result.thread;
  }

  if (canonicalThread) {
    const latest = gmailThread.messages[gmailThread.messages.length - 1] || {};
    canonicalThread = await ConversationThread.findByIdAndUpdate(canonicalThread._id, { $set: { unreadCount: latest.labels?.includes("UNREAD") ? Math.max(1, canonicalThread.unreadCount || 0) : 0, metadata: { ...(canonicalThread.metadata || {}), gmailLabels: latest.labels || [], mailboxAddress } } }, { new: true }).lean();
  }
  mailbox.lastSyncedAt = new Date();
  mailbox.lastSyncError = "";
  await mailbox.save();
  return { gmailThread, canonicalThread, mailbox };
}

class GmailConversationAdapter extends ConversationChannelAdapter {
  constructor() { super("email", "gmail"); }
  async fetchThread(threadId) { return syncGmailThread(threadId); }
  async syncThreads({ query = "in:inbox", limit = 20 } = {}) {
    const listing = await gmail.listThreads({ query, maxResults: Math.min(50, limit) });
    const results = [];
    const errors = [];
    for (const item of listing.threads) {
      try { results.push(await syncGmailThread(item.id)); }
      catch (error) { errors.push({ threadId: item.id, error: error.message }); }
    }
    return { synced: results.length, failed: errors.length, errors, threads: results.map((result) => result.canonicalThread).filter(Boolean), nextPageToken: listing.nextPageToken };
  }
  async sendMessage(payload) { return gmail.sendMessage(payload); }
  async saveDraft() { throw new Error("Gmail provider draft sync is not enabled; the workspace draft remains safely stored in Growth Operator"); }
}

const gmailConversationAdapter = registerConversationAdapter(new GmailConversationAdapter());

module.exports = { GmailConversationAdapter, ensureMailbox, gmailConversationAdapter, matchContacts, participant, syncGmailThread };
