import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import {
  beginEventbriteConnection,
  configureEventbriteWebhook,
  fetchEventbriteConnection,
  fetchEventbriteWebhookStatus,
  fetchEvents,
} from "../services/api.js";
import "./Integrations.css";

export default function EventbriteIntegration() {
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [webhook, setWebhook] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [setupNotice, setSetupNotice] = useState("");
  const [error, setError] = useState("");

  const loadStatus = async () => {
    try {
      setLoading(true);
      const [connectionData, webhookData, eventData] = await Promise.all([
        fetchEventbriteConnection().catch(() => null),
        fetchEventbriteWebhookStatus().catch(() => null),
        fetchEvents().catch(() => []),
      ]);
      setConnection(connectionData);
      setWebhook(webhookData);
      setEvents(Array.isArray(eventData) ? eventData : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to load Eventbrite setup.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(loadStatus, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const latestSync = events
    .map((event) => event.eventbriteLogistics?.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const webhookVerified = Boolean(webhook?.configured && webhook?.lastReceivedAt);
  const setupReady = Boolean(connection?.connected && webhookVerified && latestSync);
  const formatDateTime = (value) =>
    value ? new Date(value).toLocaleString() : "Not recorded yet";
  const webhookMessage = webhook?.lastMessage?.toLowerCase().includes("path you requested")
    ? "Test received. Eventbrite can reach Growth Operator automatically."
    : webhook?.lastMessage;

  const connectEventbrite = async () => {
    try {
      setConnecting(true);
      setError("");
      const result = await beginEventbriteConnection();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start Eventbrite authorization.");
      setConnecting(false);
    }
  };

  const autoConfigureWebhook = async () => {
    try {
      setConfiguringWebhook(true);
      setError("");
      setSetupNotice("");
      const result = await configureEventbriteWebhook();
      setSetupNotice(result.message || "Automatic updates are configured.");
      await loadStatus();
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error ||
        "Growth Operator could not configure the webhook automatically.";
      setSetupNotice(message);
    } finally {
      setConfiguringWebhook(false);
    }
  };

  const webhookUrl = "https://ellie-ai-backend.onrender.com/api/eventbrite/webhook?token=YOUR_BACKEND_WEBHOOK_TOKEN";

  return (
    <div className="page-dashboard integrations-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Integration setup</p>
          <h1 className="page-title">Eventbrite</h1>
          <p className="page-subtitle">Connect Eventbrite, verify automatic updates, and keep event reporting current.</p>
        </div>
        <div className="integration-card-actions">
          <Button variant="outline" onClick={() => navigate("/integrations")}>Back to integrations</Button>
          <Button variant="outline" onClick={loadStatus}>Refresh status</Button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p>Loading Eventbrite setup…</p> : null}

      <section className="eventbrite-setup-grid">
        <DashboardCard
          title="Setup checklist"
          action={<span className={`eventbrite-setup-badge ${setupReady ? "is-ready" : ""}`}>{setupReady ? "Ready" : "In progress"}</span>}
        >
          <p className="eventbrite-setup-intro">
            Clients should only need to connect their own Eventbrite account.
            Developer-only setup is shown separately so the next step is clear.
          </p>
          <div className="eventbrite-health-list">
            <div>
              <span className={`eventbrite-step-number ${connection?.connected ? "is-ready" : ""}`}>{connection?.connected ? "✓" : "1"}</span>
              <p><strong>Connect Eventbrite account</strong><small>{connection?.connected ? `${connection.accountEmail || "Authorized account"} is connected.` : connection?.configured ? "Client action: connect Eventbrite with OAuth." : "Developer action first: configure Growth Operator’s Eventbrite app credentials."}</small></p>
            </div>
            <div>
              <span className={`eventbrite-step-number ${webhookVerified ? "is-ready" : ""}`}>{webhookVerified ? "✓" : "2"}</span>
              <p><strong>Verify automatic updates</strong><small>{webhookVerified ? `Eventbrite last checked in ${formatDateTime(webhook.lastReceivedAt)}.` : webhook?.configured ? "Click Test in Eventbrite or wait for the first real event update." : "Developer action: configure Growth Operator’s webhook receiver token."}</small></p>
            </div>
            <div>
              <span className={`eventbrite-step-number ${latestSync ? "is-ready" : ""}`}>{latestSync ? "✓" : "3"}</span>
              <p><strong>Confirm reporting sync</strong><small>{latestSync ? `Growth Operator last refreshed event data ${formatDateTime(latestSync)}.` : "Open or import a connected Eventbrite event so Growth Operator can pull registrations, revenue, and check-ins."}</small></p>
            </div>
          </div>
          {webhookMessage ? <p className="eventbrite-health-note">{webhookMessage}</p> : null}
          {setupNotice ? <p className="eventbrite-client-note">{setupNotice}</p> : null}
          <div className="integration-card-actions">
            {connection?.configured ? (
              <div className="eventbrite-action-with-note">
                <Button loading={connecting} onClick={connectEventbrite}>
                  {connection?.connected ? "Refresh authorization" : "Connect Eventbrite"}
                </Button>
                {connection?.connected ? (
                  <small>Use this only if Eventbrite access stops working or you need to switch accounts.</small>
                ) : null}
              </div>
            ) : null}
            {connection?.connected ? (
              <div className="eventbrite-action-with-note">
                <Button
                  variant={webhookVerified ? "outline" : "primary"}
                  loading={configuringWebhook}
                  onClick={autoConfigureWebhook}
                >
                  {webhookVerified ? "Check automatic updates" : "Set up automatic updates"}
                </Button>
                <small>Growth Operator will try to create or verify the Eventbrite webhook for this account.</small>
              </div>
            ) : null}
            <Button variant="outline" onClick={() => navigate("/events")}>Open Events</Button>
          </div>
        </DashboardCard>

        <DashboardCard title="What this integration does">
          <div className="integration-role-list">
            <article><strong>Imports events</strong><p>Add existing Eventbrite listings to Growth Operator so campaigns can be planned around them.</p></article>
            <article><strong>Publishes drafts</strong><p>Create an Eventbrite draft from an Growth Operator event only after the user confirms it.</p></article>
            <article><strong>Refreshes reporting</strong><p>Orders, attendees, check-ins, ticket changes, and event edits update Growth Operator automatically after setup is verified.</p></article>
          </div>
        </DashboardCard>
      </section>

      <section className="eventbrite-admin-grid">
        <DashboardCard title="Client actions">
          <div className="integration-role-list">
            <article><strong>1. Click Connect Eventbrite</strong><p>The client signs into Eventbrite themselves. They do not send you their password.</p></article>
            <article><strong>2. Approve Growth Operator</strong><p>Eventbrite grants Growth Operator an access token for the approved account.</p></article>
            <article><strong>3. Choose events</strong><p>The client imports or creates events from the Events page. Growth Operator then keeps reporting current after automatic updates are verified.</p></article>
          </div>
        </DashboardCard>

        <DashboardCard title="Developer/admin actions">
          <div className="integration-role-list">
            <article><strong>Configure Growth Operator app credentials once</strong><p>Set Eventbrite client ID, client secret, redirect URI, and encryption key in the backend environment.</p></article>
            <article><strong>Set webhook receiver token once</strong><p>This lives in Growth Operator’s backend environment. Clients should never paste or manage this value.</p></article>
            <article><strong>Use automatic setup first</strong><p>Click Set up automatic updates. If Eventbrite blocks API webhook creation, guide the client by screen-share while they are logged in.</p></article>
          </div>
        </DashboardCard>
      </section>

      <DashboardCard title="Developer setup values">
        <div className="eventbrite-config-list">
          <div><span className={connection?.configured ? "is-ready" : ""}>{connection?.configured ? "✓" : "!"}</span><p><strong>OAuth app credentials</strong><small>{connection?.configured ? "Configured in Growth Operator’s backend environment." : "Set EVENTBRITE_CLIENT_ID, EVENTBRITE_CLIENT_SECRET, EVENTBRITE_REDIRECT_URI, and INTEGRATION_CREDENTIAL_ENCRYPTION_KEY."}</small></p></div>
          <div><span className={webhook?.configured ? "is-ready" : ""}>{webhook?.configured ? "✓" : "!"}</span><p><strong>Webhook receiver token</strong><small>{webhook?.configured ? "Configured in Growth Operator’s backend environment." : "Set EVENTBRITE_WEBHOOK_TOKEN in the backend environment."}</small></p></div>
          <div><span className="is-ready">i</span><p><strong>Webhook URL format</strong><small>{webhookUrl}</small></p></div>
        </div>
      </DashboardCard>
    </div>
  );
}
