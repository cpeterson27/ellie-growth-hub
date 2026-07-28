import { useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

const pipelinePresets = {
  event: [
    "New contact",
    "Needs research",
    "Qualified",
    "Assigned to campaign",
    "Outreach drafted",
    "Contacted",
    "Responded",
    "Registered",
    "Attended",
    "Follow-up needed",
  ],
  investor: [
    "New relationship",
    "Needs qualification",
    "Investor fit",
    "Education sent",
    "Call booked",
    "Interested",
    "Committed",
    "Nurture",
    "Not a fit",
  ],
};

export default function Settings() {
  const [settings, setSettings] = useState(getWorkspaceSettings);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveWorkspaceSettings(settings);
    setSaved(true);
  };

  const applyPreset = (preset) => {
    setSettings({ ...settings, contactStages: pipelinePresets[preset] || settings.contactStages });
  };

  return <div className="page-dashboard settings-page">
    <div className="page-header">
      <div>
        <p className="page-eyebrow">Workspace setup</p>
        <h1 className="page-title">Workspace settings</h1>
        <p className="page-subtitle">Customize the words your team sees in Ellie CRM. This changes labels and workflow stages, not your contacts.</p>
      </div>
      <Button onClick={save}>Save changes</Button>
    </div>
    {saved ? <p className="discovery-notice">Saved. Your workspace name now appears in the top bar, and your campaign type is preselected when you create a campaign.</p> : null}

    <section className="settings-hero-card">
      <div>
        <span>Recommended order</span>
        <h2>Set your workspace name, choose the default campaign type, then choose the CRM stages your team actually uses.</h2>
      </div>
      <p>Most clients should not need this page every day. They use Contacts, Campaigns, Events, and Outreach. Settings is for initial setup and occasional process changes.</p>
    </section>

    <section className="settings-grid">
      <DashboardCard title="1. Workspace identity">
        <p className="settings-card-note">This is the business name shown across the dashboard.</p>
        <label className="form-field"><span>Workspace name</span><input className="select-input" value={settings.workspaceName} onChange={(event) => setSettings({ ...settings, workspaceName: event.target.value })} /></label>
        <label className="form-field"><span>Default campaign type</span><select className="select-input" value={settings.defaultCampaignKind} onChange={(event) => setSettings({ ...settings, defaultCampaignKind: event.target.value })}><option value="event">Event campaigns</option><option value="program">Program / offer campaigns</option></select></label>
      </DashboardCard>

      <DashboardCard title="2. CRM pipeline">
        <p className="settings-card-note">These are the relationship stages your contacts move through. Use the recommended event pipeline, or edit it to match your sales process.</p>
        <div className="settings-preset-actions">
          <Button variant="outline" size="sm" onClick={() => applyPreset("event")}>Use event pipeline</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset("investor")}>Use investor pipeline</Button>
        </div>
        <label className="form-field"><span>Contact stages</span><textarea className="select-input" rows="10" value={(settings.contactStages || []).join("\n")} onChange={(event) => setSettings({ ...settings, contactStages: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
      </DashboardCard>

      <DashboardCard title="3. Contact fields">
        <p className="settings-card-note">Only add fields your team truly needs. The core CRM already tracks name, email, phone, title, company, campaign, audience profile, source, and notes.</p>
        <label className="form-field"><span>Field labels — one per line</span><textarea className="select-input" rows="8" value={(settings.customContactFields || []).join("\n")} onChange={(event) => setSettings({ ...settings, customContactFields: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
      </DashboardCard>

      <DashboardCard title="4. What belongs here">
        <div className="settings-explainer-list">
          <p><strong>Settings:</strong> workspace name, CRM language, default campaign style.</p>
          <p><strong>Integrations:</strong> Eventbrite, Apollo, Gmail, CRM connectors, social accounts.</p>
          <p><strong>Contacts:</strong> import, edit, qualify, and assign people to campaigns.</p>
        </div>
        <small>For a sellable multi-client version, these preferences should be stored per client account on the backend with user roles and permissions.</small>
      </DashboardCard>
    </section>
  </div>;
}
