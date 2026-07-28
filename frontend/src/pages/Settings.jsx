import { useEffect, useState } from "react";
import { FiLock, FiMail, FiShield, FiUser, FiUsers } from "react-icons/fi";
import Button from "../components/Button.jsx";
import { fetchGmailConnection, fetchWorkspaceConfig, updateWorkspaceConfig } from "../services/api.js";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const [workspaceName, setWorkspaceName] = useState(() => getWorkspaceSettings().workspaceName);
  const [accountEmail, setAccountEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWorkspaceConfig().then((config) => setWorkspaceName(config.workspaceName)).catch(() => {});
    fetchGmailConnection().then((connection) => setAccountEmail(connection.email || "")).catch(() => {});
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const config = await updateWorkspaceConfig({ workspaceName });
      const local = { ...getWorkspaceSettings(), workspaceName: config.workspaceName };
      saveWorkspaceSettings(local);
      setWorkspaceName(config.workspaceName);
      setSaved(true);
      setError("");
    } catch (err) { setError(err.response?.data?.error || "Unable to save the workspace name."); }
    finally { setSaving(false); }
  };

  return <div className="page-dashboard account-page">
    <div className="page-header"><div><p className="page-eyebrow">Account</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Manage the account and organization behind this Ellie workspace.</p></div></div>
    {saved ? <p className="discovery-notice">Workspace name saved across Ellie.</p> : null}
    {error ? <p className="form-error">{error}</p> : null}
    <section className="account-layout">
      <nav className="account-settings-nav" aria-label="Settings sections">
        <button className="is-active"><FiUser /> Organization profile</button>
        <button disabled><FiLock /> Login & password <small>After user accounts</small></button>
        <button disabled><FiShield /> Security <small>After user accounts</small></button>
        <button disabled><FiUsers /> Team access <small>After user accounts</small></button>
      </nav>
      <div className="account-settings-panel">
        <header><p className="page-eyebrow">Organization profile</p><h2>Workspace identity</h2><p>This name appears in Ellie’s navigation and identifies the client account. Events, programs, and offers are selected separately from the workspace menu at the top of the application.</p></header>
        <div className="account-profile-form">
          <label className="form-field"><span>Workspace name</span><input value={workspaceName} onChange={(event) => { setWorkspaceName(event.target.value); setSaved(false); }} /><small>Example: Ellie’s Coaching</small></label>
          <label className="form-field"><span>Connected account email</span><div className="account-readonly-field"><FiMail /> {accountEmail || "No Gmail account connected"}</div><small>Email connections are managed from Integrations.</small></label>
        </div>
        <footer><Button loading={saving} disabled={workspaceName.trim().length < 2} onClick={save}>Save organization profile</Button></footer>
      </div>
    </section>
  </div>;
}
