import { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { fetchApplicationConfig, fetchWorkspaceMembers, updateApplicationConfig } from "../services/api.js";

export default function ApplicationNotificationSettings() {
  const [config, setConfig] = useState(null), [members, setMembers] = useState([]), [message, setMessage] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => Promise.all([fetchApplicationConfig(), fetchWorkspaceMembers()]).then(([settings, team]) => { setConfig(settings); setMembers((team.members || []).filter((member) => member.status === "active")); }).catch((err) => setError(err.response?.data?.error || "Unable to load notification settings.")), 0); return () => window.clearTimeout(timer); }, []);
  if (!config) return error ? <p className="form-error">{error}</p> : null;
  const selected = (config.notificationRecipientUserIds || []).map(String);
  const toggle = (id) => setConfig((current) => ({ ...current, notificationRecipientUserIds: selected.includes(String(id)) ? selected.filter((value) => value !== String(id)) : [...selected, id] }));
  const save = async () => { try { setSaving(true); setConfig(await updateApplicationConfig(config)); setMessage("Notification recipients saved."); setError(""); } catch (err) { setError(err.response?.data?.error || "Unable to save notification recipients."); } finally { setSaving(false); } };
  return <section className="account-settings-panel account-settings-panel--refined"><header><p className="page-eyebrow">Applications</p><h2>New application notifications</h2><p>Select active workspace members who should receive every new coaching application. The assigned closer is included automatically and recipients do not become owners.</p></header>{message ? <p className="discovery-notice">{message}</p> : null}{error ? <p className="form-error">{error}</p> : null}<section className="settings-section account-profile-form account-profile-form--compact">{members.map((member) => <label className="form-field" key={member.userId}><span><input type="checkbox" checked={selected.includes(String(member.userId))} onChange={() => toggle(member.userId)}/> {member.name}</span><small>{member.roles.join(", ")}</small></label>)}</section><footer><Button loading={saving} onClick={save}>Save notification recipients</Button></footer></section>;
}
