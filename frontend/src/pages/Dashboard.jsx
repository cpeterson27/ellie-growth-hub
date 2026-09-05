import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiDollarSign,
  FiMail,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import StatCard from "../components/StatCard.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";
import { fetchCampaigns, fetchEvents, fetchOutreach } from "../services/api.js";
import "./Dashboard.css";
import useInitiative from "../context/useInitiative.js";

const eventRevenue = (event) =>
  Number(event.eventbriteLogistics?.grossRevenue || 0) ||
  Number(event.ticketsSold || 0) * Number(event.ticketPrice || 0);

const eventDate = (event) =>
  event.startDate ? new Date(event.startDate) : null;

export default function Dashboard() {
  const navigate = useNavigate();
  const { selectedId: initiativeId } = useInitiative();
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [outreachCount, setOutreachCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchEvents(), fetchCampaigns().catch(() => [])])
      .then(([items, campaignItems]) => {
        const list = Array.isArray(items) ? items : [];
        setEvents(list);
        setCampaigns(Array.isArray(campaignItems) ? campaignItems : []);
        setSelectedId(list[0]?._id || "");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initiativeId === "all" || !events.length || !campaigns.length) return;
    const campaign = campaigns.find((item) => item._id === initiativeId);
    const campaignEventId = String(
      campaign?.eventId?._id || campaign?.eventId || "",
    );
    if (
      campaignEventId &&
      events.some((event) => String(event._id) === campaignEventId)
    ) {
      const selectCampaignEvent = window.setTimeout(
        () => setSelectedId(campaignEventId),
        0,
      );
      return () => window.clearTimeout(selectCampaignEvent);
    }
  }, [initiativeId, campaigns, events]);

  const selected =
    events.find((event) => event._id === selectedId) || events[0];
  const selectedIndex = Math.max(
    0,
    events.findIndex((event) => event._id === selected?._id),
  );

  const moveSelectedEvent = (direction) => {
    if (events.length < 2) return;
    const nextIndex =
      (selectedIndex + direction + events.length) % events.length;
    setSelectedId(events[nextIndex]._id);
  };

  useEffect(() => {
    if (!selected?._id) {
      const resetOutreach = window.setTimeout(() => setOutreachCount(0), 0);
      return () => window.clearTimeout(resetOutreach);
    }
    fetchOutreach(selected._id)
      .then((items) =>
        setOutreachCount(
          (Array.isArray(items) ? items : items?.outreach || []).length,
        ),
      )
      .catch(() => setOutreachCount(0));
  }, [selected?._id]);

  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page-dashboard">
        <div className="dashboard-loading">
          <FiCalendar aria-hidden="true" />
          <span>Loading dashboard…</span>
        </div>
      </div>
    );
  }

  /* ── Empty state ───────────────────────────────────────────────────────── */
  if (!events.length) {
    return (
      <div className="page-dashboard">
        <header className="dashboard-header">
          <div>
            <h1 className="dashboard-header__title">Event dashboard</h1>
            <p className="dashboard-header__subtitle">
              Create or import your first event to begin tracking performance.
            </p>
          </div>
        </header>

        <div className="dashboard-empty">
          <div className="dashboard-empty__icon">
            <FiCalendar aria-hidden="true" />
          </div>
          <h2>No events yet</h2>
          <p>
            Add your first event and Lead Porch will start tracking tickets,
            revenue, audience, and outreach in one place.
          </p>
          <Button onClick={() => navigate("/events")}>Open Events</Button>
        </div>
      </div>
    );
  }

  /* ── Derived values ────────────────────────────────────────────────────── */
  const selectedTickets = Number(selected?.ticketsSold || 0);
  const selectedGoal = Number(selected?.ticketGoal || 0);
  const selectedProgress = selectedGoal
    ? Math.min(100, Math.round((selectedTickets / selectedGoal) * 100))
    : 0;

  const logistics = selected?.eventbriteLogistics || {};
  const attendeeCount = Number(logistics.attendeeCount || 0);
  const checkedInCount = Number(logistics.checkedInCount || 0);
  const orderCount = Number(logistics.orderCount || 0);

  const ticketRange = logistics.minimumCheckoutPrice
    ? logistics.maximumCheckoutPrice &&
      logistics.maximumCheckoutPrice !== logistics.minimumCheckoutPrice
      ? `$${Number(logistics.minimumCheckoutPrice).toLocaleString()}–$${Number(logistics.maximumCheckoutPrice).toLocaleString()}`
      : `$${Number(logistics.minimumCheckoutPrice).toLocaleString()}`
    : selected.ticketPrice
      ? `$${Number(selected.ticketPrice).toLocaleString()} base`
      : "Not set";

  const syncLabel = logistics.lastSyncedAt
    ? `Synced ${new Date(logistics.lastSyncedAt).toLocaleString()}`
    : "Eventbrite data has not synced yet";

  const hasAudienceSuggestions = Boolean(
    selected?.audienceRecommendationDetails?.length ||
      selected?.audienceSuggestions?.length,
  );

  const selectedCampaign = campaigns.find((campaign) => {
    const campaignEventId = String(
      campaign?.eventId?._id || campaign?.eventId || "",
    );
    return campaignEventId && campaignEventId === String(selected?._id || "");
  });

  const hasSelectedAudience = Boolean(selected?.audience?.length);
  const campaignHasAudience = Boolean(selectedCampaign?.audience?.length);
  const audienceApproved = Boolean(selected?.audienceConfirmedAt);

  const displayedAudience = audienceApproved
    ? selected.audience
    : campaignHasAudience
      ? selectedCampaign.audience
      : selected?.audience || [];

  const nextStep = audienceApproved
    ? {
        status: "Campaign ready",
        tone: "ready",
        title: "Continue campaign outreach",
        body: "The audience strategy is approved. Review contact matches, assignments, and outreach activity next.",
        label: "Open outreach",
        path: "/outreach",
      }
    : hasSelectedAudience
      ? {
          status: "Needs approval",
          tone: "attention",
          title: "Approve the selected audience",
          body: "Audience groups have been selected, but Lead Porch will not use them for matching or outreach until you approve them.",
          label: "Approve target audience",
          path: `/events?eventId=${selected._id}&tab=strategy`,
        }
      : campaignHasAudience
        ? {
            status: "Needs confirmation",
            tone: "attention",
            title: "Confirm the targeting brief",
            body: "This campaign already has assigned contacts. Confirming the target audience makes Lead Porch's research, matching, and future outreach use one approved source of truth.",
            label: "Confirm audience",
            path: `/events?eventId=${selected._id}&tab=strategy`,
          }
        : hasAudienceSuggestions
          ? {
              status: "Needs decision",
              tone: "attention",
              title: "Choose the target audience",
              body: "Lead Porch has suggestions from the event listing. Pick the groups this campaign should target, then approve them before matching new contacts.",
              label: "Choose audience",
              path: `/events?eventId=${selected._id}&tab=strategy`,
            }
          : {
              status: "Needs strategy",
              tone: "attention",
              title: "Generate audience recommendations",
              body: "Add or review event strategy so Lead Porch can suggest audience segments before matching contacts.",
              label: "Open audience strategy",
              path: `/events?eventId=${selected._id}&tab=strategy`,
            };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="page-dashboard">
      {/* Page header */}
      <header className="dashboard-header">
        <div>
          <p className="page-eyebrow">Event command center</p>
          <h1 className="dashboard-header__title">Event dashboard</h1>
          <p className="dashboard-header__subtitle">
            Choose one event and see everything that matters in one place.
          </p>
        </div>
        <div className="dashboard-header__actions">
          <Button variant="outline" onClick={() => navigate("/analytics")}>
            Analytics
          </Button>
          <Button variant="outline" onClick={() => navigate("/events")}>
            Events
          </Button>
        </div>
      </header>

      {/* Event navigator */}
      <section
        className="dashboard-navigator"
        aria-label="Choose an event to view"
      >
        <div className="dashboard-navigator__label">
          <FiCalendar aria-hidden="true" />
          <span>
            <small>Currently viewing</small>
            <strong>
              Event {selectedIndex + 1} of {events.length}
            </strong>
          </span>
        </div>

        <div className="dashboard-navigator__select-group">
          <label
            className="dashboard-navigator__select-label"
            htmlFor="dashboard-event-select"
          >
            Switch event
          </label>
          <select
            id="dashboard-event-select"
            className="dashboard-navigator__select"
            value={selected?._id || ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {events.map((event) => (
              <option value={event._id} key={event._id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>

        <div className="dashboard-navigator__arrows">
          <button
            type="button"
            className="dashboard-navigator__arrow"
            onClick={() => moveSelectedEvent(-1)}
            disabled={events.length < 2}
            aria-label="View previous event"
          >
            <FiChevronLeft />
          </button>
          <button
            type="button"
            className="dashboard-navigator__arrow"
            onClick={() => moveSelectedEvent(1)}
            disabled={events.length < 2}
            aria-label="View next event"
          >
            <FiChevronRight />
          </button>
        </div>
      </section>

      {/* Hero banner */}
      <section className="dashboard-hero">
        <div className="dashboard-hero__body">
          <p className="dashboard-hero__date">
            {eventDate(selected)?.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            }) || "Date not set"}
          </p>
          <h2 className="dashboard-hero__name">{selected.name}</h2>
          <p className="dashboard-hero__audience">
            {displayedAudience.length
              ? displayedAudience.join(", ")
              : "Audience strategy still needs approval"}
          </p>
        </div>
        <div className="dashboard-hero__action">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/events")}
          >
            Manage this event
          </Button>
        </div>
      </section>

      {/* Stat cards */}
      <section className="dashboard-stats" aria-label="Key event metrics">
        <StatCard
          title="Tickets sold"
          value={selectedTickets}
          subtitle={selectedGoal ? `${selectedGoal} ticket goal` : "No ticket goal set"}
          icon={<FiTrendingUp />}
          trend={`${selectedProgress}% of goal`}
        />
        <StatCard
          title="Gross revenue"
          value={`$${eventRevenue(selected).toLocaleString()}`}
          subtitle={`${orderCount} orders`}
          icon={<FiDollarSign />}
          trend={`Current price ${ticketRange}`}
        />
        <StatCard
          title="Attendees"
          value={attendeeCount}
          subtitle="Registration records"
          icon={<FiUsers />}
          trend={`${checkedInCount} checked in`}
        />
        <StatCard
          title="Outreach"
          value={outreachCount}
          subtitle="Campaign messages"
          icon={<FiMail />}
          trend={
            selected.audienceConfirmedAt
              ? "Audience approved"
              : "Audience approval needed"
          }
        />
      </section>

      {/* Detail cards */}
      <section className="dashboard-details">
        <DashboardCard title="Ticket goal">
          <div className="goal-card">
            <div className="goal-card__numbers">
              <span className="goal-card__sold">{selectedTickets}</span>
              <span className="goal-card__of">
                of {selectedGoal || "—"} tickets sold
              </span>
              <span className="goal-card__pct">{selectedProgress}%</span>
            </div>
            <div className="goal-card__bar">
              <div
                className="goal-card__bar-fill"
                style={{ width: `${selectedProgress}%` }}
              />
            </div>
            <p className="goal-card__sync">{syncLabel}</p>
          </div>
        </DashboardCard>

        <DashboardCard title="Next step">
          <div className="next-step">
            <span
              className={`next-step__badge next-step__badge--${nextStep.tone}`}
            >
              {nextStep.status}
            </span>
            <h3 className="next-step__title">{nextStep.title}</h3>
            <p className="next-step__body">{nextStep.body}</p>
            <Button size="sm" onClick={() => navigate(nextStep.path)}>
              {nextStep.label}
            </Button>
          </div>
        </DashboardCard>
      </section>
    </div>
  );
}
