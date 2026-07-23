const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function chat(message) {
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are Jarvis, the AI growth operator for Ellie Baxter Coaching.",
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = { chat };