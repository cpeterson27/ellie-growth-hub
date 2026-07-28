import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { fetchIntegrationHub } from "../services/api.js";
import "./Integrations.css";

const statusLabels = {
  ready: "Ready to use",
  connected: "Connected",
  disconnected: "Disconnected",
  configuration_required: "Setup required",
};

const externalCrms = [
  { name: "HubSpot", detail: "OAuth contact, company, and deal synchronization" },
  { name: "Salesforce", detail: "OAuth leads, contacts, accounts, and opportunities" },
  { name: "monday CRM", detail: "Board and contact synchronization" },
];

export default function Integrations() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await fetchIntegrationHub();
      setProviders(response.data?.providers || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  return (
    <div className="page-dashboard integrations-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Data & connections</p>
          <h1 className="page-title">Integrations</h1>
          <p className="page-subtitle">Choose Ellie’s built-in CRM or connect another system when its secure connector is installed.</p>
        </div>
        <Button variant="outline" onClick={loadProviders}>Refresh status</Button>
      </div>

      <section className="crm-connection-grid">
        <article className="crm-connection-card crm-connection-card--active">
          <div><span className="integration-status integration-status--connected">Active</span><h2>Ellie CRM</h2></div>
          <p>Built-in contacts, audience profiles, campaigns, outreach history, and CSV imports. No external account is required.</p>
          <div className="crm-connection-actions">
            <Button onClick={() => navigate("/contacts")}>Open CRM</Button>
            <Button variant="outline" onClick={() => navigate("/settings")}>Customize CRM</Button>
          </div>
        </article>
        {externalCrms.map((crm) => (
          <article className="crm-connection-card" key={crm.name}>
            <div><span className="integration-status">Connector not installed</span><h2>{crm.name}</h2></div>
            <p>{crm.detail} requires a dedicated OAuth connector and field-mapping screen before it can safely be enabled.</p>
            <button className="integration-disabled-action" disabled>Not available yet</button>
          </article>
        ))}
      </section>

      <div className="integration-explainer">
        <strong>No misleading connection buttons.</strong>
        <span>CSV import works today. HubSpot, Salesforce, and monday CRM will show “Connect” only after their real OAuth and synchronization services are built.</span>
      </div>

      <h2 className="integration-section-title">Business integrations</h2>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading integrations…</p> : (
        <section className="integration-provider-grid">
          {providers.map((provider) => (
            <DashboardCard key={provider.id} title={provider.name}>
              <span className={`integration-status integration-status--${provider.status}`}>{statusLabels[provider.status] || provider.status}</span>
              <p>{provider.description}</p>
              <p className="integration-capabilities">{provider.capabilities?.join(" · ") || "No capabilities reported"}</p>
              {provider.id === "csv" ? <p>Import standard CSV exports from Contacts → Import.</p> : null}
              {provider.id === "apollo" ? <p>People Search requires a paid Apollo API plan. CSV imports remain available.</p> : null}
            </DashboardCard>
          ))}
        </section>
      )}
    </div>
  );
}
