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
        <p className="page-subtitle">These preferences are saved in this browser and apply to your Ellie workspace.</p>
      </div>
      <Button onClick={save}>Save changes</Button>
    </div>
    {saved ? <p className="discovery-notice">Saved. Your workspace name now appears in the top bar, and your campaign type is preselected when you create a campaign.</p> : null}
    <section className="section-grid">
      <DashboardCard title="Workspace">
        <label className="form-field"><span>Workspace name</span><input className="select-input" value={settings.workspaceName} onChange={(event) => setSettings({ ...settings, workspaceName: event.target.value })} /></label>
        <label className="form-field"><span>Default campaign type</span><select className="select-input" value={settings.defaultCampaignKind} onChange={(event) => setSettings({ ...settings, defaultCampaignKind: event.target.value })}><option value="event">Event</option><option value="program">Skool program</option></select></label>
      </DashboardCard>
      <DashboardCard title="What Ellie notifies you about">
        <p>There are no automatic browser or email notifications configured yet. Delivery failures and approval status are visible directly on the Outreach page.</p>
        <p>When notifications are connected, this page will control them. Until then, it does not pretend to send alerts.</p>
      </DashboardCard>
    </section>
  </div>;
}
