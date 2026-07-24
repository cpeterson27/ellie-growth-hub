const OpenAI = require("openai");

function isEnabled() {
  return process.env.JARVIS_OPENAI_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    enabled: isEnabled(),
    model: process.env.JARVIS_OPENAI_MODEL || "gpt-4.1-mini",
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
        content: `You are ${profile.name || "Jarvis"}, Ellie AI's growth operator. Respond in a ${profile.responseStyle || "collaborative"} style. Be concise, clear, and never claim that an action was completed unless the application has confirmed it. Use the supplied operational context only; do not invent metrics, contacts, or integrations.`,
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
