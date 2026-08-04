const OpenAI = require("openai");

const clean = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function ensureLinks(body, eventbriteUrl, meetupUrl) {
  let output = String(body || "").trim();
  if (!output.includes(eventbriteUrl)) output += `\n\nRegister on Eventbrite:\n${eventbriteUrl}`;
  if (!output.includes(meetupUrl)) output += `\n\nView the event on Meetup:\n${meetupUrl}`;
  return output.trim();
}

function fallbackDraft(signal, campaign, links) {
  const topic = clean(signal.title).slice(0, 180) || "growing your business";
  const eventName = clean(campaign.name) || "our upcoming online event";
  const subject = `${eventName} — an invitation for your current goals`;
  const body = `Hi {{firstName}},

I came across your public question about “${topic}.” Based on what you shared, I thought ${eventName} may be relevant to the business or investment goals you are working toward.

The event is designed to offer practical guidance, systems, and connections for people actively building or growing a business or real estate portfolio.

You can review the event details on either platform:

Eventbrite:
${links.eventbriteUrl}

Meetup:
${links.meetupUrl}

If it looks useful, I would be glad to have you join us.

Best,
Ellie's Coaching`;
  return { subject, body, generationMethod: "rules", personalizationBasis: `Public signal: ${topic}` };
}

async function generateIntentEmailDraft(signal, campaign, links) {
  const fallback = fallbackDraft(signal, campaign, links);
  if (process.env.JARVIS_OPENAI_ENABLED !== "true" || !process.env.OPENAI_API_KEY?.trim()) return fallback;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
    const response = await client.chat.completions.create({
      model: process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: "Write a concise, warm event invitation draft grounded only in the supplied public evidence. Do not claim to know the person's real name, company, finances, or private circumstances. Use {{firstName}} as the greeting placeholder. Avoid manipulative or surveillance-like language. Return JSON with subject and body. The body must include both supplied Eventbrite and Meetup URLs verbatim. Do not say an email is verified and do not imply the message has been sent." },
        { role: "user", content: JSON.stringify({ publicSignalTitle: clean(signal.title), publicSignalExcerpt: clean(signal.excerpt).slice(0, 1200), eventName: campaign.name, campaignSummary: clean(campaign.content?.body).slice(0, 1200), eventbriteUrl: links.eventbriteUrl, meetupUrl: links.meetupUrl }) },
      ],
    });
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || "{}");
    if (!String(parsed.subject || "").trim() || !String(parsed.body || "").trim()) return fallback;
    return { subject: String(parsed.subject).trim().slice(0, 300), body: ensureLinks(parsed.body, links.eventbriteUrl, links.meetupUrl), generationMethod: "openai", personalizationBasis: `Public signal: ${clean(signal.title).slice(0, 500)}` };
  } catch (_error) { return fallback; }
}

module.exports = { ensureLinks, generateIntentEmailDraft };
