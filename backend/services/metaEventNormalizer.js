const crypto = require("crypto");
const text = value => typeof value === "string" || typeof value === "number" ? String(value) : "";
function timestamp(value) {
  if (!value) return null;
  const number = Number(value);
  const date = Number.isFinite(number) ? new Date(number < 1e12 ? number * 1000 : number) : new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now() + 60000 ? date : null;
}
function normalize({ connection, assetId, messaging, change, entryTime }) {
  const asset = connection.assets?.find(row => String(row.id) === String(assetId));
  if (!asset || !(connection.selectedAssetIds || []).map(String).includes(String(assetId))) return null;
  const provider = asset.type === "instagram_business" ? "instagram" : "facebook";
  const base = { provider, assetId: String(assetId), connectionProvider: connection.provider, sourceMetadata: {}, raw: messaging || change };
  if (messaging) {
    const event = messaging, message = event.message;
    const sender = text(event.sender?.id);
    const occurredAt = timestamp(event.timestamp || entryTime);
    if (!occurredAt) return null;
    const receipt = event.read || event.delivery || event.seen;
    if (receipt) {
      const kind = event.read ? "message_read" : event.delivery ? "message_delivered" : "message_seen";
      const ids = (event.delivery?.mids || event.read?.mids || event.seen?.mids || []).map(text).filter(Boolean);
      const watermark = text(event.read?.watermark || event.delivery?.watermark || event.seen?.watermark);
      const id = ids.join(",") || watermark || occurredAt.toISOString();
      return { ...base, providerEventId: `${assetId}:${kind}:${id}`, providerUserId: sender && sender !== String(assetId) ? sender : "", eventType: kind, triggerType: "lifecycle", text: "", occurredAt, contextOnly: !sender || sender === String(assetId), recordOnly: true, sourceMetadata: { messageIds: ids, watermark } };
    }
    if (!sender || sender === String(assetId) || (event.recipient?.id && String(event.recipient.id) !== String(assetId)) || message?.is_echo || message?.is_self || message?.is_deleted || message?.is_unsupported) return null;
    const referral = event.referral || event.postback?.referral || message?.referral;
    const story = message?.reply_to?.story;
    const storyMention = message?.attachments?.some(row => row.type === "story_mention");
    let eventType, triggerType, replyPolicy = "none", body = "";
    if (event.optin || event.opt_in) {
      eventType = "optin_received"; triggerType = "optin"; body = "Messaging opt-in received";
    } else if (event.reaction || message?.reaction) {
      eventType = "message_reaction"; triggerType = "lifecycle"; body = text(event.reaction?.reaction || message?.reaction?.reaction) || "Message reaction received";
    } else if (message?.mid) {
      eventType = provider === "instagram" && (story || storyMention) ? "story_reply" : "dm_received";
      triggerType = eventType === "story_reply" ? "story_reply" : "dm_keyword";
      replyPolicy = "message"; body = text(message.text) || (storyMention ? "Mentioned your account in a story" : "Sent an attachment");
    } else if (event.postback) {
      eventType = "postback_received"; triggerType = "postback"; replyPolicy = "message"; body = text(event.postback.title) || "Selected a conversation option";
    } else if (referral) {
      eventType = "referral_received"; triggerType = "referral"; body = "Opened a referred conversation";
    } else return null; // Follower and aggregate events are not identity-bearing leads.
    const sourceMetadata = { providerMessageId: text(message?.mid || event.postback?.mid), edited: Boolean(message?.is_edited || message?.edit || event.message_edit), reaction: text(event.reaction?.reaction || message?.reaction?.reaction), optin: event.optin || event.opt_in || undefined, quickReply: text(message?.quick_reply?.payload), postbackPayload: text(event.postback?.payload), referral: referral ? { ref: text(referral.ref), source: text(referral.source), type: text(referral.type), adId: text(referral.ad_id) } : undefined, storyId: text(story?.id || referral?.story?.id), storyMention: Boolean(storyMention), replyPolicy };
    const id = message?.mid || event.postback?.mid || crypto.createHash("sha256").update(JSON.stringify([assetId, sender, eventType, occurredAt.toISOString(), sourceMetadata])).digest("hex");
    return { ...base, legacyProviderEventId: message?.mid || null, providerEventId: `${assetId}:${eventType}:${id}`, messageId: `${assetId}:${id}`, providerUserId: sender, eventType, triggerType, text: body, occurredAt, contentId: text(story?.id), sourceMetadata, replyPolicy, opensMessagingWindow: replyPolicy === "message" };
  }
  const value = change?.value || {}, field = change?.field;
  if (["messages", "message_edit", "message_edits", "message_reactions", "message_reads", "message_deliveries", "messaging_seen", "messaging_optins", "messaging_postbacks", "messaging_referral", "messaging_referrals"].includes(field)) {
    const event = { ...value };
    if (["message_edit", "message_edits"].includes(field) && !event.message) event.message = { mid: value.message_id || value.mid, text: value.text || value.message_text, is_edited: true };
    if (field === "message_reactions" && !event.reaction) event.reaction = { mid: value.message_id || value.mid, reaction: value.reaction || value.emoji };
    if (field === "message_reads" && !event.read) event.read = { mids: value.mids || [], watermark: value.watermark };
    if (field === "message_deliveries" && !event.delivery) event.delivery = { mids: value.mids || [], watermark: value.watermark };
    if (field === "messaging_seen" && !event.seen) event.seen = { mids: value.mids || [], watermark: value.watermark };
    if (field === "messaging_optins" && !event.optin) event.optin = value.optin || value;
    if (field === "messaging_postbacks" && !event.postback) event.postback = value.postback || value;
    if (["messaging_referral", "messaging_referrals"].includes(field) && !event.referral) event.referral = value.referral || value;
    return normalize({ connection, assetId, messaging: event, entryTime });
  }
  if (!["comments", "live_comments", "feed", "mentions", "mention", "messaging_customer_information", "messaging_in_thread_lead_form_submit"].includes(field)) return null;
  if (["messaging_customer_information", "messaging_in_thread_lead_form_submit"].includes(field)) {
    const sender = text(value.from?.id || value.sender?.id || value.user_id || value.psid);
    const eventType = field === "messaging_customer_information" ? "customer_information" : "lead_form_received";
    const id = text(value.id || value.message_id || value.lead_id) || crypto.createHash("sha256").update(JSON.stringify([assetId, field, sender, value])).digest("hex");
    return { ...base, providerEventId: `${assetId}:${eventType}:${id}`, providerUserId: sender, displayName: text(value.name || value.from?.name), eventType, triggerType: "record_only", occurredAt: timestamp(value.timestamp || value.created_time || entryTime) || new Date(), contextOnly: !sender, recordOnly: true, opensMessagingWindow: false, text: eventType === "lead_form_received" ? "In-thread lead form submitted" : "Customer information received", sourceMetadata: { field, leadId: text(value.lead_id), identityUnavailable: !sender } };
  }
  if (field === "feed" && (value.item !== "comment" || (value.verb && value.verb !== "add"))) return null;
  if (value.verb && !["add", "created"].includes(value.verb)) return null;
  const commentId = text(value.comment_id || value.id), contentId = text(value.media?.id || value.media_id || value.post_id || value.post?.id);
  if (!commentId && !contentId) return null;
  const sender = text(value.from?.id || value.sender?.id || value.from_id || value.user_id);
  if (sender === String(assetId)) return null;
  const occurredAt = timestamp(value.created_time || value.timestamp || entryTime);
  const mention = field === "mentions" || field === "mention";
  return { ...base, legacyProviderEventId: !mention && commentId ? `comment:${commentId}` : null, providerEventId: `${assetId}:${mention ? "mention" : "comment"}:${commentId || contentId}`, providerUserId: sender, username: text(value.from?.username), displayName: text(value.from?.name || value.sender?.name), contentId, text: text(value.text || value.message) || (mention ? "Your account was mentioned" : ""), eventType: mention ? "mention_received" : "comment_received", triggerType: mention ? "mention" : "comment_any", occurredAt: occurredAt || new Date(), contextOnly: !sender, replyPolicy: !mention && occurredAt ? "private_reply" : "none", opensMessagingWindow: false, sourceMetadata: { commentId, field, identityUnavailable: !sender } };
}
module.exports = { normalize, timestamp };
