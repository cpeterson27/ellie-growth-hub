const OpenAI = require("openai");

function client() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Business-card image reading is not configured.");
  return new OpenAI({ apiKey });
}

const clean = (value) => String(value || "").trim();

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

module.exports = { extractBusinessCard };
