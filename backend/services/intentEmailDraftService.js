const clean = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function ensureLinks(body, eventbriteUrl, meetupUrl) {
  let output = String(body || "").trim();
  if (!output.includes(eventbriteUrl)) output += `\n\nRegister on Eventbrite:\n${eventbriteUrl}`;
  if (!output.includes(meetupUrl)) output += `\n\nView the event on Meetup:\n${meetupUrl}`;
  return output.trim();
}

function renderTemplate(value, signal, campaign) {
  const company = clean(signal.organizationName || signal.organizationDomain) || "your organization";
  return String(value || "")
    .replaceAll("{{campaignName}}", clean(campaign.name) || "our upcoming event")
    .replaceAll("{{programName}}", clean(campaign.programName) || clean(campaign.name) || "our program")
    .replaceAll("{{company}}", company)
    .replaceAll("{{eventLink}}", String(campaign.registrationLinks?.eventbrite?.url || "").trim());
}

function generateIntentEmailDraft(signal, campaign, links, templateSelection) {
  const template = templateSelection?.template;
  if (!template?.subject || !template?.body || template.status !== "approved" || !template.currentVersion) {
    throw new Error(`Approve the ${templateSelection?.label || "required audience"} template in the campaign Email design tab before generating this draft.`);
  }
  return {
    subject: renderTemplate(template.subject, signal, campaign).trim().slice(0, 300),
    body: ensureLinks(renderTemplate(template.body, signal, campaign), links.eventbriteUrl, links.meetupUrl),
    generationMethod: "rules",
    personalizationBasis: `Approved ${templateSelection.label} template · version ${template.currentVersion} · Public evidence: ${clean(signal.title).slice(0, 500)}`,
    templateAudienceKey: templateSelection.key,
    templateAudienceLabel: templateSelection.label,
    templateVersion: template.currentVersion,
  };
}

module.exports = { ensureLinks, generateIntentEmailDraft, renderTemplate };
