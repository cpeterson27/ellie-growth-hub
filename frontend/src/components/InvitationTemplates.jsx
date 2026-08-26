import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { fetchInvitationTemplates, resetInvitationTemplate, saveInvitationTemplate } from "../services/api.js";

const labels = { coach: "Coach", ambassador: "Brand Ambassador", closer: "Closer / Sales", general: "General Team Member" };
const personalizations = { firstName: "First name", displayName: "Full name", role: "Role", workspaceName: "Business name", inviteLink: "Secure invitation button", invitedBy: "Invited by" };
const friendly = value => String(value || "").replace(/{{(\w+)}}/g, (match, key) => personalizations[key] ? `[${personalizations[key]}]` : match);
const stored = value => Object.entries(personalizations).reduce((text, [key, label]) => text.replaceAll(`[${label}]`, `{{${key}}}`), value);
const samples = { firstName: "Jordan", displayName: "Jordan Taylor", role: "Coach", workspaceName: "Your business", inviteLink: "[Secure invitation button]", invitedBy: "Your team" };
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
      {draft ? <div className="team-access__editor"><label>Email subject<input value={friendly(draft.subject)} onChange={(event) => setDraft({ ...draft, subject: stored(event.target.value) })}/></label><label>Invitation message<textarea rows="11" value={friendly(draft.body)} onChange={(event) => setDraft({ ...draft, body: stored(event.target.value) })}/></label><label>Insert personalization<select value="" onChange={event => setDraft({ ...draft, body: `${draft.body} {{${event.target.value}}}` })}><option value="">Choose a detail to add to the message</option>{Object.entries(personalizations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><small>Personal details are filled in for each recipient. The invitation button uses their secure account activation link.</small><div><Button loading={saving} onClick={save}>Save template</Button><Button variant="outline" disabled={saving} onClick={restore}>Restore default</Button></div><article className="team-access__preview"><p className="page-eyebrow">Email preview</p><strong>{render(draft.subject)}</strong><div style={{ whiteSpace: "pre-wrap" }}>{render(draft.body).split("[Secure invitation button]").map((part, index) => <span key={index}>{index > 0 ? <button type="button" disabled>Accept invitation</button> : null}{part}</span>)}</div></article></div> : null}
    </section></div>;
}
