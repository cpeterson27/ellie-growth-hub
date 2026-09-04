import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import EventbriteListingDetails from "../components/EventbriteListingDetails.jsx";
import Modal from "../components/Modal.jsx";
import {
  beginEventbriteConnection,
  createCampaignFromEvent,
  createEvent,
  createEventbriteDraft,
  fetchCampaigns,
  fetchEventbriteConnection,
  fetchEventbriteEvents,
  fetchEvents,
  importEventbriteEvent,
  publishManagedEventbriteEvent,
  recommendEventAudience,
  syncEventbriteEvent,
  updateManagedEventbriteEvent,
  uploadEventImage,
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
  ticketName: "",
  ticketPrice: "",
  ticketGoal: "",
  audience: "",
  audienceConfirmed: false,
  planning: {
    attendeeOutcomes: "",
    idealAttendee: "",
    businessGoal: "",
    organizerName: "",
    organizerDescription: "",
    presenters: [],
    agenda: [],
    faqs: [],
    refundPolicy: "",
    highlights: [],
    imageUrl: "",
    ticketClasses: [],
    draftStep: 1,
  },
  audienceRecommendations: [],
  audienceRecommendationSource: "",
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

function draftFromEvent(event, campaign) {
  const eventAudience = event.audience || [];
  const campaignAudience = campaign?.audience || [];
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
    audience: (eventAudience.length ? eventAudience : campaignAudience).join(", "),
    audienceConfirmed: Boolean(event.audienceConfirmedAt),
    planning: { ...emptyDraft.planning, ...(event.planning || {}) },
    audienceRecommendations:
      event.audienceRecommendationDetails ||
      (event.audienceSuggestions || []).map((label) => ({
        label,
        reason: "Suggested from the Eventbrite description.",
        evidence: [],
      })),
    audienceRecommendationSource: event.audienceRecommendationSource || "",
  };
}

const wizardSteps = ["Concept", "Schedule", "Experience", "Tickets", "Audience", "Review"];

function eventReadiness(draft) {
  const planning = draft.planning || {};
  const checks = [
    ["Event concept", Boolean(draft.name && draft.summary && draft.description)],
    ["Schedule and format", Boolean(draft.startDate && draft.endDate && draft.timeZone)],
    ["Attendee outcome", Boolean(planning.attendeeOutcomes)],
    ["Organizer", Boolean(planning.organizerName)],
    ["Agenda or highlights", Boolean(planning.agenda?.length || planning.highlights?.length)],
    ["Tickets", Number(draft.ticketGoal) > 0],
    ["Refund policy", Boolean(planning.refundPolicy)],
    ["Event image", Boolean(planning.imageUrl)],
    ["Audience strategy", Boolean(draft.audienceRecommendations?.length)],
  ];
  return {
    checks,
    complete: checks.filter(([, ready]) => ready).length,
    total: checks.length,
    eventbriteReady: checks.slice(0, 6).every(([, ready]) => ready),
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
      "Lead Porch only",
    ],
    [
      "Audience approval",
      original.audienceConfirmedAt ? "Confirmed" : "Not confirmed",
      draft.audienceConfirmed ? "Confirmed" : "Not confirmed",
      "Lead Porch only",
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
  const [wizardStep, setWizardStep] = useState(0);
  const [changePreview, setChangePreview] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [imageUploading, setImageUploading] = useState(false);
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
  const deepLinkHandled = useRef(false);
  const openManageRef = useRef(null);

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

  const refreshEventbriteData = async (event) => {
    if (!event.integrations?.eventbrite?.eventId) return;
    try {
      setWorkingId(event._id);
      setError("");
      const result = await syncEventbriteEvent(event._id);
      const current = result.event || event;
      setEvents((items) =>
        items.map((item) => (item._id === current._id ? current : item)),
      );
      setSuccess(`Eventbrite data refreshed for ${current.name}.`);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to refresh Eventbrite data.");
    } finally {
      setWorkingId("");
    }
  };

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
    setWizardStep(0);
    setChangePreview([]);
    setEventModalOpen(true);
  };

  const updateAgendaItem = (index, field, value) => {
    const agenda = [...(draft.planning.agenda || [])];
    agenda[index] = { ...(agenda[index] || {}), [field]: value };
    setDraft({ ...draft, planning: { ...draft.planning, agenda } });
  };

  const addAgendaItem = () => {
    setDraft({
      ...draft,
      planning: {
        ...draft.planning,
        agenda: [
          ...(draft.planning.agenda || []),
          { title: "", startTime: "", endTime: "", description: "" },
        ],
      },
    });
  };

  const removeAgendaItem = (index) => {
    setDraft({
      ...draft,
      planning: {
        ...draft.planning,
        agenda: draft.planning.agenda.filter((_, itemIndex) => itemIndex !== index),
      },
    });
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, WEBP, or other image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("The event image must be smaller than 8 MB.");
      return;
    }
    try {
      setImageUploading(true);
      setError("");
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadEventImage({ file: dataUrl, filename: file.name });
      setDraft({
        ...draft,
        planning: { ...draft.planning, imageUrl: result.url },
      });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Unable to upload the image. Check the Cloudinary settings on the backend.",
      );
    } finally {
      setImageUploading(false);
    }
  };

  const openManage = async (event) => {
    setWorkingId(event._id);
    setError("");
    try {
      const result = event.integrations?.eventbrite?.eventId
        ? await syncEventbriteEvent(event._id)
        : { event };
      const current = result.event || event;
      const campaign = campaignsByEvent.get(String(current._id));
      setEvents((items) =>
        items.map((item) => (item._id === current._id ? current : item)),
      );
      setEditingEvent(current);
      setDraft(draftFromEvent(current, campaign));
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
  useEffect(() => { openManageRef.current = openManage; });

  useEffect(() => {
    if (deepLinkHandled.current || !events.length) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("eventId");
    if (!eventId) return;
    const event = events.find((item) => String(item._id) === String(eventId));
    if (!event) return;
    deepLinkHandled.current = true;
    const openDeepLink = window.setTimeout(() => Promise.resolve(openManageRef.current?.(event)).then(() => {
      setManageTab(params.get("tab") === "strategy" ? "strategy" : "listing");
      window.history.replaceState({}, "", window.location.pathname);
    }), 0);
    return () => window.clearTimeout(openDeepLink);
  }, [events]);

  const saveEvent = async (confirmed = false) => {
    if (!draft.name) {
      setError("Give the event a working name before saving the draft.");
      return;
    }
    let payload = {
      ...draft,
      startDate: draft.startDate ? new Date(draft.startDate) : null,
      endDate: draft.endDate ? new Date(draft.endDate) : null,
      ticketPrice: Number(draft.ticketPrice || 0),
      ticketGoal: Number(draft.ticketGoal || 0),
      audience: draft.audience
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      planning: { ...draft.planning, draftStep: wizardStep + 1 },
      audienceSuggestions: draft.audienceRecommendations.map((item) => item.label),
      audienceRecommendationDetails: draft.audienceRecommendations,
      audienceRecommendationSource: draft.audienceRecommendationSource,
    };
    if (editingEvent) {
      if (!editingEvent.integrations?.eventbrite?.eventId) {
        try {
          setLoading(true);
          setError("");
          await updateManagedEventbriteEvent(editingEvent._id, payload);
          setEventModalOpen(false);
          setSuccess("Lead Porch draft updated. Nothing was sent to Eventbrite.");
          await loadWorkspace();
        } catch (err) {
          setError(err.response?.data?.error || "Unable to save this draft.");
        } finally {
          setLoading(false);
        }
        return;
      }
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
      } else {
        await createEvent({ ...payload, status: "draft" });
        setSuccess(
          "Draft saved in Lead Porch. No Eventbrite listing was created.",
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

  const generateAudience = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await recommendEventAudience(draft);
      const recommendations = result.recommendations || [];
      setDraft({
        ...draft,
        audienceRecommendations: recommendations,
        audienceRecommendationSource: result.source || "rules",
        audienceConfirmed: false,
      });
      setSuccess(
        recommendations.length
          ? `Generated ${recommendations.length} grounded audience recommendations.`
          : "Add more detail about the attendee and event outcome so Lead Porch can recommend an audience.",
      );
    } catch (err) {
      setError(err.response?.data?.error || "Unable to recommend an audience.");
    } finally {
      setLoading(false);
    }
  };

  const sendDraftToEventbrite = async (eventId) => {
    try {
      setWorkingId(eventId);
      setError("");
      await createEventbriteDraft(eventId);
      setEventModalOpen(false);
      setSuccess("Eventbrite draft created. It is not published.");
      await loadWorkspace();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to create the Eventbrite draft.");
    } finally {
      setWorkingId("");
    }
  };

  const importEvent = async () => {
    if (!selectedEventId) return;
    try {
      setLoading(true);
      setError("");
      await importEventbriteEvent(selectedEventId);
      setSelectedEventId("");
      setSuccess("Existing Eventbrite event added to Lead Porch.");
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
        ) : (
          <Button variant="outline" onClick={() => navigate("/integrations")}>
            View setup
          </Button>
        )}
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
            <p>Only listings that are not already in Lead Porch appear here.</p>
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
            Add to Lead Porch
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
                    : "Lead Porch draft";
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
                      {isEventbrite ? (
                        <Button
                          variant="outline"
                          loading={workingId === event._id}
                          onClick={() => refreshEventbriteData(event)}
                        >
                          Refresh Eventbrite data
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
            {!editingEvent && wizardStep > 0 ? (
              <Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)}>
                Back
              </Button>
            ) : null}
            {editingEvent &&
            !editingEvent.integrations?.eventbrite?.eventId &&
            connection?.connected ? (
              <Button
                variant="outline"
                loading={workingId === editingEvent._id}
                disabled={!eventReadiness(draft).eventbriteReady}
                onClick={() => sendDraftToEventbrite(editingEvent._id)}
              >
                Create Eventbrite draft
              </Button>
            ) : null}
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
            {!editingEvent && wizardStep < wizardSteps.length - 1 ? (
              <>
                <Button variant="outline" loading={loading} onClick={() => saveEvent(false)}>
                  Save and exit
                </Button>
                <Button onClick={() => setWizardStep(wizardStep + 1)}>Continue</Button>
              </>
            ) : (
              <Button loading={loading} onClick={() => saveEvent(false)}>
                {editingEvent ? "Review changes" : "Save Lead Porch draft"}
              </Button>
            )}
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
                Lead Porch campaign strategy
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
                    <p className="events-eyebrow">Lead Porch only</p>
                    <h3>Campaign audience</h3>
                    <p>
                      This is Lead Porch’s internal targeting brief. It guides
                      contact matching, lead research, and campaign messaging.
                      It does not change the public Eventbrite listing and it
                      does not remove contacts you already assigned.
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
                    <strong>Step 1 · Suggested audience segments</strong>
                    <p>
                      Lead Porch found these in the Eventbrite listing. Use them as a
                      shortcut, or keep the campaign audience you already chose.
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
                  <span>Step 2 · Selected target audience</span>
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
                    placeholder="Choose suggestions above or type audience groups separated with commas"
                  />
                  <small>
                    Lead Porch compares these labels against CRM contacts, native
                    imports, titles, industries, companies, tags, keywords,
                    lists, and notes. Contacts can already be assigned; this
                    confirms the targeting rule for future matching.
                  </small>
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
                    <strong>Step 3 · Approve this audience for matching</strong>
                    <small>
                      After this is checked and saved, Lead Porch can use these
                      groups as the official campaign filter. No emails are
                      generated or sent from this step.
                    </small>
                  </span>
                </label>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="event-wizard">
            <div className="event-wizard__steps">
              {wizardSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={wizardStep === index ? "active" : ""}
                  onClick={() => setWizardStep(index)}
                >
                  <span>{index + 1}</span>{step}
                </button>
              ))}
            </div>

            {wizardStep === 0 ? (
              <div className="campaign-form-grid event-form">
                <p className="event-section-intro span-2">
                  Start with the promise of the event. This stays in Lead Porch until
                  you explicitly create an Eventbrite draft.
                </p>
                <label className="form-field span-2">
                  <span>Working event name</span>
                  <input className="select-input" value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="form-field span-2">
                  <span>Short public summary</span>
                  <input className="select-input" maxLength="140" value={draft.summary}
                    onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
                  <small>{draft.summary.length}/140 characters</small>
                </label>
                <label className="form-field span-2">
                  <span>Complete event overview</span>
                  <textarea className="select-input" value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </label>
                <label className="form-field">
                  <span>What will attendees be able to do afterward?</span>
                  <textarea className="select-input" value={draft.planning.attendeeOutcomes}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, attendeeOutcomes: e.target.value } })} />
                </label>
                <label className="form-field">
                  <span>What business result should this event create?</span>
                  <textarea className="select-input" value={draft.planning.businessGoal}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, businessGoal: e.target.value } })} />
                </label>
              </div>
            ) : null}

            {wizardStep === 1 ? (
              <div className="campaign-form-grid event-form">
                <label className="form-field"><span>Starts</span>
                  <input className="select-input" type="datetime-local" value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
                </label>
                <label className="form-field"><span>Ends</span>
                  <input className="select-input" type="datetime-local" value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                </label>
                <label className="form-field"><span>Format</span>
                  <select className="select-input" value={draft.locationType}
                    onChange={(e) => setDraft({ ...draft, locationType: e.target.value })}>
                    <option value="online">Online</option><option value="venue">In person</option>
                  </select>
                </label>
                <label className="form-field"><span>Time zone</span>
                  <select className="select-input" value={draft.timeZone}
                    onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/New_York">Eastern Time</option>
                  </select>
                </label>
                {draft.locationType === "venue" ? (
                  <label className="form-field span-2"><span>Venue and address</span>
                    <input className="select-input" value={draft.location}
                      onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                  </label>
                ) : null}
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="campaign-form-grid event-form">
                <label className="form-field"><span>Organizer name</span>
                  <input className="select-input" value={draft.planning.organizerName}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, organizerName: e.target.value } })} />
                </label>
                <label className="form-field"><span>Presenter names, one per line</span>
                  <textarea className="select-input"
                    value={draft.planning.presenters.map((item) => item.name || item).join("\n")}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, presenters: e.target.value.split("\n").filter(Boolean).map((name) => ({ name })) } })} />
                </label>
                <label className="form-field span-2"><span>Organizer or host description</span>
                  <textarea className="select-input" value={draft.planning.organizerDescription}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, organizerDescription: e.target.value } })} />
                </label>
                <label className="form-field"><span>Highlights, one per line</span>
                  <textarea className="select-input" value={draft.planning.highlights.join("\n")}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, highlights: e.target.value.split("\n").filter(Boolean) } })} />
                </label>
                <section className="agenda-builder span-2">
                  <div className="agenda-builder__header">
                    <div>
                      <h3>Agenda</h3>
                      <p>Add each session with its time and details. Attendees will see a clear, professional schedule.</p>
                    </div>
                    <Button variant="outline" onClick={addAgendaItem}>+ Add session</Button>
                  </div>
                  {!draft.planning.agenda.length ? (
                    <button type="button" className="agenda-empty" onClick={addAgendaItem}>
                      <strong>Build the event agenda</strong>
                      <span>Add the first session, break, Q&amp;A, or closing activity.</span>
                    </button>
                  ) : (
                    <div className="agenda-items">
                      {draft.planning.agenda.map((item, index) => (
                        <article className="agenda-item" key={index}>
                          <div className="agenda-item__heading">
                            <strong>Session {index + 1}</strong>
                            <button type="button" onClick={() => removeAgendaItem(index)}>Remove</button>
                          </div>
                          <div className="agenda-item__grid">
                            <label className="form-field span-2"><span>Session title</span>
                              <input className="select-input" value={item.title || ""}
                                onChange={(e) => updateAgendaItem(index, "title", e.target.value)} />
                            </label>
                            <label className="form-field"><span>Starts</span>
                              <input className="select-input" type="time" value={item.startTime || ""}
                                onChange={(e) => updateAgendaItem(index, "startTime", e.target.value)} />
                            </label>
                            <label className="form-field"><span>Ends</span>
                              <input className="select-input" type="time" value={item.endTime || ""}
                                onChange={(e) => updateAgendaItem(index, "endTime", e.target.value)} />
                            </label>
                            <label className="form-field span-2"><span>What happens in this session?</span>
                              <textarea className="select-input" value={item.description || ""}
                                onChange={(e) => updateAgendaItem(index, "description", e.target.value)} />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="event-image-uploader span-2">
                  <div>
                    <h3>Event image</h3>
                    <p>Upload an image from this device. Lead Porch stores it securely and creates the hosted URL automatically.</p>
                  </div>
                  <div className="event-image-uploader__body">
                    {draft.planning.imageUrl ? (
                      <img src={draft.planning.imageUrl} alt="Event preview" />
                    ) : (
                      <div className="event-image-placeholder">Image preview</div>
                    )}
                    <div className="event-image-actions">
                      <label className="event-file-button">
                        <input type="file" accept="image/*" disabled={imageUploading}
                          onChange={(e) => handleImageUpload(e.target.files?.[0])} />
                        {imageUploading ? "Uploading…" : draft.planning.imageUrl ? "Replace image" : "Choose image"}
                      </label>
                      {draft.planning.imageUrl ? (
                        <button type="button" onClick={() => setDraft({
                          ...draft,
                          planning: { ...draft.planning, imageUrl: "" },
                        })}>Remove</button>
                      ) : null}
                      <small>PNG, JPG, or WEBP up to 8 MB.</small>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="campaign-form-grid event-form">
                <label className="form-field"><span>Primary ticket name</span>
                  <input className="select-input" value={draft.ticketName}
                    onChange={(e) => setDraft({ ...draft, ticketName: e.target.value })} />
                </label>
                <label className="form-field"><span>Ticket price</span>
                  <input className="select-input" type="number" min="0" value={draft.ticketPrice}
                    onChange={(e) => setDraft({ ...draft, ticketPrice: e.target.value })} />
                </label>
                <label className="form-field"><span>Ticket quantity</span>
                  <input className="select-input" type="number" min="1" value={draft.ticketGoal}
                    onChange={(e) => setDraft({ ...draft, ticketGoal: e.target.value })} />
                </label>
                <label className="form-field"><span>Refund policy</span>
                  <textarea className="select-input" value={draft.planning.refundPolicy}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, refundPolicy: e.target.value } })} />
                </label>
                <p className="event-form-note span-2">
                  Additional ticket tiers, fee rules, sale windows, tax settings,
                  and payout settings will appear on the completion checklist
                  when Eventbrite requires its own editor.
                </p>
              </div>
            ) : null}

            {wizardStep === 4 ? (
              <div className="event-strategy">
                <div className="event-strategy__header">
                  <div><h3>Audience recommendations</h3>
                    <p>Lead Porch analyzes the event draft and your ideal-attendee notes to suggest targeting segments. Contacts come from Lead Porch research, the CRM, CSV imports, or future approved integrations.</p>
                  </div>
                  <Button loading={loading} onClick={generateAudience}>Generate recommendations</Button>
                </div>
                <label className="form-field"><span>Who do you believe this is for? (optional strategy note)</span>
                  <textarea className="select-input" value={draft.planning.idealAttendee}
                    onChange={(e) => setDraft({ ...draft, planning: { ...draft.planning, idealAttendee: e.target.value } })} />
                </label>
                <p className="event-form-note">
                  These are targeting segments, not people. After you select
                  and approve segments, Lead Porch can match them against existing
                  CRM contacts and future research or CRM imports with known
                  professional or interest signals.
                  Name-and-email-only contacts stay “Audience unknown” until a
                  real signal is added.
                </p>
                {draft.audienceRecommendationSource ? (
                  <p className="audience-source-note">
                    <strong>Recommendation method:</strong>{" "}
                    {draft.audienceRecommendationSource === "openai"
                      ? "OpenAI analyzed the event information entered in this draft."
                      : "Lead Porch’s built-in matching rules analyzed the event information entered in this draft."}
                  </p>
                ) : null}
                <div className="audience-recommendation-list">
                  {draft.audienceRecommendations.map((item) => {
                    const selected = draft.audience.split(",").map((value) => value.trim()).includes(item.label);
                    return <article key={item.label}>
                      <div><strong>{item.label}</strong><p>{item.reason}</p></div>
                      <button type="button" className={selected ? "selected" : ""}
                        onClick={() => {
                          const current = draft.audience.split(",").map((value) => value.trim()).filter(Boolean);
                          const next = selected ? current.filter((value) => value !== item.label) : [...current, item.label];
                          setDraft({ ...draft, audience: next.join(", "), audienceConfirmed: false });
                        }}>{selected ? "Selected" : "Add audience"}</button>
                    </article>;
                  })}
                </div>
              </div>
            ) : null}

            {wizardStep === 5 ? (() => {
              const readiness = eventReadiness(draft);
              return <div className="event-readiness">
                <div><p className="events-eyebrow">Draft readiness</p>
                  <h3>{readiness.complete} of {readiness.total} sections ready</h3>
                  <p>Saving here creates only an Lead Porch draft. Nothing is sent to Eventbrite.</p>
                </div>
                <div className="event-readiness__checks">
                  {readiness.checks.map(([label, ready]) => (
                    <div key={label} className={ready ? "ready" : ""}>
                      <span>{ready ? "✓" : "○"}</span><strong>{label}</strong>
                      <small>{ready ? "Ready" : "Needs information"}</small>
                    </div>
                  ))}
                </div>
                <p className="event-form-note">
                  After saving, open Manage Event. When the required listing
                  sections are ready, “Create Eventbrite draft” becomes available.
                  Publishing remains a separate confirmation.
                </p>
              </div>;
            })() : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
