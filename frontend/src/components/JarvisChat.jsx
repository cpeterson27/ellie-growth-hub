import { useState, useRef, useEffect } from "react";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useJarvis } from "../hooks/useJarvis";
import { createContentBrief, fetchJarvisProfile, updateJarvisProfile } from "../services/api.js";
import "./JarvisChat.css";

// Speech synthesis handles plain prose much better than rendered Markdown.
// Keep the visual response intact, but remove formatting and add natural pauses
// before handing a reply to the browser voice.
const prepareTextForSpeech = (text = "") =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*|__|[*_~]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^\s*(.+?):\s*$/gm, "$1. ")
    .replace(/^\s*(.+?):\s*(.+)$/gm, "$1: $2. ")
    .replace(/\n+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * JarvisChat Component
 * Minimal Jarvis assistant chat interface
 */
export default function JarvisChat() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
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

  const { loading, error, sendMessage, recommendCampaign, prepareRecipients, sendTestEmail, getStatus } = useJarvis();
  const messagesEndRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [savingDraftId, setSavingDraftId] = useState(null);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [speakingId, setSpeakingId] = useState(null);
  const [speechError, setSpeechError] = useState("");
  const speechStartTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    getStatus().then(setStatus);
  }, [getStatus]);

  useEffect(() => {
    fetchJarvisProfile().then((response) => {
      if (!response?.success) return;
      setProfile(response.data);
      setVoiceName(response.data.voiceName || "");
      setAutoSpeak(response.data.autoSpeak !== false);
      setMessages((current) => current.map((item) => item.id === 1 ? { ...item, text: response.data.greeting || item.text } : item));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return undefined;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      if (!voiceName && available[0]) setVoiceName(available[0].name);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [voiceName]);

  const scrollToBottom = () => {
    const messagePanel = messagesEndRef.current?.parentElement;
    messagePanel?.scrollTo({ top: messagePanel.scrollHeight, behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const speakText = (text, id) => {
    const spokenText = prepareTextForSpeech(text);
    if (!("speechSynthesis" in window) || !spokenText) {
      setSpeechError("Voice playback is not available in this browser.");
      return;
    }
    setSpeechError("");
    if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.voice = voices.find((voice) => voice.name === voiceName) || null;
    utterance.rate = profile?.voiceRate || 1;
    utterance.pitch = profile?.voicePitch || 1;
    utterance.onstart = () => {
      if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
      setSpeakingId(id);
    };
    utterance.onend = () => {
      if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
      setSpeakingId(null);
    };
    utterance.onerror = (event) => {
      if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
      setSpeakingId(null);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setSpeechError("Browser voice playback was blocked. Click Test voice once, then ask Jarvis again.");
      }
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    speechStartTimerRef.current = window.setTimeout(() => {
      setSpeechError("Your browser did not start voice playback. Check macOS Sound output, then try Test voice in Chrome.");
    }, 1500);
  };

  const testVoice = () => {
    speakText(`Hi, I am ${profile?.name || "Jarvis"}. Voice playback is ready.`, "voice-test");
  };

  useEffect(() => () => {
    if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (isFullscreen) {
        if (document.fullscreenElement) await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Keep a full-viewport fallback for browsers that block the native API.
      setIsFullscreen((current) => !current);
    }
  };

  const submitPrompt = async (prompt) => {
    if (!prompt.trim() || loading) return;

    // Add user message
    const userMessage = {
      id: nextId,
      type: "user",
      text: prompt,
    };
    setMessages((prev) => [...prev, userMessage]);
    setNextId(nextId + 1);
    setInput("");

    const response = await sendMessage(prompt);
    if (response) {
      const assistantMessage = {
        id: nextId + 1,
        type: "assistant",
        text: response.answer || "I couldn't generate a response.",
        data: response.data,
        actions: response.actionsAvailable,
        activity: response.activity || [],
        memorySources: response.memorySources || [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setNextId(nextId + 2);
      if (autoSpeak) speakText(assistantMessage.text, assistantMessage.id);
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if ("speechSynthesis" in window) window.speechSynthesis.resume();
    const prompt = input;
    setInput("");
    submitPrompt(prompt);
  };

  const handleAction = async (action) => {
    try {
      if (action === "view_development_requests") {
        navigate("/development-requests");
      } else if (action === "create_campaign") {
        // Create a campaign draft and add result to chat
        const result = await recommendCampaign({ templateType: "announcement" });

        if (result?.success) {
          setSelectedCampaignId(result.campaign.id);
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ ${result.message}\n\nCampaign created: **${result.campaign.name}**\n\nYou can now prepare recipients or send a test email.`,
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
        const result = await prepareRecipients(selectedCampaignId);

        if (result?.success) {
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ Recipients prepared!\n\n**Total Recipients:** ${result.recipientCount}\n\n**By Source:**\n${Object.entries(
              result.bySource,
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
        if (!testEmail.trim()) {
          alert("Enter a test email address before sending.");
          return;
        }
        const email = testEmail.trim();
        const result = await sendTestEmail(selectedCampaignId, email);

        if (result?.success) {
          const actionResult = {
            id: nextId,
            type: "assistant",
            text: `✅ Test email sent!\n\n**Recipient:** ${result.testEmail}\n**Message ID:** ${result.messageId}\n**Status:** ${result.status}`,
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
      view_audience: "👥 View Audience",
      start_campaign: "📧 Start Campaign",
      view_organization: "🏢 View Organization",
      add_audience: "👥 Add to Audience",
      filter_by_source: "🔎 Filter by Source",
      export_contacts: "📤 Export Contacts",
      view_contacts: "👤 View Contacts",
      view_dashboard: "📊 View Dashboard",
      start_outreach: "📣 Start Outreach",
      view_audiences: "👥 View Audiences",
      create_audience: "➕ Create Audience",
      view_analytics: "📈 View Analytics",
      launch_campaign: "🚀 Launch Campaign",
      view_development_requests: "Review Development Request",
    };
    return labels[action] || action;
  };

  const saveJarvisDraft = async (message, type) => {
    try {
      setSavingDraftId(message.id);
      const title = type === "email_template" ? "Jarvis email template" : "Jarvis social draft";
      await createContentBrief({ title, type, body: message.text, source: "jarvis" });
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, savedAs: type } : item));
    } catch (err) {
      setMessages((current) => [...current, { id: nextId, type: "error", text: err.response?.data?.error || "Unable to save this Jarvis draft." }]);
      setNextId((current) => current + 1);
    } finally {
      setSavingDraftId(null);
    }
  };

  const speakMessage = (message) => {
    speakText(message.text, message.id);
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || listening || loading) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    recognition.onerror = () => { recognitionRef.current = null; setListening(false); };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput("");
      submitPrompt(transcript);
    };
    recognition.start();
  };

  const handleVoiceCore = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (speakingId) {
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
      return;
    }
    startListening();
  };

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j" && !loading) {
        event.preventDefault();
        startListening();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [loading, voiceName]);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!profile) return;
    try {
      setSavingProfile(true);
      const response = await updateJarvisProfile({ ...profile, voiceName, autoSpeak });
      if (response?.success) {
        setProfile(response.data);
        setMessages((current) => current.map((item) => item.id === 1 ? { ...item, text: response.data.greeting || item.text } : item));
        setProfileOpen(false);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const voiceInputSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const visualState = listening ? "listening" : speakingId ? "speaking" : loading ? "thinking" : "idle";
  const visualLabel = { idle: "Systems ready", listening: "Listening", thinking: "Analyzing workspace", speaking: "Responding" }[visualState];

  return (
    <div ref={containerRef} className={`jarvis-chat-container jarvis-chat-container--${profile?.theme || "executive"} ${isFullscreen ? "jarvis-chat-container--fullscreen" : ""}`}>
      <div className={`jarvis-header jarvis-header--${visualState}`}>
        <div className="jarvis-circuit-field" aria-hidden="true">
          <svg viewBox="0 0 1200 360" preserveAspectRatio="none">
            <path d="M0 65h155l42 42h178l40-40h135" />
            <path d="M0 294h210l45-46h147l48 48h153" />
            <path d="M1200 54h-170l-45 47H820l-53-53H650" />
            <path d="M1200 300H990l-35-38H805l-55 55H610" />
            <path d="M120 0v35l55 55v96l-44 44v130" />
            <path d="M1080 0v70l-42 42v92l52 52v104" />
            <path d="M0 177h270l40-40h100" />
            <path d="M1200 182H940l-40-40H790" />
          </svg>
          <i className="jarvis-signal jarvis-signal--one" />
          <i className="jarvis-signal jarvis-signal--two" />
          <i className="jarvis-signal jarvis-signal--three" />
          <i className="jarvis-signal jarvis-signal--four" />
        </div>
        <div className="jarvis-visualizer">
          <button type="button" className="jarvis-core" onClick={handleVoiceCore} disabled={!voiceInputSupported || loading} aria-label={listening ? "Stop listening" : speakingId ? "Stop speaking" : "Talk to Jarvis"}>
            <span className="jarvis-core-ring jarvis-core-ring--outer" />
            <span className="jarvis-core-ring jarvis-core-ring--middle" />
            <span className="jarvis-core-ring jarvis-core-ring--inner" />
            <span className="jarvis-core-ring jarvis-core-ring--pulse" />
            <span className="jarvis-reticle jarvis-reticle--one" />
            <span className="jarvis-reticle jarvis-reticle--two" />
            <span className="jarvis-core-light" />
            <span className="jarvis-orbit jarvis-orbit--one"><i /></span>
            <span className="jarvis-orbit jarvis-orbit--two"><i /></span>
            <span className="jarvis-orbit jarvis-orbit--three"><i /></span>
            <span className="jarvis-core-name">{profile?.name || "Jarvis"}</span>
            <span className="jarvis-waveform" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</span>
          </button>
          <p className="jarvis-visual-state"><span />{visualLabel}</p>
          <p className="jarvis-visual-greeting">{profile?.greeting || "Your workspace assistant for lead research, campaign planning, and follow-through."}</p>
          {voiceInputSupported ? <button type="button" className="jarvis-primary-talk" onClick={handleVoiceCore} disabled={loading}>{listening ? "Stop listening" : speakingId ? "Stop speaking" : "Talk to Jarvis"}</button> : null}
          <p className="jarvis-voice-hint">{listening ? "Speak naturally. Jarvis will respond when you pause." : "Tap the core or press Command + J to begin."}</p>
        </div>
        <div className="jarvis-statuses" aria-label="Jarvis connection status">
          <span className={status?.openai?.enabled ? "is-ready" : ""}>OpenAI {status?.openai?.enabled ? "ready" : "not enabled"}</span>
          <span className={status?.obsidian?.enabled && status?.obsidian?.writable ? "is-ready" : ""}>Memory {status?.obsidian?.enabled && status?.obsidian?.writable ? "connected" : "not connected"}</span>
          <button type="button" className="jarvis-persona-button" onClick={() => setProfileOpen((value) => !value)}>Personalize</button>
          <button type="button" className="jarvis-fullscreen-button" onClick={toggleFullscreen}>{isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}<span>{isFullscreen ? "Exit" : "Full screen"}</span></button>
        </div>
      </div>

      {profileOpen && profile ? <form className="jarvis-persona-panel" onSubmit={saveProfile}>
        <label>Name<input value={profile.name} maxLength="40" onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Greeting<input value={profile.greeting} maxLength="240" onChange={(event) => setProfile({ ...profile, greeting: event.target.value })} /></label>
        <label>Visual style<select value={profile.theme} onChange={(event) => setProfile({ ...profile, theme: event.target.value })}><option value="executive">Executive</option><option value="midnight">Midnight</option><option value="copper">Copper</option></select></label>
        <label>Response style<select value={profile.responseStyle} onChange={(event) => setProfile({ ...profile, responseStyle: event.target.value })}><option value="concise">Concise</option><option value="collaborative">Collaborative</option><option value="detailed">Detailed</option></select></label>
        <label>Voice pace<input type="range" min="0.5" max="1.5" step="0.1" value={profile.voiceRate} onChange={(event) => setProfile({ ...profile, voiceRate: Number(event.target.value) })} /></label>
        <label>Voice pitch<input type="range" min="0" max="2" step="0.1" value={profile.voicePitch} onChange={(event) => setProfile({ ...profile, voicePitch: Number(event.target.value) })} /></label>
        <button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save Jarvis"}</button>
      </form> : null}

      <div className="jarvis-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`jarvis-message jarvis-message--${msg.type}`}
          >
            <div className="jarvis-message-content">
              <div className="jarvis-message-text">{msg.text}</div>

              {msg.type === "assistant" ? <div className="jarvis-response-tools"><button onClick={() => speakMessage(msg)} disabled={speakingId === msg.id}>{speakingId === msg.id ? "Speaking…" : "Speak"}</button></div> : null}

              {msg.activity?.length ? <div className="jarvis-activity"><p>Jarvis completed</p>{msg.activity.map((step, index) => <div key={`${msg.id}-${index}`}><span>{step.status === "warning" ? "!" : "✓"}</span>{step.label}</div>)}</div> : null}
              {msg.memorySources?.length ? <div className="jarvis-memory-sources"><strong>Vault notes consulted</strong>{msg.memorySources.map((source) => <span key={source}>{source}</span>)}</div> : null}

              {msg.actions && msg.actions.length > 0 && (
                <div className="jarvis-actions">
                  <p className="jarvis-actions-label">Available Actions:</p>
                  <div className="jarvis-actions-list">
                    {msg.actions.map((action) => (
                      <button
                        key={action}
                        className="jarvis-action-btn"
                        onClick={() => handleAction(action)}
                        disabled={loading}
                      >
                        {getActionLabel(action)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msg.type === "assistant" && !msg.savedAs ? (
                <div className="jarvis-draft-actions">
                  <button disabled={savingDraftId === msg.id} onClick={() => saveJarvisDraft(msg, "email_template")}>Save as email template</button>
                  <button disabled={savingDraftId === msg.id} onClick={() => saveJarvisDraft(msg, "social")}>Save as social draft</button>
                </div>
              ) : null}
              {msg.savedAs ? <p className="jarvis-saved-note">Saved to AI Content as a {msg.savedAs === "email_template" ? "reusable email template" : "social draft"}.</p> : null}

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
            placeholder="Ask Jarvis to review priorities, plan a campaign, or prepare leads..."
            disabled={loading}
            className="jarvis-input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="jarvis-send-btn"
          >
            {loading ? "Working…" : "Ask Jarvis"}
          </button>
          {voiceInputSupported ? <button type="button" className="jarvis-mic-btn" onClick={startListening} disabled={loading || listening}>{listening ? "Listening…" : "Talk"}</button> : null}
        </div>

        {voices.length ? <div className="jarvis-voice-controls"><label className="jarvis-voice-picker">Jarvis voice<select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>{voices.map((voice) => <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} ({voice.lang})</option>)}</select></label><button type="button" className="jarvis-voice-test" onClick={testVoice} disabled={Boolean(speakingId)}>{speakingId ? "Speaking…" : "Test voice"}</button><label className="jarvis-auto-speak"><input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} /> Speak replies automatically</label></div> : <p className="jarvis-input-note">Voice playback is not available in this browser.</p>}

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

        <p className="jarvis-input-note">Press ⌘J while Ellie is open to start a voice turn. Talk records one request and sends it to Jarvis. Jarvis never sends outreach or changes records without a confirmed action.</p>
        {speechError ? <div className="jarvis-error">{speechError}</div> : null}
        {error && <div className="jarvis-error">{error}</div>}
      </form>
    </div>
  );
}
