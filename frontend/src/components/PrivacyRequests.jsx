import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "./Button.jsx";
import { approvePrivacyRequest, fetchPrivacyRequest, fetchPrivacyRequests, updatePrivacyRequestStatus } from "../services/api.js";

const LABELS = { received: "Received", under_review: "Under Review", verified: "Verified", completed: "Completed", rejected: "Rejected / Unable" };
const CATEGORIES = [
  ["contact", "CRM contact"], ["social_identity", "Social identity"], ["social_events", "Meta events"],
  ["conversations", "Conversations and messages"], ["tracked_links", "Tracked links"], ["applications", "Program applications"],
];

export default function PrivacyRequests() {
  const location = useLocation();
  const [rows, setRows] = useState([]); const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState(""); const [selectedContacts, setSelectedContacts] = useState([]);
  const [categories, setCategories] = useState([]); const [confirmation, setConfirmation] = useState("");
  const [confirmationDraft, setConfirmationDraft] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const requestedId = new URLSearchParams(location.search).get("request");
  const load = async () => { try { setRows(await fetchPrivacyRequests()); } catch (err) { setError(err.response?.data?.error || "Unable to load privacy requests."); } };
  const open = async (id) => { try { setDetail(await fetchPrivacyRequest(id)); setNotes(""); setCategories([]); setSelectedContacts([]); setConfirmation(""); setConfirmationDraft(null); setError(""); } catch (err) { setError(err.response?.data?.error || "Unable to load this request."); } };
  useEffect(() => {
    fetchPrivacyRequests().then(setRows).catch((err) => setError(err.response?.data?.error || "Unable to load privacy requests."));
    if (requestedId) fetchPrivacyRequest(requestedId).then(setDetail).catch((err) => setError(err.response?.data?.error || "Unable to load this request."));
  }, [requestedId]);
  const transition = async (action) => { try { setBusy(true); await updatePrivacyRequestStatus(detail.request._id, { action, notes }); await load(); await open(detail.request._id); } catch (err) { setError(err.response?.data?.error || "Unable to update this request."); } finally { setBusy(false); } };
  const approve = async () => { try { setBusy(true); const result = await approvePrivacyRequest(detail.request._id, { contactIds: selectedContacts, categories, confirmation }); setConfirmationDraft(result.confirmation); await load(); await open(detail.request._id); setConfirmationDraft(result.confirmation); } catch (err) { setError(err.response?.data?.error || "Unable to complete this request."); } finally { setBusy(false); } };
  const toggle = (setter, current, value) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  return <div className="account-settings-panel account-settings-panel--refined privacy-requests">
    <header><p className="page-eyebrow">Privacy operations</p><h2>Data deletion requests</h2><p>Review, verify, and explicitly approve requests. Growth Operator never deletes data merely because an email was received.</p></header>
    {error ? <p className="form-error">{error}</p> : null}
    <div className="privacy-request-layout">
      <div className="privacy-request-list">{rows.length ? rows.map((row) => <button key={row._id} className={detail?.request?._id === row._id ? "is-active" : ""} onClick={() => open(row._id)}><strong>{row.requester?.email || "Requester identity removed"}</strong><span>{LABELS[row.status]} · {new Date(row.createdAt).toLocaleDateString()}</span></button>) : <p>No privacy requests have been detected.</p>}</div>
      <div className="privacy-request-detail">{detail ? <>
        <div className="privacy-request-status"><strong>{LABELS[detail.request.status]}</strong><span>Source: {detail.request.source === "gmail" ? "Gmail sync" : "Manual"}</span></div>
        <dl><div><dt>Requester</dt><dd>{detail.request.requester?.name || "—"} {detail.request.requester?.email || ""}</dd></div><div><dt>Identifiers supplied</dt><dd>{detail.request.requester?.metaIdentifiers?.join(", ") || "None supplied"}</dd></div></dl>
        {detail.request.status !== "completed" ? <section><h3>Candidate records</h3><p>Exact, workspace-scoped candidates only. Verify identity and authority outside this screen before approval.</p>{detail.candidates.contacts.map((row) => <label className="privacy-check" key={row._id}><input type="checkbox" checked={selectedContacts.includes(row._id)} onChange={() => toggle(setSelectedContacts, selectedContacts, row._id)} /><span><strong>{row.name || row.email || "Contact"}</strong><small>{row.email || "No email"} · {row.status}</small></span></label>)}{!detail.candidates.contacts.length ? <p>No candidate Contact was found. Do not approve destructive actions.</p> : null}
          <div className="privacy-counts">{Object.entries(detail.candidates.counts).map(([key, value]) => <span key={key}><strong>{value}</strong>{key}</span>)}</div>
          <p className="settings-oauth-note"><span><strong>Shared Meta authorization is excluded</strong><small>{detail.candidates.metaAuthorizationAction}</small></span></p>
        </section> : null}
        {["received", "under_review"].includes(detail.request.status) ? <section><h3>Human review</h3><textarea rows="4" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record how identity and authority were verified, or why they could not be verified." /> <div className="privacy-actions">{detail.request.status === "received" ? <Button variant="outline" loading={busy} onClick={() => transition("review")}>Begin review</Button> : null}<Button loading={busy} disabled={!notes.trim()} onClick={() => transition("verify")}>Mark verified</Button><Button variant="outline" loading={busy} disabled={!notes.trim()} onClick={() => transition("reject")}>Reject / unable</Button></div></section> : null}
        {detail.request.status === "verified" ? <section><h3>Explicit approval</h3>{CATEGORIES.map(([value, label]) => <label className="privacy-check" key={value}><input type="checkbox" checked={categories.includes(value)} onChange={() => toggle(setCategories, categories, value)} /><span>{label}</span></label>)}<label className="form-field"><span>Type {detail.confirmationPhrase}</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><Button loading={busy} disabled={!selectedContacts.length || !categories.length || confirmation !== detail.confirmationPhrase} onClick={approve}>Complete selected actions</Button></section> : null}
        {confirmationDraft ? <section className="privacy-confirmation"><h3>Confirmation draft</h3><p>No email was sent automatically. Review this draft, then send it through the normal approved communication workflow.</p><strong>To: {confirmationDraft.to}</strong><strong>Subject: {confirmationDraft.subject}</strong><p>{confirmationDraft.body}</p></section> : null}
        {detail.request.auditTrail?.length ? <section><h3>Audit trail</h3><ol>{detail.request.auditTrail.map((item, index) => <li key={`${item.action}-${index}`}><strong>{LABELS[item.action] || item.action}</strong> — {item.detail} <small>{new Date(item.at).toLocaleString()}</small></li>)}</ol></section> : null}
      </> : <p>Select a request to review its sanitized candidates and audit trail.</p>}</div>
    </div>
  </div>;
}
