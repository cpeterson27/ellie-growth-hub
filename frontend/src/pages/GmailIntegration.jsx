import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiArchive, FiArrowLeft, FiMail, FiRefreshCw, FiSearch, FiSend, FiTrash2 } from "react-icons/fi";
import Button from "../components/Button.jsx";
import {
  beginGmailConnection,
  disconnectGmail,
  fetchContactEmailHistory,
  fetchGmailConnection,
  fetchGmailThread,
  fetchGmailThreads,
  fetchOutreachEmailHistory,
  sendGmailMessage,
  updateGmailThread,
} from "../services/api.js";
import "./Integrations.css";

const mailboxQueries = {
  inbox: "in:inbox",
  sent: "in:sent",
  unread: "in:inbox is:unread",
  trash: "in:trash",
};

const emailAddress = (value = "") => String(value).match(/<([^>]+)>/)?.[1] || String(value).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";

export default function GmailIntegration() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [threads, setThreads] = useState([]);
  const [outreachHistory, setOutreachHistory] = useState([]);
  const [campaignSends, setCampaignSends] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [mailbox, setMailbox] = useState(params.get("view") || "inbox");
  const [search, setSearch] = useState(params.get("contact") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const query = search.trim() ? search.trim() : mailboxQueries[mailbox] || mailboxQueries.inbox;
  const needsModifyPermission = status?.connected && !status.scopes?.includes("https://www.googleapis.com/auth/gmail.modify");
  const reconnect = async () => window.location.assign((await beginGmailConnection()).authorizationUrl);
  const load = async () => {
    try {
      setLoading(true);
      const connection = await fetchGmailConnection();
      setStatus(connection);
      if (mailbox === "campaign") {
        setThreads([]);
        setCampaignSends((await fetchOutreachEmailHistory()).outreach || []);
      } else {
        setThreads(connection.connected ? (await fetchGmailThreads(query)).threads || [] : []);
        setCampaignSends([]);
      }
      const searchedEmail = emailAddress(search);
      setOutreachHistory(searchedEmail ? (await fetchContactEmailHistory(searchedEmail)).outreach || [] : []);
      setError("");
    } catch (err) {
      const message = err.response?.data?.error || "Unable to load Gmail.";
      setError(message.toLowerCase().includes("insufficient authentication scopes") ? "" : message);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [mailbox]);

  const openThread = async (thread) => {
    try {
      setLoading(true);
      const detail = await fetchGmailThread(thread.id);
      setSelectedThread(detail);
      setReply("");
      if (thread.labels?.includes("UNREAD")) await updateGmailThread(thread.id, "read");
    } catch (err) { setError(err.response?.data?.error || "Unable to open this conversation."); }
    finally { setLoading(false); }
  };

  const actOnThread = async (action) => {
    if (!selectedThread) return;
    await updateGmailThread(selectedThread.id, action);
    setSelectedThread(null);
    await load();
  };

  const sendReply = async () => {
    const messages = selectedThread?.messages || [];
    const latest = messages[messages.length - 1];
    const recipient = emailAddress(latest?.from);
    try {
      setSending(true);
      await sendGmailMessage({
        to: recipient,
        subject: /^re:/i.test(latest?.subject || "") ? latest.subject : `Re: ${latest?.subject || ""}`,
        body: reply,
        threadId: selectedThread.id,
        inReplyTo: latest?.messageId || "",
      });
      setReply("");
      setSelectedThread(await fetchGmailThread(selectedThread.id));
    } catch (err) { setError(err.response?.data?.error || "Unable to send this reply."); }
    finally { setSending(false); }
  };

  if (!status?.connected && !loading) return <div className="page-dashboard inbox-page">
    <div className="page-header"><div><p className="page-eyebrow">Client communication</p><h1 className="page-title">Conversations</h1><p className="page-subtitle">Connect Gmail once, then manage campaign replies and personal follow-up here.</p></div></div>
    <section className="gmail-status-card"><div><h2>Connect a Google account</h2><p>The client signs into Google and grants access themselves. Passwords are never shared with Ellie.</p></div><Button disabled={!status?.configured} onClick={async () => window.location.assign((await beginGmailConnection()).authorizationUrl)}>Connect Gmail</Button></section>
  </div>;

  return <div className="page-dashboard inbox-page">
    <div className="page-header">
      <div><p className="page-eyebrow">Client communication</p><h1 className="page-title">Conversations</h1><p className="page-subtitle">Campaign sends, incoming replies, and personal follow-up for {status?.email || "the connected Gmail account"}.</p></div>
      <div className="crm-header-actions"><Button variant="outline" onClick={load}><FiRefreshCw /> Refresh</Button><Button variant="outline" onClick={() => navigate("/integrations")}>Connection settings</Button></div>
    </div>
    {error ? <p className="form-error">{error}</p> : null}
    <section className="conversation-workflow">
      <div><span>1</span><p><strong>Campaign sent</strong>Resend delivers approved Outreach emails and records them in Ellie.</p></div>
      <div><span>2</span><p><strong>Reply received</strong>Replies arrive in Gmail and Ellie connects them to the contact and campaign.</p></div>
      <div><span>3</span><p><strong>Follow up here</strong>Review the full history and send a personal Gmail reply from Ellie.</p></div>
    </section>
    {needsModifyPermission ? <section className="inbox-permission-notice"><div><strong>Approve conversation management</strong><p>Reconnect once to let Ellie archive, mark, and move Gmail conversations to Trash. Google will show the updated permission request.</p></div><Button onClick={reconnect}>Approve Gmail access</Button></section> : null}
    <section className="inbox-shell">
      <aside className="inbox-folders">
        <button className={mailbox === "inbox" ? "is-active" : ""} onClick={() => { setMailbox("inbox"); setSearch(""); setSelectedThread(null); }}><FiMail /> Inbox</button>
        <button className={mailbox === "unread" ? "is-active" : ""} onClick={() => { setMailbox("unread"); setSearch(""); setSelectedThread(null); }}>Unread</button>
        <button className={mailbox === "sent" ? "is-active" : ""} onClick={() => { setMailbox("sent"); setSearch(""); setSelectedThread(null); }}><FiSend /> Sent</button>
        <button className={mailbox === "campaign" ? "is-active" : ""} onClick={() => { setMailbox("campaign"); setSearch(""); setSelectedThread(null); }}><FiSend /> Campaign sends</button>
        <button className={mailbox === "trash" ? "is-active" : ""} onClick={() => { setMailbox("trash"); setSearch(""); setSelectedThread(null); }}><FiTrash2 /> Trash</button>
        <hr />
        <button onClick={async () => { await disconnectGmail(); setStatus({ configured: true, connected: false }); }}>Disconnect Gmail</button>
      </aside>
      <div className="inbox-main">
        <form className="inbox-search" onSubmit={(event) => { event.preventDefault(); load(); }}><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, recipient, subject, or Gmail query" /><Button size="sm" type="submit">Search</Button></form>
        {selectedThread ? <div className="conversation-view">
          <header><Button variant="ghost" size="sm" onClick={() => setSelectedThread(null)}><FiArrowLeft /> Back</Button><div><Button variant="outline" size="sm" onClick={() => actOnThread("archive")}><FiArchive /> Archive</Button><Button variant="outline" size="sm" onClick={() => actOnThread("trash")}><FiTrash2 /> Move to trash</Button></div></header>
          <h2>{selectedThread.messages?.[0]?.subject || "Conversation"}</h2>
          <div className="conversation-messages">{selectedThread.messages?.map((message) => <article key={message.id} className={message.labels?.includes("SENT") ? "is-sent" : ""}><div><strong>{message.labels?.includes("SENT") ? "You" : message.from}</strong><time>{message.date ? new Date(message.date).toLocaleString() : ""}</time></div><small>To: {message.to}</small><pre>{message.body || message.snippet}</pre></article>)}</div>
          <section className="conversation-reply"><h3>Reply</h3><textarea rows="7" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" /><Button loading={sending} disabled={!reply.trim()} onClick={sendReply}><FiSend /> Approve and send reply</Button></section>
        </div> : <>
          <div className="inbox-list-heading"><div><h2>{search ? "Search results" : mailbox === "campaign" ? "Campaign sends" : mailbox[0].toUpperCase() + mailbox.slice(1)}</h2><p>{mailbox === "campaign" ? `${campaignSends.length} delivered message${campaignSends.length === 1 ? "" : "s"}` : `${threads.length} conversation${threads.length === 1 ? "" : "s"}`}</p></div></div>
          {mailbox === "campaign" ? <div className="campaign-send-list">{campaignSends.map((item) => <button key={item.id} onClick={() => { setSearch(item.contactEmail); setMailbox("inbox"); }}><div><strong>{item.contactName || item.contactEmail}</strong><span className={`outreach-status outreach-status--${item.status}`}>{item.status}</span></div><h3>{item.subject}</h3><p>{item.campaignName}</p><small>{item.sentAt ? new Date(item.sentAt).toLocaleString() : ""}</small></button>)}</div> : null}
          {outreachHistory.length ? <section className="outreach-conversation-history"><h3>Campaign messages sent by Ellie</h3>{outreachHistory.map((item) => <article key={item.id}><div><strong>{item.campaignName}</strong><span className={`outreach-status outreach-status--${item.status}`}>{item.status}</span></div><h4>{item.subject}</h4><p>{item.body}</p><small>{item.sentAt ? `Sent ${new Date(item.sentAt).toLocaleString()}` : "Not sent yet"}</small>{item.replyText ? <blockquote><strong>Latest reply</strong>{item.replyText}</blockquote> : null}</article>)}</section> : null}
          {mailbox !== "campaign" ? loading ? <p className="table-state">Loading conversations…</p> : threads.length ? <div className="gmail-thread-list">{threads.map((thread) => <button type="button" key={thread.id} className={thread.labels?.includes("UNREAD") ? "gmail-thread is-unread" : "gmail-thread"} onClick={() => openThread(thread)}><div className="gmail-thread__meta"><strong>{mailbox === "sent" ? thread.to : thread.from || "Unknown sender"}</strong><time>{thread.date ? new Date(thread.date).toLocaleDateString() : ""}</time></div><h3>{thread.subject}</h3><p>{thread.snippet}</p><small>{thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}</small></button>)}</div> : <p className="table-state table-state--empty">No conversations match this view.</p> : null}
        </>}
      </div>
    </section>
  </div>;
}
