import { useState } from "react";
import Button from "../components/Button.jsx";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const [settings, setSettings] = useState(getWorkspaceSettings);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveWorkspaceSettings(settings);
    setSaved(true);
  };

  return <div className="page-dashboard settings-page">
    <div className="page-header">
      <div>
        <p className="page-eyebrow">Account & workspace</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage the client workspace identity and account preferences. CRM configuration and connected apps live in Integrations.</p>
      </div>
      <Button onClick={save}>Save changes</Button>
    </div>
    {saved ? <p className="discovery-notice">Workspace settings saved.</p> : null}

    <section className="account-settings-card">
      <div className="account-settings-card__intro">
        <span>Client account</span>
        <h2>Workspace identity</h2>
        <p>These details identify the client’s account across Ellie. They do not change CRM fields, pipelines, contacts, or connected applications.</p>
      </div>
      <div className="account-settings-card__form">
        <label className="form-field"><span>Workspace name</span><input className="select-input" value={settings.workspaceName} onChange={(event) => setSettings({ ...settings, workspaceName: event.target.value })} /></label>
        <label className="form-field"><span>Primary business type</span><select className="select-input" value={settings.businessType || "coaching"} onChange={(event) => setSettings({ ...settings, businessType: event.target.value })}><option value="coaching">Coaching / education</option><option value="events">Events</option><option value="real_estate">Real estate</option><option value="agency">Agency / services</option><option value="other">Other</option></select></label>
        <label className="form-field"><span>Time zone</span><select className="select-input" value={settings.timezone || "America/Los_Angeles"} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}><option value="America/Los_Angeles">Pacific Time</option><option value="America/Denver">Mountain Time</option><option value="America/Chicago">Central Time</option><option value="America/New_York">Eastern Time</option></select></label>
        <label className="form-field"><span>Default sender name</span><input className="select-input" value={settings.senderName || ""} placeholder="e.g. Ellie’s Coaching" onChange={(event) => setSettings({ ...settings, senderName: event.target.value })} /></label>
      </div>
    </section>
  </div>;
}
