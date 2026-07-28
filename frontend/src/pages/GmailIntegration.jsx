import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import { beginGmailConnection, disconnectGmail, fetchGmailConnection, fetchGmailThreads, sendGmailMessage } from "../services/api.js";
import "./Integrations.css";

export default function GmailIntegration() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("in:inbox");
  const [compose, setCompose] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const connection = await fetchGmailConnection();
      setStatus(connection);
      setThreads(connection.connected ? (await fetchGmailThreads(query)).threads || [] : []);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to load Gmail."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const connect = async () => {
    const response = await beginGmailConnection();
    window.location.assign(response.authorizationUrl);
  };
  const send = async () => {
    try {
      setSending(true);
      await sendGmailMessage(compose);
      setCompose(null);
      await load();
    } catch (err) { setError(err.response?.data?.error || "Unable to send this Gmail message."); }
    finally { setSending(false); }
  };

  return <div className="page-dashboard integrations-page">
    <div className="page-header">
      <div><p className="page-eyebrow">Integrations · Email</p><h1 className="page-title">Gmail</h1><p className="page-subtitle">Connect a client inbox, review conversations, prepare replies, and send only after explicit approval.</p></div>
      <Button variant="outline" onClick={() => navigate("/integrations")}>Back to integrations</Button>
    </div>
    {error ? <p className="form-error">{error}</p> : null}
    <section className="gmail-status-card">
      <div><span className={`integration-status integration-status--${status?.connected ? "connected" : "configuration_required"}`}>{status?.connected ? "Connected" : "Not connected"}</span><h2>{status?.connected ? status.email : "Connect a Google account"}</h2><p>{status?.connected ? "Ellie can read this inbox and send messages only when a user approves the send action." : "The client signs into Google and grants access themselves. Passwords are never shared with Ellie."}</p></div>
      {status?.connected ? <Button variant="outline" onClick={async () => { await disconnectGmail(); await load(); }}>Disconnect</Button> : <Button disabled={!status?.configured} onClick={connect}>Connect Gmail</Button>}
    </section>
    {status?.connected ? <DashboardCard title="Inbox">
      <div className="gmail-toolbar"><input className="select-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gmail search, e.g. in:inbox newer_than:30d" /><Button variant="outline" onClick={load}>Search</Button><Button onClick={() => setCompose({ to: "", subject: "", body: "" })}>Compose</Button></div>
      {loading ? <p>Loading inbox…</p> : threads.length ? <div className="gmail-thread-list">{threads.map((thread) => <article key={thread.id}><div><strong>{thread.from || "Unknown sender"}</strong><span>{thread.date ? new Date(thread.date).toLocaleDateString() : ""}</span></div><h3>{thread.subject}</h3><p>{thread.snippet}</p><small>{thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}</small></article>)}</div> : <p className="table-state table-state--empty">No Gmail threads match this search.</p>}
    </DashboardCard> : <DashboardCard title="What Gmail adds"><div className="settings-explainer-list"><p><strong>Inbox visibility:</strong> review relevant conversations and replies alongside contacts.</p><p><strong>Draft and approve:</strong> prepare a personal email without sending it automatically.</p><p><strong>Account ownership:</strong> each client connects their own Google account through OAuth.</p></div></DashboardCard>}
    <Modal isOpen={Boolean(compose)} onClose={() => !sending && setCompose(null)} title="Compose Gmail message" footer={<><Button variant="outline" disabled={sending} onClick={() => setCompose(null)}>Cancel</Button><Button loading={sending} onClick={send}>Approve and send</Button></>}>
      {compose ? <div className="gmail-compose"><label className="form-field"><span>To</span><input className="select-input" value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} /></label><label className="form-field"><span>Subject</span><input className="select-input" value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label><label className="form-field"><span>Message</span><textarea className="select-input" rows="10" value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} /></label><p className="contact-modal-intro">This button sends the message from the connected Gmail account. Review the recipient and content before approving.</p></div> : null}
    </Modal>
  </div>;
}
