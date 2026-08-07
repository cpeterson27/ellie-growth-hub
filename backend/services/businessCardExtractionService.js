const OpenAI = require("openai");
const { fetchPublicPage, plainText } = require("./publicWebsiteResearchService");

function client() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Business-card image reading is not configured.");
  return new OpenAI({ apiKey });
}

const clean = (value) => String(value || "").trim();

const aliases = {
  firstName: ["firstName", "first_name", "givenName"],
  lastName: ["lastName", "last_name", "familyName", "surname"],
  email: ["email", "emailAddress"], phone: ["phone", "phoneNumber", "telephone"],
  company: ["company", "companyName", "organization"],
  title: ["title", "jobTitle", "position"],
  linkedin: ["linkedin", "linkedIn", "linkedinUrl", "linkedInUrl"],
  website: ["website", "websiteUrl", "url"], city: ["city"], state: ["state", "region"],
  country: ["country"], notes: ["notes", "other"],
};

function normalizeContact(parsed = {}) {
  const contact = Object.fromEntries(Object.entries(aliases).map(([field, keys]) => [
    field,
    clean(keys.map((key) => parsed[key]).find((value) => clean(value))),
  ]));
  if (!contact.firstName && !contact.lastName && clean(parsed.name)) {
    const parts = clean(parsed.name).split(/\s+/);
    contact.firstName = parts.shift() || "";
    contact.lastName = parts.join(" ");
  }
  return contact;
}

async function extractJsonFromText(text, instruction) {
  const response = await client().chat.completions.create({
    model: process.env.BUSINESS_CARD_OPENAI_MODEL || process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: `${instruction}\n\n${String(text || "").slice(0, 120000)}` }],
  });
  return normalizeContact(JSON.parse(response.choices?.[0]?.message?.content || "{}"));
}

async function extractBusinessCard(imageDataUrl) {
  const image = String(imageDataUrl || "");
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(image)) {
    throw new Error("Upload a PNG, JPEG, or WebP business-card image.");
  }
  if (image.length > 10 * 1024 * 1024) throw new Error("The business-card image is too large.");
  const response = await client().chat.completions.create({
    model: process.env.BUSINESS_CARD_OPENAI_MODEL || process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: "Read this business card. Return JSON with only these string fields: firstName, lastName, email, phone, company, title, linkedin, website, city, state, country, notes. Copy only information visibly printed or encoded on the card. Do not guess missing fields. Put secondary phone numbers, addresses, certifications, social handles, and other useful printed details that do not fit a field into notes.",
        },
        { type: "image_url", image_url: { url: image, detail: "high" } },
      ],
    }],
  });
  const parsed = JSON.parse(response.choices?.[0]?.message?.content || "{}");
  return normalizeContact(parsed);
}

async function extractDigitalBusinessCard(rawUrl) {
  const url = new URL(String(rawUrl || "").trim());
  if (!/(^|\.)blinq\.me$/i.test(url.hostname)) throw new Error("Only public Blinq card links are supported by this resolver.");
  const page = await fetchPublicPage(url.toString());
  if (page.blocked) throw new Error("Blinq did not allow this public card to be read.");
  const visibleText = plainText(page.html);
  const contact = await extractJsonFromText(
    `${visibleText}\n\nEMBEDDED PAGE DATA:\n${page.html}`,
    "Extract the contact details from this public Blinq digital business-card page and its embedded application data. Return JSON with only these string fields: firstName, lastName, email, phone, company, title, linkedin, website, city, state, country, notes. Use the card owner's details, not Blinq company/support details. Do not guess missing fields. Do not use the Blinq card URL as website unless it is explicitly listed as the owner's website.",
  );
  contact.notes = [contact.notes, `Digital business card: ${page.url}`].filter(Boolean).join("\n");
  return contact;
}

module.exports = { extractBusinessCard, extractDigitalBusinessCard, normalizeContact };
