import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "./Button.jsx";
import { fetchInvitationTemplates, fetchWorkspaceConfig, resetInvitationTemplate, saveInvitationTemplate } from "../services/api.js";
import { insertPersonalization } from "../utils/invitationTemplateTokens.js";

const labels = { coach: "Coach", ambassador: "Brand Ambassador", closer: "Closer / Sales", general: "General Team Member" };
const personalizations = { firstName: "First name", displayName: "Full name", role: "Role", workspaceName: "Business name", inviteLink: "Secure invitation button", invitedBy: "Invited by" };
const friendly = value => String(value || "").replace(/{{(\w+)}}/g, (match, key) => personalizations[key] ? `[${personalizations[key]}]` : match);
const sampleKey = Object.fromEntries(Object.entries(personalizations).map(([key, label]) => [label, key]));
const previewPattern = /(\[(?:First name|Full name|Role|Business name|Secure invitation button|Invited by)\]|{{(?:firstName|displayName|role|workspaceName|inviteLink|invitedBy)}})/g;

function tokenKey(token) {
  if (token.startsWith("{{")) return token.slice(2, -2);
  return sampleKey[token.slice(1, -1)];
}

function PreviewValue({ value, samples, subject = false }) {
  return String(value || "").split(previewPattern).filter(Boolean).map((part, index) => {
    const key = tokenKey(part);
    if (!key) return <span key={index}>{part}</span>;
    if (key === "inviteLink") return subject ? <span key={index}>Secure invitation</span> : <button key={index} type="button" disabled>Accept invitation</button>;
    return <span key={index}>{samples[key] || ""}</span>;
  });
}

export default function InvitationTemplates() {
  const [templates, setTemplates] = useState([]), [selected, setSelected] = useState("coach"), [draft, setDraft] = useState(null), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState({ workspaceName: "", invitedBy: "" });
  const [samples, setSamples] = useState({ firstName: "Jordan", displayName: "Jordan Taylor", role: "Coach", workspaceName: "", invitedBy: "" });
  const [activeField, setActiveField] = useState("body");
  const subjectRef = useRef(null), bodyRef = useRef(null);
  const load = async () => {
    try {
      const [rows, config] = await Promise.all([fetchInvitationTemplates(), fetchWorkspaceConfig()]);
      setTemplates(rows);
      const row = rows.find((item) => item.roleKey === selected) || rows[0];
      setDraft(row ? { ...row, subject: friendly(row.subject), body: friendly(row.body) } : null);
      const loadedIdentity = { workspaceName: config.workspaceName || "", invitedBy: config.invitationIdentity?.senderName || "Authenticated inviter" };
      setIdentity(loadedIdentity);
      setSamples((current) => ({ ...current, ...loadedIdentity }));
    } catch { setNotice("Unable to load invitation templates."); }
  };
  useEffect(() => { const initialLoad = window.setTimeout(load, 0); return () => window.clearTimeout(initialLoad); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (key) => { setSelected(key); const row = templates.find((item) => item.roleKey === key); setDraft(row ? { ...row, subject: friendly(row.subject), body: friendly(row.body) } : null); setSamples((current) => ({ ...current, role: labels[key] })); setNotice(""); };
  const save = async () => { setSaving(true); try { const row = await saveInvitationTemplate(selected, { subject: draft.subject, body: draft.body }); setTemplates((items) => items.map((item) => item.roleKey === selected ? row : item)); setDraft({ ...row, subject: friendly(row.subject), body: friendly(row.body) }); setNotice("Template saved for this workspace."); } catch (error) { setNotice(error.response?.data?.error || "Unable to save template."); } finally { setSaving(false); } };
  const restore = async () => { setSaving(true); try { const row = await resetInvitationTemplate(selected); setTemplates((items) => items.map((item) => item.roleKey === selected ? row : item)); setDraft({ ...row, subject: friendly(row.subject), body: friendly(row.body) }); setNotice("Default template restored."); } catch (error) { setNotice(error.response?.data?.error || "Unable to restore template."); } finally { setSaving(false); } };
  const insert = (key) => {
    if (!key || !draft) return;
    const field = activeField === "subject" ? "subject" : "body";
    const input = field === "subject" ? subjectRef.current : bodyRef.current;
    const start = input?.selectionStart ?? draft[field].length;
    const end = input?.selectionEnd ?? start;
    const next = insertPersonalization(draft[field], personalizations[key], start, end);
    setDraft({ ...draft, [field]: next.value });
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(next.cursor, next.cursor); });
  };
  return <div className="account-settings-panel account-settings-panel--refined team-access"><header><p className="page-eyebrow">Settings · Communications</p><h2>Invitation Templates</h2><p>These workspace-specific messages are used when you invite people into Growth Operator. You can still personalize the copy for one recipient before sending.</p></header>
    {notice ? <p className="settings-save-note" role="status">{notice}</p> : null}
    <section className="settings-section invitation-identity-summary"><div><strong>Invitation identity</strong><span>Business: {identity.workspaceName || "Not configured"}</span><span>Invited by: {identity.invitedBy || "Authenticated inviter"}</span></div><Link to="/settings">Edit organization identity</Link></section>
    <section className="settings-section team-access__role-guide"><div className="settings-tabs">{Object.keys(labels).map((key) => <button type="button" className={selected === key ? "is-active" : ""} key={key} onClick={() => choose(key)}>{labels[key]}</button>)}</div>
      {draft ? <div className="team-access__editor invitation-template-editor"><label>Email subject<input ref={subjectRef} value={draft.subject} onFocus={() => setActiveField("subject")} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}/></label><label>Invitation message<textarea ref={bodyRef} rows="11" value={draft.body} onFocus={() => setActiveField("body")} onChange={(event) => setDraft({ ...draft, body: event.target.value })}/></label><label>Insert personalization<select value="" onChange={(event) => insert(event.target.value)}><option value="">Insert at the cursor</option>{Object.entries(personalizations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><small>Place the cursor in the subject or message first. Reusable tokens—not preview examples—are saved. The secure invitation button uses each recipient’s unique activation link.</small><div><Button loading={saving} onClick={save}>Save template</Button><Button variant="outline" disabled={saving} onClick={restore}>Restore default</Button></div><article className="team-access__preview invitation-template-preview"><p className="page-eyebrow">Email preview · sample data only</p><div className="invitation-preview-samples"><label>First name<input value={samples.firstName} onChange={(event) => setSamples({ ...samples, firstName: event.target.value })}/></label><label>Business name<input value={samples.workspaceName} onChange={(event) => setSamples({ ...samples, workspaceName: event.target.value })}/></label><label>Invited by<input value={samples.invitedBy} onChange={(event) => setSamples({ ...samples, invitedBy: event.target.value })}/></label></div><strong><PreviewValue value={draft.subject} samples={samples} subject/></strong><div className="invitation-preview-message"><PreviewValue value={draft.body} samples={samples}/></div></article></div> : null}
    </section></div>;
}
