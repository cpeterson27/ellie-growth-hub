function classifyReply(text = "") {
  const value = String(text || "").toLowerCase();
  const has = (...terms) => terms.some((term) => value.includes(term));

  if (has("unsubscribe", "remove me", "stop emailing", "opt out")) {
    return { category: "unsubscribe", urgency: "high" };
  }
  if (has("out of office", "away from the office", "automatic reply", "auto-reply")) {
    return { category: "out_of_office", urgency: "low" };
  }
  if (has("not interested", "no thank", "do not contact", "not a fit")) {
    return { category: "not_interested", urgency: "low" };
  }
  if (has("partner", "partnership", "collaborate", "promote", "share with")) {
    return { category: "partnership", urgency: "high" };
  }
  if (has("interested", "send details", "more information", "tell me more", "learn more", "register")) {
    return { category: "interested", urgency: "high" };
  }
  if (has("later", "next month", "not now", "circle back", "follow up")) {
    return { category: "not_now", urgency: "medium" };
  }
  return { category: "needs_review", urgency: "medium" };
}

function draftReply({ contactName = "", category = "needs_review", campaignName = "the event" } = {}) {
  const firstName = String(contactName || "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const drafts = {
    interested: `${greeting}\n\nThank you for your interest in ${campaignName}. I’d be happy to share the details and answer any questions you have.\n\nWould you prefer the registration link or a quick conversation first?\n\nBest,\nEllie's Coaching`,
    partnership: `${greeting}\n\nThank you for getting back to us. We’d love to explore how a partnership around ${campaignName} could support your audience.\n\nWould you be available for a short conversation to discuss the best fit?\n\nBest,\nEllie's Coaching`,
    not_now: `${greeting}\n\nThank you for letting us know. We’ll respect the timing and can reconnect later.\n\nBest,\nEllie's Coaching`,
    not_interested: `${greeting}\n\nThank you for the response. We appreciate you letting us know and won’t continue following up about this opportunity.\n\nBest,\nEllie's Coaching`,
    unsubscribe: `${greeting}\n\nYou’ve been removed from future campaign email. Thank you for letting us know.\n\nBest,\nEllie's Coaching`,
    out_of_office: "",
    needs_review: `${greeting}\n\nThank you for getting back to us regarding ${campaignName}.\n\nBest,\nEllie's Coaching`,
  };
  return drafts[category] ?? drafts.needs_review;
}

module.exports = { classifyReply, draftReply };
