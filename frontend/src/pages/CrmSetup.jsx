import { useState } from "react";
import { FiCheck, FiPlus, FiTrash2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import { getWorkspaceSettings, saveWorkspaceSettings } from "../utils/workspaceSettings.js";
import "./Settings.css";

const fieldGroups = [
  { title: "Identity", fields: ["First name", "Last name", "Email", "Phone", "LinkedIn URL"] },
  { title: "Professional", fields: ["Job title", "Company", "Industry", "City", "State", "Country", "Company website", "Company size"] },
  { title: "Relationship", fields: ["Contact type", "Audience / interests", "Tags", "Lists", "Source", "Notes"] },
  { title: "Lead Porch activity", fields: ["Email status", "Research status", "Campaign assignments", "Last contacted", "Outreach history"] },
];

export default function CrmSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(getWorkspaceSettings);
  const [newField, setNewField] = useState("");
  const [saved, setSaved] = useState(false);
  const fields = settings.customContactFields || [];

  const save = () => { saveWorkspaceSettings(settings); setSaved(true); };
  const addField = () => {
    const label = newField.trim();
    if (!label || fields.some((field) => field.toLowerCase() === label.toLowerCase())) return;
    setSettings({ ...settings, customContactFields: [...fields, label] });
    setNewField("");
    setSaved(false);
  };
  const removeField = (label) => {
    setSettings({ ...settings, customContactFields: fields.filter((field) => field !== label) });
    setSaved(false);
  };

  return <div className="page-dashboard crm-config-page">
    <div className="page-header">
      <div><p className="page-eyebrow">CRM · Contact setup</p><h1 className="page-title">Contact fields</h1><p className="page-subtitle">Review what Lead Porch already stores and add business-specific information only when your team needs it.</p></div>
      <div className="crm-header-actions"><Button variant="outline" onClick={() => navigate("/contacts")}>Open contacts</Button><Button onClick={save}>Save field setup</Button></div>
    </div>
    {saved ? <p className="discovery-notice"><FiCheck /> Contact field setup saved.</p> : null}

    <section className="crm-config-intro">
      <div><span>How CRM status works</span><h2>Lead Porch manages the operational workflow automatically.</h2></div>
      <p>Contacts move between <strong>Needs attention</strong>, <strong>Ready to assign</strong>, and <strong>Campaign assigned</strong> based on verified email, audience information, and real campaign assignments. There is no separate pipeline list to maintain.</p>
    </section>

    <section className="crm-field-layout">
      <div className="crm-built-in-fields">
        <header><p className="page-eyebrow">Included with Lead Porch</p><h2>Built-in contact record</h2><p>These fields already exist in the database and appear when information is available. They cannot be removed because imports, matching, outreach, and reporting depend on them.</p></header>
        <div className="crm-field-groups">{fieldGroups.map((group) => <section key={group.title}><h3>{group.title}</h3>{group.fields.map((field) => <div key={field}><FiCheck /><span>{field}</span></div>)}</section>)}</div>
      </div>
      <aside className="crm-custom-fields">
        <p className="page-eyebrow">Optional</p><h2>Custom fields</h2><p>Add a field only when this business needs information Lead Porch does not already store—for example “Preferred market” or “Membership level.”</p>
        <div className="crm-add-field"><label htmlFor="new-contact-field">Field name</label><div><input id="new-contact-field" value={newField} onChange={(event) => setNewField(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} placeholder="e.g. Preferred market" /><Button size="sm" onClick={addField} disabled={!newField.trim()}><FiPlus /> Add field</Button></div></div>
        {fields.length ? <div className="crm-custom-field-list">{fields.map((field) => <div key={field}><span><strong>{field}</strong><small>Text field · shown when editing a contact</small></span><button type="button" onClick={() => removeField(field)} aria-label={`Remove ${field}`}><FiTrash2 /></button></div>)}</div> : <div className="crm-no-custom-fields"><strong>No custom fields</strong><p>This workspace currently uses Lead Porch’s built-in contact record only.</p></div>}
        <small className="crm-field-note">Removing a field stops showing it on contact forms. Existing values are retained so information cannot be erased accidentally.</small>
      </aside>
    </section>
  </div>;
}
