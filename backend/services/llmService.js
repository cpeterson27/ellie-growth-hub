const OpenAI = require("openai");

function isEnabled() {
  return process.env.JARVIS_OPENAI_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    enabled: isEnabled(),
    model: process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
    researchModel: process.env.JARVIS_RESEARCH_OPENAI_MODEL || "gpt-5.6-sol",
    webSearchEnabled: isEnabled(),
    voiceEnabled: isEnabled(),
    voiceModel: process.env.JARVIS_TTS_MODEL || "gpt-4o-mini-tts",
  };
}

async function chat({ message, context, profile = {} }) {
  if (!isEnabled()) {
    const error = new Error("OpenAI is not enabled for Jarvis");
    error.code = "JARVIS_OPENAI_NOT_ENABLED";
    throw error;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
  const response = await client.chat.completions.create({
    model: process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `You are ${profile.name || "Jarvis"}, Growth Operator's growth operator. Respond in a ${profile.responseStyle || "collaborative"} style. Directly answer the user's request by synthesizing the relevant supplied notes and workspace facts. Do not merely repeat the generic workspace summary when more specific note context is available. Prefer plain spoken prose with short headings and minimal emoji. Be concise, clear, and never claim that an action was completed unless the application has confirmed it. Use the supplied operational context only; do not invent metrics, contacts, or integrations. Clearly distinguish verified facts from recommendations.`,
      },
      {
        role: "user",
        content: `User request:\n${message}\n\nVerified operational context:\n${context}`,
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim() || "I could not generate a response.";
}

module.exports = { chat, getStatus, isEnabled };
