import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/Button.jsx";
import {
  fetchEventbriteConnection,
  fetchEventbriteWebhookStatus,
  fetchEvents,
  fetchIntegrationHub,
  fetchGmailConnection,
  beginGmailConnection,
  disconnectGmail,
} from "../services/api.js";
import "./Integrations.css";

const statusLabels = {
  ready: "Ready to use",
  connected: "Connected",
  disconnected: "Disconnected",
  configuration_required: "Setup required",
  planned: "OAuth planned",
  public_only: "Public access only",
};

const externalCrms = [
  { name: "HubSpot", detail: "Contact, company, and deal synchronization for teams already using HubSpot." },
  { name: "Salesforce", detail: "Lead, contact, account, and opportunity synchronization for enterprise sales teams." },
  { name: "monday CRM", detail: "Board and contact synchronization for teams managing pipelines in monday." },
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
  if (provider.id === "linkedin" || provider.id === "facebook") {
    return `${provider.description}. This is for each customer’s own authorized business assets—not for searching private people or exporting group members.`;
  }
  if (provider.id === "meetup") {
    return "Public Meetup community discovery works without a key. Authenticated Meetup Pro management is not implemented and is not required for current research.";
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
  const [gmail, setGmail] = useState(null);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const [response, connection, webhook, eventData, gmailConnection] = await Promise.all([
        fetchIntegrationHub(),
        fetchEventbriteConnection().catch(() => null),
        fetchEventbriteWebhookStatus().catch(() => null),
        fetchEvents().catch(() => []),
        fetchGmailConnection().catch(() => null),
      ]);
      setProviders(response.data?.providers || []);
      setEventbriteConnection(connection);
      setEventbriteWebhook(webhook);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setGmail(gmailConnection);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load integrations");
    } finally {
      setLoading(false);
    }
  };

  const connectGmail = async () => {
    try {
      const response = await beginGmailConnection();
      window.location.assign(response.authorizationUrl);
    } catch (err) {
      setError(err.response?.data?.error || "Google app credentials must be configured before Gmail can connect.");
    }
  };

  const removeGmail = async () => {
    await disconnectGmail();
    await loadProviders();
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(loadProviders, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

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
          <p className="page-subtitle">Set up the accounts Growth Operator uses for events, contacts, discovery, marketing, and outreach.</p>
        </div>
        <Button variant="outline" onClick={loadProviders}>Refresh status</Button>
      </div>

      <h2 className="integration-section-title">CRM and contact sources</h2>
      <section className="crm-connection-grid">
        <article className="crm-connection-card">
          <div><span className="integration-status integration-status--connected">Active</span><h2>Growth Operator CRM</h2></div>
          <p>Your built-in CRM for contacts, audience profiles, campaign assignments, outreach history, and CSV imports. No external CRM account is required.</p>
          <div className="crm-connection-actions">
            <Button onClick={() => navigate("/contacts")}>Open CRM</Button>
          </div>
        </article>
        {externalCrms.map((crm) => (
          <article className="crm-connection-card" key={crm.name}>
            <div><span className="integration-status">Planned</span><h2>{crm.name}</h2></div>
            <p>{crm.detail}</p>
            <button className="integration-disabled-action" disabled>Coming soon</button>
          </article>
        ))}
      </section>

      <h2 className="integration-section-title">Email and inbox</h2>
      <section className="crm-connection-grid">
        <article className="crm-connection-card">
          <div><span className={`integration-status integration-status--${gmail?.connected ? "connected" : "configuration_required"}`}>{gmail?.connected ? "Connected" : gmail?.configured ? "Ready to connect" : "App setup required"}</span><h2>Gmail</h2></div>
          <p>{gmail?.connected ? `${gmail.email} is authorized for inbox visibility and approved sending.` : "Connect a client’s Google account so Growth Operator can read relevant threads, prepare replies, and send only after user approval."}</p>
          <div className="crm-connection-actions">
            {gmail?.connected ? <><Button onClick={() => navigate("/inbox")}>Open inbox</Button><Button variant="outline" onClick={removeGmail}>Disconnect Gmail</Button></> : <><Button onClick={connectGmail} disabled={!gmail?.configured}>Connect Gmail</Button><Button variant="outline" onClick={() => navigate("/integrations/gmail")}>Setup details</Button></>}
          </div>
          {!gmail?.configured ? <small>Add the Google OAuth client ID, secret, redirect URI, and credential encryption key to the backend environment first.</small> : null}
        </article>
        <article className="crm-connection-card">
          <div><span className="integration-status integration-status--connected">Connected</span><h2>Resend</h2></div>
          <p>Resend remains the campaign delivery provider. Gmail is for the connected inbox and personal replies; the two integrations have separate jobs.</p>
        </article>
      </section>

      <h2 className="integration-section-title">Connected apps</h2>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading integrations…</p> : (
        <section className="integration-provider-grid">
          {providers.filter((provider) => provider.id !== "resend").map((provider) => {
            const isEventbrite = provider.id === "eventbrite";
            const status = isEventbrite && eventbriteReady ? "connected" : provider.status;
            return (
              <article className="crm-connection-card integration-provider-card" key={provider.id}>
                <div><span className={`integration-status integration-status--${status}`}>{statusLabels[status] || status}</span><h2>{provider.name}</h2></div>
                <p>{providerSummary(provider, eventbriteReady)}</p>
                <p className="integration-capabilities">{provider.capabilities?.join(" · ") || "No capabilities reported"}</p>
                {provider.limitation ? <p className="integration-limitation"><strong>Important:</strong> {provider.limitation}</p> : null}
                <div className="crm-connection-actions">
                  {isEventbrite ? (
                    <Button onClick={() => navigate("/integrations/eventbrite")}>{eventbriteReady ? "Manage setup" : "Set up Eventbrite"}</Button>
                  ) : provider.id === "csv" ? (
                    <Button variant="outline" onClick={() => navigate("/contacts")}>Import contacts</Button>
                  ) : provider.status === "public_only" ? (
                    <Button variant="outline" onClick={() => navigate("/discovery?tab=monitoring")}>Open public discovery</Button>
                  ) : provider.status === "planned" ? (
                    <button className="integration-disabled-action" disabled>Customer OAuth coming later</button>
                  ) : (
                    <Button variant="outline" disabled>Details coming soon</Button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
