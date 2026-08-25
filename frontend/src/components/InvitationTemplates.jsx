import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { fetchInvitationTemplates, resetInvitationTemplate, saveInvitationTemplate } from "../services/api.js";

const labels = { coach: "Coach", ambassador: "Brand Ambassador", closer: "Closer / Sales", general: "General Team Member" };
const samples = { firstName: "Jordan", displayName: "Jordan Taylor", role: "Coach", workspaceName: "Ellie's Coaching", inviteLink: "https://elliescoaching.com/accept-invitation/secure-link", invitedBy: "Ellie" };
const render = (value) => String(value || "").replace(/{{(firstName|displayName|role|workspaceName|inviteLink|invitedBy)}}/g, (_match, key) => samples[key]);

export default function InvitationTemplates() {
  const [templates, setTemplates] = useState([]), [selected, setSelected] = useState("coach"), [draft, setDraft] = useState(null), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false);
  const load = () => fetchInvitationTemplates().then((rows) => { setTemplates(rows); const row = rows.find((item) => item.roleKey === selected) || rows[0]; setDraft(row ? { ...row } : null); }).catch(() => setNotice("Unable to load invitation templates."));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (key) => { setSelected(key); const row = templates.find((item) => item.roleKey === key); setDraft(row ? { ...row } : null); setNotice(""); };
  const save = async () => { setSaving(true); try { const row = await saveInvitationTemplate(selected, { subject: draft.subject, body: draft.body }); setTemplates((items) => items.map((item) => item.roleKey === selected ? row : item)); setDraft({ ...row }); setNotice("Template saved for this workspace."); } catch (error) { setNotice(error.response?.data?.error || "Unable to save template."); } finally { setSaving(false); } };
  const restore = async () => { setSaving(true); try { const row = await resetInvitationTemplate(selected); setTemplates((items) => items.map((item) => item.roleKey === selected ? row : item)); setDraft({ ...row }); setNotice("Default template restored."); } catch (error) { setNotice(error.response?.data?.error || "Unable to restore template."); } finally { setSaving(false); } };
  return <div className="account-settings-panel account-settings-panel--refined team-access"><header><p className="page-eyebrow">Settings · Communications</p><h2>Invitation Templates</h2><p>These workspace-specific messages are used when you invite people into Growth Operator. You can still personalize the copy for one recipient before sending.</p></header>
    {notice ? <p className="settings-save-note">{notice}</p> : null}
    <section className="settings-section team-access__role-guide"><div className="settings-tabs">{Object.keys(labels).map((key) => <button type="button" className={selected === key ? "is-active" : ""} key={key} onClick={() => choose(key)}>{labels[key]}</button>)}</div>
      {draft ? <div className="team-access__editor"><label>Email subject<input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}/></label><label>Invitation message<textarea rows="11" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })}/></label><small>Variables: {"{{firstName}} · {{displayName}} · {{role}} · {{workspaceName}} · {{inviteLink}} · {{invitedBy}}"}</small><div><Button loading={saving} onClick={save}>Save template</Button><Button variant="outline" disabled={saving} onClick={restore}>Restore default</Button></div><article className="team-access__preview"><p className="page-eyebrow">Email preview</p><strong>{render(draft.subject)}</strong><p style={{ whiteSpace: "pre-wrap" }}>{render(draft.body)}</p></article></div> : null}
    </section></div>;
}
