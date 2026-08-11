function generateLinkedinDraft(contact, tone = "warm_direct") {
  const firstName = String(contact.firstName || contact.name || "there").trim().split(/\s+/)[0];
  const role = String(contact.title || "").trim();
  const company = String(contact.company || "").trim();
  const context = role && company ? `I noticed you’re ${role} at ${company}` : company ? `I noticed what you’re building at ${company}` : "I was looking back through people in my network";
  if (tone === "concise_professional") return `Hi ${firstName} — ${context}. I’m working on a relationship-led growth system that may be relevant to your work. Would you be open to a brief conversation next week?`;
  if (tone === "friendly_reconnect") return `Hi ${firstName} — it’s been a while since we connected! ${context}, and you came to mind. I’d enjoy hearing what you’re working on and sharing a little about the relationship-led growth system I’m building. Open to catching up next week?`;
  return `Hi ${firstName} — it’s been a while since we connected. ${context}, and I thought it would be good to reconnect. I’m working on a relationship-led growth system that may overlap with what you’re doing. Would you be open to a quick catch-up next week?`;
}

module.exports = { generateLinkedinDraft };
