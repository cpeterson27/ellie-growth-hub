import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiDollarSign, FiMail, FiTrendingUp, FiUsers } from "react-icons/fi";
import StatCard from "../components/StatCard.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";
import { fetchEvents, fetchOutreach } from "../services/api.js";
import "./Dashboard.css";

const eventRevenue = (event) => Number(event.eventbriteLogistics?.grossRevenue || 0) || (Number(event.ticketsSold || 0) * Number(event.ticketPrice || 0));
const eventDate = (event) => event.startDate ? new Date(event.startDate) : null;

export default function Dashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [outreachCount, setOutreachCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents().then((items) => {
      const list = Array.isArray(items) ? items : [];
      setEvents(list);
      setSelectedId(list[0]?._id || "");
    }).finally(() => setLoading(false));
  }, []);

  const selected = events.find((event) => event._id === selectedId) || events[0];
  const selectedIndex = Math.max(0, events.findIndex((event) => event._id === selected?._id));
  const moveSelectedEvent = (direction) => {
    if (events.length < 2) return;
    const nextIndex = (selectedIndex + direction + events.length) % events.length;
    setSelectedId(events[nextIndex]._id);
  };
  useEffect(() => {
    if (!selected?._id) return setOutreachCount(0);
    fetchOutreach(selected._id).then((items) => setOutreachCount((Array.isArray(items) ? items : items?.outreach || []).length)).catch(() => setOutreachCount(0));
  }, [selected?._id]);

  if (loading) return <div className="page-dashboard"><p>Loading dashboard…</p></div>;
  if (!events.length) return <div className="page-dashboard"><div className="page-header"><div><h1 className="page-title">Business dashboard</h1><p className="page-subtitle">Create or import your first event to begin tracking performance.</p></div><Button onClick={() => navigate("/events")}>Open Events</Button></div></div>;

  const selectedTickets = Number(selected?.ticketsSold || 0);
  const selectedGoal = Number(selected?.ticketGoal || 0);
  const selectedProgress = selectedGoal ? Math.min(100, Math.round((selectedTickets / selectedGoal) * 100)) : 0;
  const logistics = selected?.eventbriteLogistics || {};
  const attendeeCount = Number(logistics.attendeeCount || 0);
  const checkedInCount = Number(logistics.checkedInCount || 0);
  const orderCount = Number(logistics.orderCount || 0);
  const ticketRange = logistics.minimumCheckoutPrice
    ? logistics.maximumCheckoutPrice && logistics.maximumCheckoutPrice !== logistics.minimumCheckoutPrice
      ? `$${Number(logistics.minimumCheckoutPrice).toLocaleString()}–$${Number(logistics.maximumCheckoutPrice).toLocaleString()}`
      : `$${Number(logistics.minimumCheckoutPrice).toLocaleString()}`
    : selected.ticketPrice
      ? `$${Number(selected.ticketPrice).toLocaleString()} base`
      : "Not set";
  const syncLabel = logistics.lastSyncedAt
    ? `Synced ${new Date(logistics.lastSyncedAt).toLocaleString()}`
    : "Eventbrite data has not synced yet";

  return <div className="page-dashboard dashboard-portfolio">
    <div className="page-header">
      <div><p className="page-eyebrow">Event command center</p><h1 className="page-title">Event dashboard</h1><p className="page-subtitle">Choose one event and see everything that matters in one place.</p></div>
      <div className="dashboard-header-actions"><Button variant="outline" onClick={() => navigate("/analytics")}>Full analytics</Button><Button onClick={() => navigate("/events")}>Manage events</Button></div>
    </div>

    <section className="dashboard-event-picker" aria-label="Choose an event to view">
      <div className="event-navigator__label">
        <FiCalendar aria-hidden="true" />
        <span><small>Currently viewing</small><strong>Event {selectedIndex + 1} of {events.length}</strong></span>
      </div>
      <label className="event-navigator__select">
        <span>Switch event</span>
        <select value={selected?._id || ""} onChange={(event) => setSelectedId(event.target.value)}>
          {events.map((event) => <option value={event._id} key={event._id}>{event.name}</option>)}
        </select>
      </label>
      <div className="event-navigator__buttons">
        <button type="button" onClick={() => moveSelectedEvent(-1)} disabled={events.length < 2} aria-label="View previous event"><FiChevronLeft /></button>
        <button type="button" onClick={() => moveSelectedEvent(1)} disabled={events.length < 2} aria-label="View next event"><FiChevronRight /></button>
      </div>
    </section>

    <section className="dashboard-event-hero">
      <div className="selected-event-summary">
        <p className="page-eyebrow">{eventDate(selected)?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) || "Date not set"}</p>
        <h2>{selected.name}</h2>
        <p>{selected.audience?.join(", ") || "Audience strategy still needs approval"}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => navigate("/events")}>Manage this event</Button>
    </section>

    <section className="dashboard-stat-grid dashboard-stat-grid--event">
      <StatCard title="Tickets sold" value={selectedTickets} subtitle={selectedGoal ? `${selectedGoal} ticket goal` : "No ticket goal set"} icon={<FiTrendingUp />} trend={`${selectedProgress}% of goal`} />
      <StatCard title="Gross revenue" value={`$${eventRevenue(selected).toLocaleString()}`} subtitle={`${orderCount} orders`} icon={<FiDollarSign />} trend={`Current price ${ticketRange}`} />
      <StatCard title="Attendees" value={attendeeCount} subtitle="Registration records" icon={<FiUsers />} trend={`${checkedInCount} checked in`} />
      <StatCard title="Outreach" value={outreachCount} subtitle="Campaign messages" icon={<FiMail />} trend={selected.audienceConfirmedAt ? "Audience approved" : "Audience approval needed"} />
    </section>

    <section className="dashboard-detail-grid">
      <DashboardCard title="Ticket goal">
        <div className="selected-event-summary">
          <div className="ticket-goal-heading"><strong>{selectedTickets}</strong><span>of {selectedGoal || "—"} tickets sold</span><b>{selectedProgress}%</b></div>
          <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${selectedProgress}%` }} /></div>
          <p className="dashboard-sync-note">{syncLabel}</p>
        </div>
      </DashboardCard>
      <DashboardCard title="Next step">
        <div className="dashboard-next-step">
          <span className={selected.audienceConfirmedAt ? "is-ready" : "needs-attention"}>{selected.audienceConfirmedAt ? "Campaign ready" : "Needs attention"}</span>
          <h3>{selected.audienceConfirmedAt ? "Continue campaign outreach" : "Approve the target audience"}</h3>
          <p>{selected.audienceConfirmedAt ? "The audience strategy is approved. Review campaign assignments and outreach activity next." : "Review Ellie’s suggested audience before using it to filter contacts or create outreach."}</p>
          <Button size="sm" onClick={() => navigate(selected.audienceConfirmedAt ? "/outreach" : "/events")}>{selected.audienceConfirmedAt ? "Open outreach" : "Review event strategy"}</Button>
        </div>
      </DashboardCard>
    </section>
  </div>;
}
