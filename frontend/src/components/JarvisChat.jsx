import React, { useState, useRef, useEffect } from "react";
import { useJarvis } from "../hooks/useJarvis";
import "./JarvisChat.css";

/**
 * JarvisChat Component
 * Minimal Jarvis assistant chat interface
 */
export default function JarvisChat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "assistant",
      text: "Hello! I'm Jarvis, your AI assistant for marketing insights and campaign management. Ask me anything about your organizations, contacts, campaigns, or growth opportunities.",
    },
  ]);
  const [input, setInput] = useState("");
  const [nextId, setNextId] = useState(2);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [testEmail, setTestEmail] = useState("");

  const { loading, error, lastResponse, sendMessage } = useJarvis();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    // Add user message
    const userMessage = {
      id: nextId,
      type: "user",
      text: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setNextId(nextId + 1);
    setInput("");

    // Get Jarvis response
    const response = await sendMessage(input);
    if (response) {
      const assistantMessage = {
        id: nextId + 1,
        type: "assistant",
        text: response.answer || "I couldn't generate a response.",
        data: response.data,
        actions: response.actionsAvailable,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setNextId(nextId + 2);
    } else if (error) {
      const errorMessage = {
        id: nextId + 1,
        type: "error",
        text: `Error: ${error}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setNextId(nextId + 2);
    }
  };

  const handleAction = async (action, assistantMessageId) => {
    try {
      if (action === "create_campaign") {
        // Create a campaign draft and add result to chat
        const response = await fetch(
          "http://localhost:5001/api/jarvis/actions/recommend-campaign",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateType: "announcement" }),
          },
        );
        const result = await response.json();

        if (result.success) {
          setSelectedCampaignId(result.data.campaign.id);
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ ${result.data.message}\n\nCampaign created: **${result.data.campaign.name}**\n\nYou can now prepare recipients or send a test email.`,
            actionResult: true,
          };
          setMessages((prev) => [...prev, actionResult]);
          setNextId(nextId + 1);
        }
      } else if (action === "prepare_recipients") {
        if (!selectedCampaignId) {
          alert("Please create a campaign first");
          return;
        }
        const response = await fetch(
          "http://localhost:5001/api/jarvis/actions/prepare-recipients",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId: selectedCampaignId }),
          },
        );
        const result = await response.json();

        if (result.success) {
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ Recipients prepared!\n\n**Total Recipients:** ${result.data.recipientCount}\n\n**By Source:**\n${Object.entries(
              result.data.bySource,
            )
              .map(([source, count]) => `• ${source}: ${count}`)
              .join("\n")}\n\nReady to send test email.`,
            actionResult: true,
          };
          setMessages((prev) => [...prev, actionResult]);
          setNextId(nextId + 1);
        }
      } else if (action === "send_test_email") {
        if (!selectedCampaignId) {
          alert("Please create a campaign first");
          return;
        }
        const email = testEmail || "delivered@resend.dev";
        const response = await fetch(
          "http://localhost:5001/api/jarvis/actions/send-test-email",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaignId: selectedCampaignId,
              testEmail: email,
            }),
          },
        );
        const result = await response.json();

        if (result.success) {
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ Test email sent!\n\n**Recipient:** ${result.data.testEmail}\n**Message ID:** ${result.data.messageId}\n**Status:** ${result.data.status}`,
            actionResult: true,
          };
          setMessages((prev) => [...prev, actionResult]);
          setNextId(nextId + 1);
          setTestEmail("");
        }
      }
    } catch (err) {
      const errorMessage = {
        id: nextId,
        type: "error",
        text: `Error executing action: ${err.message}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setNextId(nextId + 1);
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      create_campaign: "📧 Create Campaign",
      prepare_recipients: "👥 Prepare Recipients",
      send_test_email: "✉️ Send Test Email",
      review_organization: "🏢 Review Organization",
      view_contacts: "👤 View Contacts",
      launch_campaign: "🚀 Launch Campaign",
    };
    return labels[action] || action;
  };

  return (
    <div className="jarvis-chat-container">
      <div className="jarvis-header">
        <h1>🤖 Jarvis Assistant</h1>
        <p>AI-powered insights and campaign management</p>
      </div>

      <div className="jarvis-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`jarvis-message jarvis-message--${msg.type}`}
          >
            <div className="jarvis-message-content">
              <div className="jarvis-message-text">{msg.text}</div>

              {msg.actions && msg.actions.length > 0 && (
                <div className="jarvis-actions">
                  <p className="jarvis-actions-label">Available Actions:</p>
                  <div className="jarvis-actions-list">
                    {msg.actions.map((action) => (
                      <button
                        key={action}
                        className="jarvis-action-btn"
                        onClick={() => handleAction(action, msg.id)}
                        disabled={loading}
                      >
                        {getActionLabel(action)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msg.data && typeof msg.data === "object" && (
                <div className="jarvis-data">
                  <details>
                    <summary>📊 View Details</summary>
                    <pre>{JSON.stringify(msg.data, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="jarvis-input-form">
        <div className="jarvis-input-group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jarvis about organizations, contacts, campaigns..."
            disabled={loading}
            className="jarvis-input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="jarvis-send-btn"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>

        {selectedCampaignId && (
          <div className="jarvis-test-email-group">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Test email address (optional)"
              className="jarvis-test-email-input"
            />
          </div>
        )}

        {error && <div className="jarvis-error">{error}</div>}
      </form>
    </div>
  );
}
