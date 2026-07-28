import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Modal from "../components/Modal.jsx";
import {
  createCampaignFromEvent,
  createEvent,
  beginEventbriteConnection,
  fetchCampaigns,
  fetchEventbriteConnection,
  fetchEventbriteEvents,
  fetchEvents,
  importEventbriteEvent,
  syncEventbriteEvent,
} from "../services/api.js";
import "./Events.css";

const blankEvent = {
  name: "",
  startDate: "",
  ticketPrice: "",
  ticketGoal: "",
  description: "",
  audience: "",
};

function campaignEventId(campaign) {
  return String(campaign?.eventId?._id || campaign?.eventId || "");
}

export default function Events() {
  const navigate = useNavigate();
  const oauthResult = new URLSearchParams(window.location.search).get("eventbrite");
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [eventbriteEvents, setEventbriteEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(null);
  const [syncingEvent, setSyncingEvent] = useState(null);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState(
    oauthResult === "error" ? "Eventbrite did not connect. Please try authorizing it again." : "",
  );
  const [success, setSuccess] = useState(
    oauthResult === "connected"
      ? "Eventbrite connected securely. You can now synchronize live event logistics."
      : "",
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState(blankEvent);

  const campaignsByEvent = useMemo(
    () => new Map(
      campaigns
        .map((campaign) => [campaignEventId(campaign), campaign])
        .filter(([eventId]) => eventId),
    ),
    [campaigns],
  );

  const campaignReadyCount = events.filter(
    (event) => !campaignsByEvent.has(String(event._id)),
  ).length;

  const loadWorkspace = async () => {
    const [eventData, campaignData] = await Promise.all([
      fetchEvents(),
      fetchCampaigns(),
    ]);
    setEvents(Array.isArray(eventData) ? eventData : []);
    setCampaigns(Array.isArray(campaignData) ? campaignData : []);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("eventbrite")) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    Promise.all([fetchEvents(), fetchCampaigns(), fetchEventbriteConnection()])
      .then(([eventData, campaignData, connectionData]) => {
        setEvents(Array.isArray(eventData) ? eventData : []);
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        setConnection(connectionData);
      })
      .catch(() => setError("Unable to load events and campaigns."));
    fetchEventbriteEvents()
      .then((data) => setEventbriteEvents(Array.isArray(data) ? data : []))
      .catch(() => setError(
        "Eventbrite events are unavailable until that connection is authorized. You can still create an event manually.",
      ));
  }, []);

  const connectEventbrite = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await beginEventbriteConnection();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start the Eventbrite connection.");
      setLoading(false);
    }
  };

  const synchronizeEvent = async (eventId) => {
    try {
      setSyncingEvent(eventId);
      setError("");
      const result = await syncEventbriteEvent(eventId);
      setEvents((current) => current.map(
        (event) => event._id === eventId ? result.event : event,
      ));
      setSuccess("Live Eventbrite logistics synchronized.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to synchronize this event.");
    } finally {
      setSyncingEvent(null);
    }
  };

  const importEvent = async () => {
    if (!selectedEventId) {
      setError("Select an Eventbrite event first.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await importEventbriteEvent(selectedEventId);
      setSelectedEventId("");
      setSuccess("Event imported successfully.");
      await loadWorkspace();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to import Eventbrite event.");
    } finally {
      setLoading(false);
    }
  };

  const createManual = async () => {
    if (!draft.name || !draft.startDate || !draft.ticketPrice || !draft.ticketGoal) {
      setError("Name, date, ticket price, and ticket goal are required.");
      return;
    }
    try {
      setLoading(true);
      await createEvent({
        ...draft,
        startDate: new Date(draft.startDate),
        ticketPrice: Number(draft.ticketPrice),
        ticketGoal: Number(draft.ticketGoal),
        audience: draft.audience.split(",").map((item) => item.trim()).filter(Boolean),
        status: "active",
      });
      setManualOpen(false);
      setDraft(blankEvent);
      setSuccess("Event created successfully.");
      await loadWorkspace();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create event.");
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async (eventId) => {
    try {
      setCreatingCampaign(eventId);
      const response = await createCampaignFromEvent(eventId);
      navigate(`/campaigns/${response.campaign._id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create campaign.");
    } finally {
      setCreatingCampaign(null);
    }
  };

  return (
    <div className="page-dashboard events-page">
      <header className="events-hero">
        <div>
          <p className="events-eyebrow">Event operations</p>
          <h1 className="page-title">Events</h1>
          <p>Bring in existing Eventbrite events or create an event in Ellie before turning it into a campaign.</p>
        </div>
        <Button onClick={() => setManualOpen(true)}>+ New Event</Button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="discovery-notice">{success}</p> : null}

      <section className="events-import">
        <DashboardCard title="Import from Eventbrite">
          <div className="eventbrite-connection">
            <span className={`connection-dot connection-dot--${connection?.connected ? "on" : "off"}`} />
            <div>
              <strong>
                {connection?.connected
                  ? "Eventbrite connected"
                  : connection?.status === "legacy_token"
                    ? "Private token active"
                    : "Eventbrite not connected"}
              </strong>
              <p>
                {connection?.connected
                  ? connection.accountEmail || "Secure OAuth authorization is active."
                  : connection?.configured
                    ? "Authorize Ellie to synchronize event operations securely."
                    : "Add the Eventbrite OAuth values to the backend to enable authorization."}
              </p>
            </div>
            {!connection?.connected && connection?.configured ? (
              <Button loading={loading} onClick={connectEventbrite}>Connect Eventbrite</Button>
            ) : null}
          </div>
          <p className="events-card-copy">
            Import an Eventbrite listing once, then synchronize ticket, order, attendee, and check-in data here.
          </p>
          <div className="events-import__controls">
            <select
              className="select-input"
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
            >
              <option value="">Select an Eventbrite event</option>
              {eventbriteEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name?.text || "Untitled Event"}
                </option>
              ))}
            </select>
            <Button loading={loading} onClick={importEvent}>Import Event</Button>
          </div>
        </DashboardCard>

        <DashboardCard title="Events ready for a campaign">
          <strong className="events-count">{campaignReadyCount}</strong>
          <p className="events-card-copy">
            {campaignReadyCount
              ? "These events do not have a marketing campaign yet."
              : "Every event is already connected to a campaign."}
          </p>
        </DashboardCard>
      </section>

      <DashboardCard title="Your Events">
        {events.length ? (
          <div className="events-list">
            {events.map((event) => {
              const linkedCampaign = campaignsByEvent.get(String(event._id));
              const logistics = event.eventbriteLogistics || {};
              const isEventbrite = Boolean(event.integrations?.eventbrite?.eventId);
              return (
                <article className="event-row" key={event._id}>
                  <div className="event-row__content">
                    <p className="event-row__date">
                      {event.startDate
                        ? new Date(event.startDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "Date pending"}
                    </p>
                    <h3>{event.name}</h3>
                    <p>{event.location || event.onlineUrl || "Location to be confirmed"}</p>
                    <div className="event-row__tags">
                      <span>
                        {Number(event.ticketPrice || 0).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </span>
                      <span>{event.ticketGoal || 0} goal</span>
                      <span>{event.audience?.join(", ") || "Audience pending"}</span>
                    </div>
                    {isEventbrite ? (
                      <div className="event-logistics">
                        <div>
                          <span>Tickets sold</span>
                          <strong>{logistics.ticketsSold ?? event.ticketsSold ?? 0}</strong>
                        </div>
                        <div>
                          <span>Orders</span>
                          <strong>{logistics.orderCount ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Attendees</span>
                          <strong>{logistics.attendeeCount ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Checked in</span>
                          <strong>{logistics.checkedInCount ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Gross sales</span>
                          <strong>
                            {Number(logistics.grossRevenue || 0).toLocaleString("en-US", {
                              style: "currency",
                              currency: logistics.currency || "USD",
                            })}
                          </strong>
                        </div>
                      </div>
                    ) : null}
                    {logistics.lastSyncedAt ? (
                      <p className="event-sync-time">
                        Last synced {new Date(logistics.lastSyncedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="event-row__actions">
                    {isEventbrite ? (
                      <Button
                        variant="outline"
                        loading={syncingEvent === event._id}
                        onClick={() => synchronizeEvent(event._id)}
                      >
                        Sync Eventbrite
                      </Button>
                    ) : null}
                    {linkedCampaign ? (
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/campaigns/${linkedCampaign._id}`)}
                      >
                        View Campaign
                      </Button>
                    ) : (
                      <Button
                        loading={creatingCampaign === event._id}
                        onClick={() => createCampaign(event._id)}
                      >
                        Create Campaign
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="table-state table-state--empty">
            Create your first event or import one from Eventbrite.
          </div>
        )}
      </DashboardCard>

      <Modal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Create an event"
        footer={(
          <>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={createManual}>Create Event</Button>
          </>
        )}
      >
        <div className="campaign-form-grid">
          {[
            ["name", "Event name"],
            ["startDate", "Start date"],
            ["ticketPrice", "Ticket price"],
            ["ticketGoal", "Ticket goal"],
            ["audience", "Audience (comma-separated)"],
          ].map(([field, label]) => (
            <label className="form-field" key={field}>
              <span>{label}</span>
              <input
                className="select-input"
                type={field === "startDate"
                  ? "date"
                  : field === "ticketPrice" || field === "ticketGoal"
                    ? "number"
                    : "text"}
                value={draft[field]}
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
              />
            </label>
          ))}
          <label className="form-field span-2">
            <span>Description</span>
            <textarea
              className="select-input"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
