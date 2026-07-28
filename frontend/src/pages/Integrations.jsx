import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import {
  beginEventbriteConnection,
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

export default function Integrations() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [eventbriteConnection, setEventbriteConnection] = useState(null);
  const [eventbriteWebhook, setEventbriteWebhook] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectingEventbrite, setConnectingEventbrite] = useState(false);
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

  const eventbriteProvider = providers.find((provider) => provider.id === "eventbrite");
  const connectedEvents = events.filter((event) => event.integrations?.eventbrite?.eventId);
  const latestEventbriteSync = connectedEvents
    .map((event) => event.eventbriteLogistics?.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const webhookVerified = Boolean(eventbriteWebhook?.configured && eventbriteWebhook?.lastReceivedAt);
  const setupReady = Boolean(eventbriteConnection?.connected && webhookVerified && latestEventbriteSync);
  const formatDateTime = (value) =>
    value ? new Date(value).toLocaleString() : "Not recorded yet";
  const webhookMessage = eventbriteWebhook?.lastMessage?.toLowerCase().includes("path you requested")
    ? "Test received. Eventbrite can reach Ellie automatically."
    : eventbriteWebhook?.lastMessage;

  const connectEventbrite = async () => {
    try {
      setConnectingEventbrite(true);
      setError("");
      const result = await beginEventbriteConnection();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start Eventbrite authorization.");
      setConnectingEventbrite(false);
    }
  };

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

      <section className="eventbrite-setup-grid">
        <DashboardCard
          title="Eventbrite setup"
          action={<span className={`eventbrite-setup-badge ${setupReady ? "is-ready" : ""}`}>{setupReady ? "Ready" : "In progress"}</span>}
        >
          <p className="eventbrite-setup-intro">
            This is where Eventbrite should be configured and checked. The
            Events page stays focused on creating, publishing, and measuring
            events.
          </p>
          <div className="eventbrite-health-list">
            <div>
              <span className={`eventbrite-step-number ${eventbriteConnection?.connected ? "is-ready" : ""}`}>{eventbriteConnection?.connected ? "✓" : "1"}</span>
              <p><strong>Client connects Eventbrite</strong><small>{eventbriteConnection?.connected ? `${eventbriteConnection.accountEmail || "Authorized account"} is connected. The client does not need to share their password.` : "The client clicks Connect Eventbrite and signs into Eventbrite themselves."}</small></p>
            </div>
            <div>
              <span className={`eventbrite-step-number ${webhookVerified ? "is-ready" : ""}`}>{webhookVerified ? "✓" : "2"}</span>
              <p><strong>Automatic updates are verified</strong><small>{webhookVerified ? `Eventbrite last checked in ${formatDateTime(eventbriteWebhook.lastReceivedAt)}.` : eventbriteWebhook?.configured ? "Waiting for the first Eventbrite test or real event update." : "Developer/admin setup needed once: configure Ellie’s backend webhook receiver."}</small></p>
            </div>
            <div>
              <span className={`eventbrite-step-number ${latestEventbriteSync ? "is-ready" : ""}`}>{latestEventbriteSync ? "✓" : "3"}</span>
              <p><strong>Event reporting is syncing</strong><small>{latestEventbriteSync ? `Ellie last refreshed event data ${formatDateTime(latestEventbriteSync)}.` : "Add or open a connected Eventbrite event so Ellie can pull registrations, revenue, and check-ins."}</small></p>
            </div>
          </div>
          {webhookMessage ? <p className="eventbrite-health-note">{webhookMessage}</p> : null}
          <div className="integration-card-actions">
            {!eventbriteConnection?.connected && eventbriteConnection?.configured ? <Button loading={connectingEventbrite} onClick={connectEventbrite}>Connect Eventbrite</Button> : null}
            <Button variant="outline" onClick={() => navigate("/events")}>Open Events</Button>
            <Button variant="outline" onClick={loadProviders}>Refresh setup status</Button>
          </div>
        </DashboardCard>
        <DashboardCard title="Who does what?">
          <div className="integration-role-list">
            <article>
              <strong>Client</strong>
              <p>Clicks Connect Eventbrite, logs into their own Eventbrite account, and approves Ellie. They never send you their password.</p>
            </article>
            <article>
              <strong>Developer / admin</strong>
              <p>Configures Ellie’s Eventbrite app credentials, backend webhook token, Render environment, and one webhook endpoint.</p>
            </article>
            <article>
              <strong>Ellie</strong>
              <p>Imports events, refreshes orders and attendees, tracks check-ins, and shows whether setup is ready.</p>
            </article>
          </div>
          <p className="eventbrite-client-note">
            Best professional setup: OAuth for every client account, admin-only
            webhook configuration, and no manual sharing of API keys or private
            Eventbrite login credentials.
          </p>
        </DashboardCard>
      </section>

      <section className="eventbrite-admin-grid">
        <DashboardCard title="API keys and webhooks">
          <div className="integration-role-list">
            <article>
              <strong>Ellie app keys</strong>
              <p>You configure one Eventbrite app for Ellie with its own client ID, client secret, and redirect URL. Those values live in the backend environment, not in the client’s browser.</p>
            </article>
            <article>
              <strong>Client authorization</strong>
              <p>Each client authorizes Ellie with OAuth. Ellie stores that client’s access token securely and uses it to read and manage only the Eventbrite account they approved.</p>
            </article>
            <article>
              <strong>Webhook setup</strong>
              <p>Ellie receives Eventbrite updates at the backend webhook receiver. If Eventbrite requires manual webhook creation for a client account, do it by screen-share with the client logged in—not by collecting their password or private token.</p>
            </article>
          </div>
        </DashboardCard>
        <DashboardCard title="Setup status">
          <div className="eventbrite-config-list">
            <div><span className={eventbriteConnection?.configured ? "is-ready" : ""}>{eventbriteConnection?.configured ? "✓" : "!"}</span><p><strong>OAuth app credentials</strong><small>{eventbriteConnection?.configured ? "Configured in Ellie’s backend environment." : "Missing Eventbrite client ID, client secret, redirect URI, or encryption key."}</small></p></div>
            <div><span className={eventbriteWebhook?.configured ? "is-ready" : ""}>{eventbriteWebhook?.configured ? "✓" : "!"}</span><p><strong>Webhook receiver token</strong><small>{eventbriteWebhook?.configured ? "Configured in Ellie’s backend environment." : "Missing EVENTBRITE_WEBHOOK_TOKEN in the backend environment."}</small></p></div>
            <div><span className={eventbriteConnection?.connected ? "is-ready" : ""}>{eventbriteConnection?.connected ? "✓" : "!"}</span><p><strong>Connected client account</strong><small>{eventbriteConnection?.connected ? "At least one Eventbrite account has authorized Ellie." : "No Eventbrite account is connected yet."}</small></p></div>
          </div>
        </DashboardCard>
      </section>

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
              {provider.id === "eventbrite" ? <p>{eventbriteProvider?.status === "connected" || eventbriteConnection?.connected ? "Eventbrite account access is connected. Review setup status above for automatic update health." : "Use the Eventbrite setup panel above before managing live event reporting."}</p> : null}
              {provider.id === "apollo" ? <p>People Search requires a paid Apollo API plan. CSV imports remain available.</p> : null}
            </DashboardCard>
          ))}
        </section>
      )}
    </div>
  );
}
