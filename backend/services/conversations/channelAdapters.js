class ConversationChannelAdapter {
  constructor(channel, provider) {
    this.channel = channel;
    this.provider = provider;
  }

  async syncThreads() { throw new Error(`${this.provider} thread sync is not configured`); }
  async fetchThread() { throw new Error(`${this.provider} thread retrieval is not configured`); }
  async sendMessage() { throw new Error(`${this.provider} sending is not configured`); }
  async saveDraft() { throw new Error(`${this.provider} draft sync is not configured`); }
}

const adapters = new Map();

function adapterKey(channel, provider) {
  return `${String(channel || "").toLowerCase()}:${String(provider || "").toLowerCase()}`;
}

function registerConversationAdapter(adapter) {
  if (!(adapter instanceof ConversationChannelAdapter)) throw new TypeError("Conversation adapter must extend ConversationChannelAdapter");
  adapters.set(adapterKey(adapter.channel, adapter.provider), adapter);
  return adapter;
}

function getConversationAdapter(channel, provider) {
  return adapters.get(adapterKey(channel, provider)) || null;
}

module.exports = { ConversationChannelAdapter, getConversationAdapter, registerConversationAdapter };
