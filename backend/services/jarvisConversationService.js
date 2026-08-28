const JarvisConversation = require("../models/JarvisConversation");

const HISTORY_MESSAGE_LIMIT = 12;
const HISTORY_CHARACTER_LIMIT = 12000;
const clean = (value, limit) => String(value || "").replaceAll("\u0000", "").trim().slice(0, limit);

function boundedHistory(messages = []) {
  const selected = [];
  let characters = 0;
  for (const message of messages.slice(-HISTORY_MESSAGE_LIMIT).reverse()) {
    const content = clean(message.content, 6000);
    if (!content || characters + content.length > HISTORY_CHARACTER_LIMIT) continue;
    selected.push({ role: message.role, content });
    characters += content.length;
  }
  return selected.reverse();
}

async function create({ workspaceId, userId, title = "" }, Model = JarvisConversation) {
  return Model.create({ workspaceId, userId, title: clean(title, 120) || "New Jarvis conversation", messages: [], lastActivityAt: new Date() });
}

async function list({ workspaceId, userId }, Model = JarvisConversation) {
  return Model.find({ workspaceId, userId }).select("title archived lastActivityAt createdAt updatedAt").sort({ lastActivityAt: -1 }).lean();
}

async function get({ workspaceId, userId, conversationId }, Model = JarvisConversation) {
  if (!conversationId) return null;
  return Model.findOne({ _id: conversationId, workspaceId, userId });
}

async function history({ workspaceId, userId, conversationId }, Model = JarvisConversation) {
  const conversation = await get({ workspaceId, userId, conversationId }, Model);
  if (!conversation || conversation.archived) return { conversation: null, messages: [] };
  return { conversation, messages: boundedHistory(conversation.messages || []) };
}

async function appendTurn({ workspaceId, userId, conversationId, userMessage, assistantMessage }, Model = JarvisConversation) {
  let conversation = conversationId ? await get({ workspaceId, userId, conversationId }, Model) : null;
  if (conversationId && !conversation) {
    const error = new Error("Jarvis conversation not found"); error.code = "CONVERSATION_NOT_FOUND"; throw error;
  }
  if (!conversation) conversation = await create({ workspaceId, userId, title: clean(userMessage, 72) }, Model);
  conversation.messages.push({ role: "user", content: clean(userMessage, 24000) }, { role: "assistant", content: clean(assistantMessage, 24000) });
  conversation.lastActivityAt = new Date();
  if (conversation.messages.length > 200) conversation.messages = conversation.messages.slice(-200);
  await conversation.save();
  return conversation;
}

async function archive({ workspaceId, userId, conversationId }, Model = JarvisConversation) {
  return Model.findOneAndUpdate({ _id: conversationId, workspaceId, userId }, { $set: { archived: true, lastActivityAt: new Date() } }, { new: true });
}

module.exports = { HISTORY_CHARACTER_LIMIT, HISTORY_MESSAGE_LIMIT, appendTurn, archive, boundedHistory, create, get, history, list };
