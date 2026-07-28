import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

const presets = {
  growth: ["New lead", "Qualified", "Campaign assigned", "Contacted", "Responded", "Customer", "Nurture", "Not a fit"],
  event: ["New lead", "Qualified", "Invited", "Registered", "Attended", "Follow-up", "Customer", "Not interested"],
  coaching: ["New lead", "Qualified", "Conversation started", "Call booked", "Offer made", "Enrolled", "Nurture", "Not a fit"],
};

const coreFields = ["Name", "Email", "Phone", "Job title", "Company", "Location", "Lifecycle stage", "Source", "Tags", "Audience / interests", "Campaign assignments", "Notes"];

export default function CrmSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(getWorkspaceSettings);
  const [saved, setSaved] = useState(false);
  const save = () => { saveWorkspaceSettings(settings); setSaved(true); };
  const applyPreset = (key) => setSettings({ ...settings, contactStages: presets[key] });

  return <div className="page-dashboard settings-page">
    <div className="page-header">
      <div><p className="page-eyebrow">Integrations · Ellie CRM</p><h1 className="page-title">Configure Ellie CRM</h1><p className="page-subtitle">Define how this client organizes relationships. Contact records and daily follow-up remain in CRM.</p></div>
      <div className="crm-header-actions"><Button variant="outline" onClick={() => navigate("/contacts")}>Open CRM</Button><Button onClick={save}>Save CRM setup</Button></div>
    </div>
    {saved ? <p className="discovery-notice">CRM configuration saved for this workspace.</p> : null}
    <section className="settings-grid">
      <DashboardCard title="Pipeline stages">
        <p className="settings-card-note">A stage answers one question: where is this relationship in your business process? Campaign assignment and email verification are tracked separately.</p>
        <div className="settings-preset-actions"><Button variant="outline" size="sm" onClick={() => applyPreset("growth")}>General growth</Button><Button variant="outline" size="sm" onClick={() => applyPreset("event")}>Event business</Button><Button variant="outline" size="sm" onClick={() => applyPreset("coaching")}>Coaching / Skool</Button></div>
        <label className="form-field"><span>Stages — one per line</span><textarea className="select-input" rows="10" value={(settings.contactStages || []).join("\n")} onChange={(event) => setSettings({ ...settings, contactStages: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
      </DashboardCard>
      <DashboardCard title="Contact fields">
        <p className="settings-card-note">Ellie includes the professional CRM fields below. Add only client-specific fields that the business will actually use.</p>
        <div className="crm-core-fields">{coreFields.map((field) => <span key={field}>{field}</span>)}</div>
        <label className="form-field"><span>Custom fields — one per line</span><textarea className="select-input" rows="7" placeholder={"Skool username\nInvestor type\nPreferred market"} value={(settings.customContactFields || []).join("\n")} onChange={(event) => setSettings({ ...settings, customContactFields: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
      </DashboardCard>
      <DashboardCard title="System of record">
        <p className="settings-card-note"><strong>Ellie CRM</strong> is currently the active contact database. If a client already uses HubSpot, Salesforce, or monday CRM, connect it from Integrations and choose which system owns contact changes.</p>
        <Button variant="outline" onClick={() => navigate("/integrations")}>Review CRM integrations</Button>
      </DashboardCard>
      <DashboardCard title="What happens after setup">
        <div className="settings-explainer-list"><p><strong>CRM:</strong> view, add, edit, import, qualify, and assign contacts.</p><p><strong>Campaigns:</strong> define an event, program, service, or offer and its audience.</p><p><strong>Outreach:</strong> review messages and send only after approval.</p></div>
      </DashboardCard>
    </section>
  </div>;
}
