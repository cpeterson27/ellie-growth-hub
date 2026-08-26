export const interactionLabels = {
  comment_received: "Commented on a post", dm_received: "Sent a direct message",
  mention_received: "Mentioned your account", referral_received: "Conversation referral",
  postback_received: "Selected a conversation button", story_reply: "Replied to a story",
  lead_form: "Submitted a lead form", link_clicked: "Followed a shared link",
};
export function leadStage(row) {
  if (row.contactId?.type === "customer") return "Converted";
  if (row.contactId?.qualifyContact || row.contactId?.researchStatus === "qualified") return "Qualified";
  if (row.conversation?.status === "open") return "Needs follow-up";
  if (row.conversation && ["pending", "snoozed"].includes(row.conversation.status)) return "In conversation";
  return row.contactId?.type === "lead" || row.contactId?.status === "prospect" ? "New" : row.contactId?.status || "Recorded";
}
