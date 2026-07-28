import { useState } from "react";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";

export default function Settings() {
  const [settings, setSettings] = useState(getWorkspaceSettings);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveWorkspaceSettings(settings);
    setSaved(true);
  };

  return <div className="page-dashboard">
    <div className="page-header">
      <div>
        <h1 className="page-title">Workspace settings</h1>
        <p className="page-subtitle">Shape the built-in CRM around your company’s language and sales process.</p>
      </div>
      <Button onClick={save}>Save changes</Button>
    </div>
    {saved ? <p className="discovery-notice">Saved. Your workspace name now appears in the top bar, and your campaign type is preselected when you create a campaign.</p> : null}
    <section className="section-grid">
      <DashboardCard title="Workspace">
        <label className="form-field"><span>Workspace name</span><input className="select-input" value={settings.workspaceName} onChange={(event) => setSettings({ ...settings, workspaceName: event.target.value })} /></label>
        <label className="form-field"><span>Default campaign type</span><select className="select-input" value={settings.defaultCampaignKind} onChange={(event) => setSettings({ ...settings, defaultCampaignKind: event.target.value })}><option value="event">Event</option><option value="program">Skool program</option></select></label>
      </DashboardCard>
      <DashboardCard title="CRM pipeline">
        <p>Use one stage per line. These stages define the relationship journey your team follows.</p>
        <label className="form-field"><span>Contact stages</span><textarea className="select-input" rows="10" value={(settings.contactStages || []).join("\n")} onChange={(event) => setSettings({ ...settings, contactStages: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
      </DashboardCard>
      <DashboardCard title="Custom contact fields">
        <p>Add fields that matter to this business. They appear when a contact is edited and remain separate from standard identity fields.</p>
        <label className="form-field"><span>Field labels — one per line</span><textarea className="select-input" rows="8" value={(settings.customContactFields || []).join("\n")} onChange={(event) => setSettings({ ...settings, customContactFields: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
        <small>This workspace currently stores these preferences in this browser. Per-client server-side settings and permissions are required before selling this as a multi-tenant SaaS.</small>
      </DashboardCard>
      <DashboardCard title="What Ellie notifies you about">
        <p>There are no automatic browser or email notifications configured yet. Delivery failures and approval status are visible directly on the Outreach page.</p>
        <p>When notifications are connected, this page will control them. Until then, it does not pretend to send alerts.</p>
      </DashboardCard>
    </section>
  </div>;
}
