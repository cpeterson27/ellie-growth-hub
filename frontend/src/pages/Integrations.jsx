import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import {
  fetchEventbriteConnection,
  fetchEventbriteWebhookStatus,
  fetchEvents,
  fetchIntegrationHub,
} from "../services/api.js";
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

function providerSummary(provider, eventbriteReady) {
  if (provider.id === "eventbrite") {
    return eventbriteReady
      ? "Connected for event publishing, registrations, check-ins, and reporting."
      : "Connect Eventbrite and verify automatic event updates.";
  }
  if (provider.id === "csv") {
    return "Import contact spreadsheets from Contacts → Import.";
  }
  if (provider.id === "apollo") {
    return "Organization discovery is available; People Search depends on the connected Apollo plan.";
  }
  return provider.description;
}

export default function Integrations() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [eventbriteConnection, setEventbriteConnection] = useState(null);
  const [eventbriteWebhook, setEventbriteWebhook] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProviders = async () => {
    try {
      setLoading(true);
      const [response, connection, webhook, eventData] = await Promise.all([
        fetchIntegrationHub(),
        fetchEventbriteConnection().catch(() => null),
        fetchEventbriteWebhookStatus().catch(() => null),
        fetchEvents().catch(() => []),
      ]);
      setProviders(response.data?.providers || []);
      setEventbriteConnection(connection);
      setEventbriteWebhook(webhook);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  const latestEventbriteSync = events
    .map((event) => event.eventbriteLogistics?.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const eventbriteReady = Boolean(
    eventbriteConnection?.connected &&
      eventbriteWebhook?.configured &&
      eventbriteWebhook?.lastReceivedAt &&
      latestEventbriteSync,
  );

  return (
    <div className="page-dashboard integrations-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Data & connections</p>
          <h1 className="page-title">Integrations</h1>
          <p className="page-subtitle">Connect the tools Ellie uses for events, contacts, discovery, and outreach.</p>
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
            <div><span className="integration-status">Planned</span><h2>{crm.name}</h2></div>
            <p>{crm.detail} will appear here when its connector is available.</p>
            <button className="integration-disabled-action" disabled>Coming soon</button>
          </article>
        ))}
      </section>

      <h2 className="integration-section-title">Business integrations</h2>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading integrations…</p> : (
        <section className="integration-provider-grid">
          {providers.map((provider) => {
            const isEventbrite = provider.id === "eventbrite";
            const status = isEventbrite && eventbriteReady ? "connected" : provider.status;
            return (
              <DashboardCard key={provider.id} title={provider.name}>
                <span className={`integration-status integration-status--${status}`}>{statusLabels[status] || status}</span>
                <p>{providerSummary(provider, eventbriteReady)}</p>
                <p className="integration-capabilities">{provider.capabilities?.join(" · ") || "No capabilities reported"}</p>
                <div className="integration-card-actions">
                  {isEventbrite ? (
                    <Button onClick={() => navigate("/integrations/eventbrite")}>{eventbriteReady ? "Manage setup" : "Set up Eventbrite"}</Button>
                  ) : provider.id === "csv" ? (
                    <Button variant="outline" onClick={() => navigate("/contacts")}>Import contacts</Button>
                  ) : (
                    <Button variant="outline" disabled>Details coming soon</Button>
                  )}
                </div>
              </DashboardCard>
            );
          })}
        </section>
      )}
    </div>
  );
}
