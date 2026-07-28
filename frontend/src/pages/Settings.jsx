import { useState } from "react";
import Button from "../components/Button.jsx";
import { useNavigate } from "react-router-dom";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

export default function Settings() {
  const navigate = useNavigate();
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
        <p className="page-subtitle">Manage the client account identity. Campaign workspaces, CRM fields, and connected applications are managed where they are used.</p>
      </div>
      <Button onClick={save}>Save changes</Button>
    </div>
    {saved ? <p className="discovery-notice">Workspace settings saved.</p> : null}

    <section className="account-settings-card">
      <div className="account-settings-card__intro">
        <span>Client account</span>
        <h2>Workspace identity</h2>
        <p>Only settings that currently affect the product belong here. Event and program workspaces are selected from the top navigation.</p>
      </div>
      <div className="account-settings-card__form">
        <label className="form-field"><span>Workspace name</span><input className="select-input" value={settings.workspaceName} onChange={(event) => setSettings({ ...settings, workspaceName: event.target.value })} /></label>
        <label className="form-field"><span>Default sender name</span><input className="select-input" value={settings.senderName || ""} placeholder="e.g. Ellie’s Coaching" onChange={(event) => setSettings({ ...settings, senderName: event.target.value })} /></label>
        <div className="settings-linked-areas">
          <p><strong>Contact fields</strong><span>Review built-in fields or add a business-specific field.</span></p><Button variant="outline" size="sm" onClick={() => navigate("/integrations/crm")}>Manage CRM fields</Button>
          <p><strong>Connected accounts</strong><span>Manage Gmail, Eventbrite, Resend, and contact sources.</span></p><Button variant="outline" size="sm" onClick={() => navigate("/integrations")}>Open integrations</Button>
        </div>
      </div>
    </section>
  </div>;
}
