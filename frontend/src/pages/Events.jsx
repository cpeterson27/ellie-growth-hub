import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import EventbriteListingDetails from "../components/EventbriteListingDetails.jsx";
import Modal from "../components/Modal.jsx";
import {
  beginEventbriteConnection,
  createCampaignFromEvent,
  createEvent,
  createManagedEventbriteEvent,
  fetchCampaigns,
  fetchEventbriteConnection,
  fetchEventbriteEvents,
  fetchEvents,
  importEventbriteEvent,
  publishManagedEventbriteEvent,
  syncEventbriteEvent,
  updateManagedEventbriteEvent,
} from "../services/api.js";
import "./Events.css";

const emptyDraft = {
  name: "",
  summary: "",
  description: "",
  startDate: "",
  endDate: "",
  timeZone: "America/Los_Angeles",
  locationType: "online",
  location: "",
  ticketName: "General Admission",
  ticketPrice: "497",
  ticketGoal: "50",
  audience: "",
  audienceConfirmed: false,
  publishNow: false,
};

function campaignEventId(campaign) {
  return String(campaign?.eventId?._id || campaign?.eventId || "");
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function draftFromEvent(event) {
  return {
    ...emptyDraft,
    name: event.name || "",
    summary: event.summary || "",
    description: event.description || "",
    startDate: localDateTime(event.startDate),
    endDate: localDateTime(event.endDate),
    timeZone: event.timeZone || "America/Los_Angeles",
    locationType: event.locationType || "online",
    location: event.locationType === "online" ? "" : event.location || "",
    ticketPrice: String(event.ticketPrice ?? ""),
    ticketGoal: String(event.ticketGoal ?? ""),
    audience: (event.audience || []).join(", "),
    audienceConfirmed: Boolean(event.audienceConfirmedAt),
  };
}

function changedFields(original, draft) {
  const fields = [
    ["Event name", original.name || "", draft.name, "Eventbrite listing"],
    [
      "Short summary",
      original.summary || "",
      draft.summary,
      "Eventbrite listing",
    ],
    [
      "Starts",
      localDateTime(original.startDate),
      draft.startDate,
      "Eventbrite listing",
    ],
    [
      "Ends",
      localDateTime(original.endDate),
      draft.endDate,
      "Eventbrite listing",
    ],
    [
      "Format",
      original.locationType || "online",
      draft.locationType,
      "Eventbrite listing",
    ],
    [
      "Time zone",
      original.timeZone || "America/Los_Angeles",
      draft.timeZone,
      "Eventbrite listing",
    ],
    [
      "Capacity",
      String(original.ticketGoal ?? ""),
      String(draft.ticketGoal ?? ""),
      "Eventbrite listing",
    ],
    [
      "Campaign audience",
      (original.audience || []).join(", "),
      draft.audience,
      "Ellie AI only",
    ],
    [
      "Audience approval",
      original.audienceConfirmedAt ? "Confirmed" : "Not confirmed",
      draft.audienceConfirmed ? "Confirmed" : "Not confirmed",
      "Ellie AI only",
    ],
  ];
  return fields
    .filter(([, before, after]) => String(before || "") !== String(after || ""))
    .map(([label, before, after, destination]) => ({
      label,
      before: String(before || "Not set"),
      after: String(after || "Not set"),
      destination,
    }));
}

export default function Events() {
  const navigate = useNavigate();
  const oauthResult = new URLSearchParams(window.location.search).get(
    "eventbrite",
  );
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [eventbriteEvents, setEventbriteEvents] = useState([]);
  const [connection, setConnection] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [manageTab, setManageTab] = useState("listing");
  const [changePreview, setChangePreview] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState(
    oauthResult === "error"
      ? "Eventbrite did not connect. Please authorize it again."
      : "",
  );
  const [success, setSuccess] = useState(
    oauthResult === "connected"
      ? "Eventbrite is connected and ready to manage events."
      : "",
  );

  const campaignsByEvent = useMemo(
    () =>
      new Map(
        campaigns
          .map((campaign) => [campaignEventId(campaign), campaign])
          .filter(([eventId]) => eventId),
      ),
    [campaigns],
  );

  const importedEventbriteIds = useMemo(
    () =>
      new Set(
        events
          .map((event) => event.integrations?.eventbrite?.eventId)
          .filter(Boolean),
      ),
    [events],
  );

  const availableImports = eventbriteEvents.filter(
    (event) => !importedEventbriteIds.has(String(event.id)),
  );
  const upcomingEvents = events.filter(
    (event) => !event.endDate || new Date(event.endDate) >= new Date(),
  );
  const totalRegistrations = events.reduce(
    (total, event) =>
      total + Number(event.eventbriteLogistics?.attendeeCount || 0),
    0,
  );
  const grossSales = events.reduce(
    (total, event) =>
      total + Number(event.eventbriteLogistics?.grossRevenue || 0),
    0,
  );

  const loadWorkspace = async () => {
    const [eventData, campaignData, connectionData, externalData] =
      await Promise.all([
        fetchEvents(),
        fetchCampaigns(),
        fetchEventbriteConnection(),
        fetchEventbriteEvents().catch(() => []),
      ]);
    setEvents(Array.isArray(eventData) ? eventData : []);
    setCampaigns(Array.isArray(campaignData) ? campaignData : []);
    setConnection(connectionData);
    setEventbriteEvents(Array.isArray(externalData) ? externalData : []);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("eventbrite")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    Promise.all([
      fetchEvents(),
      fetchCampaigns(),
      fetchEventbriteConnection(),
      fetchEventbriteEvents().catch(() => []),
    ])
      .then(([eventData, campaignData, connectionData, externalData]) => {
        const loadedEvents = Array.isArray(eventData) ? eventData : [];
        setEvents(loadedEvents);
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        setConnection(connectionData);
        setEventbriteEvents(Array.isArray(externalData) ? externalData : []);
        const refreshCutoff = Date.now() - 15 * 60 * 1000;
        const staleConnectedEvents = loadedEvents.filter(
          (event) =>
            event.integrations?.eventbrite?.eventId &&
            (!event.endDate || new Date(event.endDate) >= new Date()) &&
            (!event.eventbriteLogistics?.lastSyncedAt ||
              new Date(event.eventbriteLogistics.lastSyncedAt).getTime() <
                refreshCutoff),
        );
        if (staleConnectedEvents.length) {
          Promise.allSettled(
            staleConnectedEvents.map((event) => syncEventbriteEvent(event._id)),
          ).then((results) => {
            const refreshed = new Map();
            results.forEach((result) => {
              if (result.status === "fulfilled" && result.value?.event?._id) {
                refreshed.set(result.value.event._id, result.value.event);
              }
            });
            if (refreshed.size) {
              setEvents((current) =>
                current.map((event) => refreshed.get(event._id) || event),
              );
            }
          });
        }
      })
      .catch(() => setError("Unable to load event operations."));
  }, []);

  const connectEventbrite = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await beginEventbriteConnection();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to start Eventbrite authorization.",
      );
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingEvent(null);
    setDraft(emptyDraft);
    setChangePreview([]);
    setEventModalOpen(true);
  };

  const openManage = async (event) => {
    setWorkingId(event._id);
    setError("");
    try {
      const result = event.integrations?.eventbrite?.eventId
        ? await syncEventbriteEvent(event._id)
        : { event };
      const current = result.event || event;
      setEvents((items) =>
        items.map((item) => (item._id === current._id ? current : item)),
      );
      setEditingEvent(current);
      setDraft(draftFromEvent(current));
      setManageTab("listing");
      setChangePreview([]);
      setEventModalOpen(true);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to retrieve the current Eventbrite listing.",
      );
    } finally {
      setWorkingId("");
    }
  };

  const saveEvent = async (confirmed = false) => {
    if (!draft.name || !draft.startDate || !draft.endDate) {
      setError("Event name, start time, and end time are required.");
      return;
    }
    let payload = {
      ...draft,
      startDate: new Date(draft.startDate),
      endDate: new Date(draft.endDate),
      ticketPrice: Number(draft.ticketPrice || 0),
      ticketGoal: Number(draft.ticketGoal || 0),
      audience: draft.audience
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    if (editingEvent) {
      const changes = changedFields(editingEvent, draft);
      if (!confirmed) {
        if (!changes.length) {
          setSuccess("No changes to save.");
          return;
        }
        setChangePreview(changes);
        return;
      }
      const changedLabels = new Set(changes.map((change) => change.label));
      const source = payload;
      payload = {};
      if (changedLabels.has("Event name")) payload.name = source.name;
      if (changedLabels.has("Short summary")) payload.summary = source.summary;
      if (changedLabels.has("Starts") || changedLabels.has("Time zone")) {
        payload.startDate = source.startDate;
      }
      if (changedLabels.has("Ends") || changedLabels.has("Time zone")) {
        payload.endDate = source.endDate;
      }
      if (changedLabels.has("Format"))
        payload.locationType = source.locationType;
      if (changedLabels.has("Time zone")) payload.timeZone = source.timeZone;
      if (changedLabels.has("Capacity")) payload.ticketGoal = source.ticketGoal;
      if (changedLabels.has("Campaign audience"))
        payload.audience = source.audience;
      if (changedLabels.has("Audience approval")) {
        payload.audienceConfirmed = source.audienceConfirmed;
      }
    }
    try {
      setLoading(true);
      setError("");
      if (editingEvent) {
        await updateManagedEventbriteEvent(editingEvent._id, payload);
        setSuccess("Approved changes were saved to their listed destinations.");
      } else if (connection?.connected) {
        await createManagedEventbriteEvent({
          ...payload,
          organizationId: connection.defaultOrganizationId,
        });
        setSuccess(
          draft.publishNow
            ? "Event created and published to Eventbrite."
            : "Eventbrite draft created.",
        );
      } else {
        await createEvent({ ...payload, status: "draft" });
        setSuccess(
          "Draft saved in Ellie. Connect Eventbrite when you are ready to publish it.",
        );
      }
      setEventModalOpen(false);
      setChangePreview([]);
      await loadWorkspace();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to save this event.");
    } finally {
      setLoading(false);
    }
  };

  const importEvent = async () => {
    if (!selectedEventId) return;
    try {
      setLoading(true);
      setError("");
      await importEventbriteEvent(selectedEventId);
      setSelectedEventId("");
      setSuccess("Existing Eventbrite event added to Ellie.");
      await loadWorkspace();
    } catch (err) {
      setError(
        err.response?.data?.error || "Unable to add this Eventbrite event.",
      );
    } finally {
      setLoading(false);
    }
  };

  const publishEvent = async (eventId) => {
    try {
      setWorkingId(eventId);
      await publishManagedEventbriteEvent(eventId);
      setEventModalOpen(false);
      setSuccess("Event published to Eventbrite.");
      await loadWorkspace();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to publish this event.");
    } finally {
      setWorkingId("");
    }
  };

  const createCampaign = async (eventId) => {
    try {
      setWorkingId(eventId);
      const response = await createCampaignFromEvent(eventId);
      navigate(`/campaigns/${response.campaign._id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create a campaign.");
    } finally {
      setWorkingId("");
    }
  };

  return (
    <div className="page-dashboard events-page events-operations">
      <header className="events-hero">
        <div>
          <p className="events-eyebrow">Event operations</p>
          <h1 className="page-title">Events</h1>
          <p>
            Create, publish, promote, and measure every event from one
            workspace.
          </p>
        </div>
        <Button onClick={openCreate}>+ Create event</Button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="discovery-notice">{success}</p> : null}

      <section className="eventbrite-command">
        <div className="eventbrite-command__identity">
          <span
            className={`connection-dot connection-dot--${connection?.connected ? "on" : "off"}`}
          />
          <div>
            <strong>
              {connection?.connected
                ? "Eventbrite connected"
                : "Eventbrite setup"}
            </strong>
            <p>
              {connection?.connected
                ? `${connection.accountEmail || "Authorized account"} · publishing and live reporting enabled`
                : connection?.status === "legacy_token"
                  ? "Live reporting and existing-event management are active. Complete OAuth to create new Eventbrite listings."
                  : "Connect an Eventbrite account to publish listings and receive live event data."}
            </p>
          </div>
        </div>
        {!connection?.connected && connection?.configured ? (
          <Button loading={loading} onClick={connectEventbrite}>
            Connect Eventbrite
          </Button>
        ) : null}
      </section>

      <section className="event-summary-grid">
        <DashboardCard title="Upcoming">
          <strong>{upcomingEvents.length}</strong>
          <span>events on the calendar</span>
        </DashboardCard>
        <DashboardCard title="Published">
          <strong>
            {
              events.filter(
                (event) => event.eventbriteLogistics?.status === "live",
              ).length
            }
          </strong>
          <span>live Eventbrite listings</span>
        </DashboardCard>
        <DashboardCard title="Registrations">
          <strong>{totalRegistrations}</strong>
          <span>across all events</span>
        </DashboardCard>
        <DashboardCard title="Gross sales">
          <strong>
            {grossSales.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </strong>
          <span>reported by Eventbrite</span>
        </DashboardCard>
      </section>

      {availableImports.length ? (
        <section className="event-import-strip">
          <div>
            <strong>Add an existing Eventbrite event</strong>
            <p>Only listings that are not already in Ellie appear here.</p>
          </div>
          <select
            className="select-input"
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
          >
            <option value="">Choose an unconnected listing</option>
            {availableImports.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name?.text || "Untitled event"}
              </option>
            ))}
          </select>
          <Button
            loading={loading}
            disabled={!selectedEventId}
            onClick={importEvent}
          >
            Add to Ellie
          </Button>
        </section>
      ) : null}

      <DashboardCard title="Event portfolio">
        {events.length ? (
          <div className="events-list">
            {events.map((event) => {
              const linkedCampaign = campaignsByEvent.get(String(event._id));
              const logistics = event.eventbriteLogistics || {};
              const eventbriteUrl = event.integrations?.eventbrite?.url;
              const isEventbrite = Boolean(
                event.integrations?.eventbrite?.eventId,
              );
              const listingStatus =
                logistics.status === "live"
                  ? "Live on Eventbrite"
                  : isEventbrite
                    ? "Eventbrite draft"
                    : "Ellie draft";
              return (
                <article className="event-portfolio-card" key={event._id}>
                  <div className="event-portfolio-card__header">
                    <div>
                      <p className="event-row__date">
                        {event.startDate
                          ? new Date(event.startDate).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )
                          : "Date pending"}
                      </p>
                      <h3>{event.name}</h3>
                      <p>{event.location || "Online"}</p>
                    </div>
                    <span
                      className={`event-status event-status--${logistics.status === "live" ? "live" : "draft"}`}
                    >
                      {listingStatus}
                    </span>
                  </div>

                  <div className="event-logistics">
                    <div>
                      <span>Tickets sold</span>
                      <strong>
                        {logistics.ticketsSold ?? event.ticketsSold ?? 0}
                      </strong>
                    </div>
                    <div>
                      <span>Registrations</span>
                      <strong>{logistics.attendeeCount ?? 0}</strong>
                    </div>
                    <div>
                      <span>Checked in</span>
                      <strong>{logistics.checkedInCount ?? 0}</strong>
                    </div>
                    <div>
                      <span>Gross sales</span>
                      <strong>
                        {Number(logistics.grossRevenue || 0).toLocaleString(
                          "en-US",
                          {
                            style: "currency",
                            currency: logistics.currency || "USD",
                          },
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Campaign</span>
                      <strong>
                        {linkedCampaign ? "Active" : "Not created"}
                      </strong>
                    </div>
                  </div>

                  <div className="event-portfolio-card__footer">
                    <p>
                      {logistics.lastSyncedAt
                        ? `Eventbrite data updated ${new Date(logistics.lastSyncedAt).toLocaleString()}`
                        : "Performance data will appear after this event is connected."}
                    </p>
                    <div className="event-row__actions">
                      <Button
                        variant="outline"
                        onClick={() => openManage(event)}
                      >
                        Manage event
                      </Button>
                      {eventbriteUrl ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            window.open(
                              eventbriteUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          View listing
                        </Button>
                      ) : null}
                      {linkedCampaign ? (
                        <Button
                          onClick={() =>
                            navigate(`/campaigns/${linkedCampaign._id}`)
                          }
                        >
                          View campaign
                        </Button>
                      ) : (
                        <Button
                          loading={workingId === event._id}
                          onClick={() => createCampaign(event._id)}
                        >
                          Create campaign
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="table-state table-state--empty">
            Create your first event to begin.
          </div>
        )}
      </DashboardCard>

      <Modal
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title={editingEvent ? "Event operations" : "Create event"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEventModalOpen(false)}>
              Cancel
            </Button>
            {editingEvent?.integrations?.eventbrite?.eventId &&
            editingEvent.eventbriteLogistics?.status !== "live" &&
            connection?.connected ? (
              <Button
                variant="outline"
                loading={workingId === editingEvent._id}
                onClick={() => publishEvent(editingEvent._id)}
              >
                Publish on Eventbrite
              </Button>
            ) : null}
            <Button loading={loading} onClick={() => saveEvent(false)}>
              {editingEvent
                ? "Review changes"
                : connection?.connected
                  ? "Create event"
                  : "Save draft"}
            </Button>
          </>
        }
      >
        {editingEvent ? (
          <div className="event-manage">
            <div
              className="event-manage-tabs"
              role="tablist"
              aria-label="Event management sections"
            >
              <button
                type="button"
                className={manageTab === "listing" ? "active" : ""}
                onClick={() => setManageTab("listing")}
              >
                Eventbrite listing
              </button>
              <button
                type="button"
                className={manageTab === "edit" ? "active" : ""}
                onClick={() => setManageTab("edit")}
              >
                Editable details
              </button>
              <button
                type="button"
                className={manageTab === "strategy" ? "active" : ""}
                onClick={() => setManageTab("strategy")}
              >
                Ellie campaign strategy
              </button>
            </div>

            {changePreview.length ? (
              <section className="event-change-preview">
                <div>
                  <p className="events-eyebrow">Confirmation required</p>
                  <h3>Review exactly what will change</h3>
                  <p>Nothing is published until you confirm below.</p>
                </div>
                <div className="event-change-list">
                  {changePreview.map((change) => (
                    <article key={change.label}>
                      <div>
                        <strong>{change.label}</strong>
                        <span>{change.destination}</span>
                      </div>
                      <p>
                        <del>{change.before}</del>
                        <span aria-hidden="true">→</span>
                        <ins>{change.after}</ins>
                      </p>
                    </article>
                  ))}
                </div>
                <div className="event-change-actions">
                  <Button
                    variant="outline"
                    onClick={() => setChangePreview([])}
                  >
                    Keep editing
                  </Button>
                  <Button loading={loading} onClick={() => saveEvent(true)}>
                    Confirm and save
                  </Button>
                </div>
              </section>
            ) : null}

            {!changePreview.length && manageTab === "listing" ? (
              <EventbriteListingDetails event={editingEvent} />
            ) : null}

            {!changePreview.length && manageTab === "edit" ? (
              <div className="campaign-form-grid event-form">
                <p className="event-section-intro span-2">
                  These fields are supported by Eventbrite’s public API. Review
                  changes shows exactly what will be published before anything
                  is saved.
                </p>
                <label className="form-field span-2">
                  <span>Event name</span>
                  <input
                    className="select-input"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label className="form-field span-2">
                  <span>Short summary</span>
                  <input
                    className="select-input"
                    maxLength="140"
                    value={draft.summary}
                    onChange={(e) =>
                      setDraft({ ...draft, summary: e.target.value })
                    }
                  />
                  <small>{draft.summary.length}/140 characters</small>
                </label>
                <label className="form-field">
                  <span>Starts</span>
                  <input
                    className="select-input"
                    type="datetime-local"
                    value={draft.startDate}
                    onChange={(e) =>
                      setDraft({ ...draft, startDate: e.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Ends</span>
                  <input
                    className="select-input"
                    type="datetime-local"
                    value={draft.endDate}
                    onChange={(e) =>
                      setDraft({ ...draft, endDate: e.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Format</span>
                  <select
                    className="select-input"
                    value={draft.locationType}
                    onChange={(e) =>
                      setDraft({ ...draft, locationType: e.target.value })
                    }
                  >
                    <option value="online">Online</option>
                    <option value="venue">In person</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Time zone</span>
                  <select
                    className="select-input"
                    value={draft.timeZone}
                    onChange={(e) =>
                      setDraft({ ...draft, timeZone: e.target.value })
                    }
                  >
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/New_York">Eastern Time</option>
                  </select>
                </label>
                <label className="form-field span-2">
                  <span>Capacity</span>
                  <input
                    className="select-input"
                    type="number"
                    min="1"
                    value={draft.ticketGoal}
                    onChange={(e) =>
                      setDraft({ ...draft, ticketGoal: e.target.value })
                    }
                  />
                </label>
                <aside className="event-unsupported span-2">
                  <div>
                    <strong>Advanced Eventbrite content</strong>
                    <p>
                      Rich overview modules, Agenda, Lineup, imagery, refund
                      rules, and active ticket pricing stay in Eventbrite’s
                      authoritative editor.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        editingEvent.eventbriteListing?.onlineAccess
                          ?.organizerEditUrl ||
                          editingEvent.integrations?.eventbrite?.url,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Edit advanced content on Eventbrite
                  </Button>
                </aside>
              </div>
            ) : null}

            {!changePreview.length && manageTab === "strategy" ? (
              <div className="event-strategy">
                <div className="event-strategy__header">
                  <div>
                    <p className="events-eyebrow">Ellie AI only</p>
                    <h3>Campaign audience</h3>
                    <p>
                      This controls prospect filters and campaign messaging. It
                      never rewrites the Eventbrite listing.
                    </p>
                  </div>
                  <span
                    className={`event-status event-status--${draft.audienceConfirmed ? "live" : "draft"}`}
                  >
                    {draft.audienceConfirmed ? "Confirmed" : "Needs approval"}
                  </span>
                </div>
                {(editingEvent.audienceSuggestions || []).length ? (
                  <div className="audience-suggestions">
                    <strong>Suggested from the Eventbrite description</strong>
                    <p>
                      Ellie found these near “Who this event is for.” Select
                      only the groups you want to target.
                    </p>
                    <div>
                      {editingEvent.audienceSuggestions.map((suggestion) => {
                        const selected = draft.audience
                          .split(",")
                          .map((item) => item.trim())
                          .includes(suggestion);
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            className={selected ? "selected" : ""}
                            onClick={() => {
                              const current = draft.audience
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean);
                              const next = selected
                                ? current.filter((item) => item !== suggestion)
                                : [...current, suggestion];
                              setDraft({
                                ...draft,
                                audience: next.join(", "),
                                audienceConfirmed: false,
                              });
                            }}
                          >
                            {selected ? "✓ " : "+ "}
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="event-form-note">
                    No reliable audience section was returned. Enter the
                    audience deliberately below.
                  </p>
                )}
                <label className="form-field">
                  <span>Approved audience groups</span>
                  <textarea
                    className="select-input"
                    value={draft.audience}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        audience: e.target.value,
                        audienceConfirmed: false,
                      })
                    }
                    placeholder="Separate audience groups with commas"
                  />
                </label>
                <label className="event-publish-choice">
                  <input
                    type="checkbox"
                    checked={draft.audienceConfirmed}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        audienceConfirmed: e.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Ellie has approved this target audience</strong>
                    <small>
                      Suggestions never become campaign filters until this is
                      checked and saved.
                    </small>
                  </span>
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="campaign-form-grid event-form">
            <label className="form-field span-2">
              <span>Event name</span>
              <input
                className="select-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="form-field span-2">
              <span>Short summary</span>
              <input
                className="select-input"
                maxLength="140"
                value={draft.summary}
                onChange={(e) =>
                  setDraft({ ...draft, summary: e.target.value })
                }
              />
              <small>{draft.summary.length}/140 characters</small>
            </label>
            <label className="form-field">
              <span>Starts</span>
              <input
                className="select-input"
                type="datetime-local"
                value={draft.startDate}
                onChange={(e) =>
                  setDraft({ ...draft, startDate: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Ends</span>
              <input
                className="select-input"
                type="datetime-local"
                value={draft.endDate}
                onChange={(e) =>
                  setDraft({ ...draft, endDate: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Format</span>
              <select
                className="select-input"
                value={draft.locationType}
                onChange={(e) =>
                  setDraft({ ...draft, locationType: e.target.value })
                }
              >
                <option value="online">Online</option>
                <option value="venue">In person</option>
              </select>
            </label>
            <label className="form-field">
              <span>Time zone</span>
              <select
                className="select-input"
                value={draft.timeZone}
                onChange={(e) =>
                  setDraft({ ...draft, timeZone: e.target.value })
                }
              >
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/New_York">Eastern Time</option>
              </select>
            </label>
            {draft.locationType === "venue" ? (
              <label className="form-field span-2">
                <span>Venue</span>
                <input
                  className="select-input"
                  value={draft.location}
                  onChange={(e) =>
                    setDraft({ ...draft, location: e.target.value })
                  }
                />
              </label>
            ) : null}
            <label className="form-field">
              <span>Ticket price</span>
              <input
                className="select-input"
                type="number"
                min="0"
                value={draft.ticketPrice}
                onChange={(e) =>
                  setDraft({ ...draft, ticketPrice: e.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span>Ticket quantity</span>
              <input
                className="select-input"
                type="number"
                min="1"
                value={draft.ticketGoal}
                onChange={(e) =>
                  setDraft({ ...draft, ticketGoal: e.target.value })
                }
              />
            </label>
            <label className="form-field span-2">
              <span>Audience</span>
              <input
                className="select-input"
                value={draft.audience}
                onChange={(e) =>
                  setDraft({ ...draft, audience: e.target.value })
                }
                placeholder="Real estate investors, entrepreneurs"
              />
            </label>
            <label className="form-field span-2">
              <span>Description</span>
              <textarea
                className="select-input"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            {!editingEvent && connection?.connected ? (
              <label className="event-publish-choice span-2">
                <input
                  type="checkbox"
                  checked={draft.publishNow}
                  onChange={(e) =>
                    setDraft({ ...draft, publishNow: e.target.checked })
                  }
                />
                <span>
                  <strong>Publish immediately</strong>
                  <small>
                    Leave unchecked to create a private Eventbrite draft for
                    review.
                  </small>
                </span>
              </label>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
