import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiDollarSign, FiGrid, FiTrendingUp, FiUsers } from "react-icons/fi";
import StatCard from "../components/StatCard.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import Button from "../components/Button.jsx";
import { TicketSalesChart, RevenueBarChart } from "../components/Charts.jsx";
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

  const totals = useMemo(() => events.reduce((sum, event) => ({
    tickets: sum.tickets + Number(event.ticketsSold || 0),
    revenue: sum.revenue + eventRevenue(event),
    attendees: sum.attendees + Number(event.eventbriteLogistics?.attendeeCount || 0),
    checkedIn: sum.checkedIn + Number(event.eventbriteLogistics?.checkedIn || 0),
  }), { tickets: 0, revenue: 0, attendees: 0, checkedIn: 0 }), [events]);

  if (loading) return <div className="page-dashboard"><p>Loading dashboard…</p></div>;
  if (!events.length) return <div className="page-dashboard"><div className="page-header"><div><h1 className="page-title">Business dashboard</h1><p className="page-subtitle">Create or import your first event to begin tracking performance.</p></div><Button onClick={() => navigate("/events")}>Open Events</Button></div></div>;

  const selectedTickets = Number(selected?.ticketsSold || 0);
  const selectedGoal = Number(selected?.ticketGoal || 0);
  const selectedProgress = selectedGoal ? Math.min(100, Math.round((selectedTickets / selectedGoal) * 100)) : 0;
  const salesData = [...events].sort((a, b) => (eventDate(a) || 0) - (eventDate(b) || 0)).map((event) => ({
    date: eventDate(event)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) || "TBD",
    tickets: Number(event.ticketsSold || 0),
  }));
  const revenueData = events.map((event) => ({ campaign: event.name.length > 18 ? `${event.name.slice(0, 18)}…` : event.name, revenue: eventRevenue(event) }));

  return <div className="page-dashboard dashboard-portfolio">
    <div className="page-header">
      <div><p className="page-eyebrow">Portfolio overview</p><h1 className="page-title">Business dashboard</h1><p className="page-subtitle">See every event first, then open the performance details that need attention.</p></div>
      <div className="dashboard-header-actions"><Button variant="outline" onClick={() => navigate("/analytics")}>Full analytics</Button><Button onClick={() => navigate("/events")}>Manage events</Button></div>
    </div>

    <section className="dashboard-stat-grid">
      <StatCard title="Events" value={events.length} subtitle="Imported and created events" icon={<FiCalendar />} trend={`${events.filter((event) => (eventDate(event) || 0) >= new Date()).length} upcoming`} />
      <StatCard title="Tickets sold" value={totals.tickets} subtitle="Across every event" icon={<FiTrendingUp />} trend={`${totals.attendees} attendee records`} />
      <StatCard title="Gross revenue" value={`$${totals.revenue.toLocaleString()}`} subtitle="Synchronized event revenue" icon={<FiDollarSign />} trend="Across all tracked events" />
      <StatCard title="Checked in" value={totals.checkedIn} subtitle="Live attendance activity" icon={<FiUsers />} trend={totals.attendees ? `${Math.round((totals.checkedIn / totals.attendees) * 100)}% of attendees` : "No attendee data yet"} />
    </section>

    <section className="dashboard-main-grid">
      <DashboardCard title="Event performance" action={<Button variant="outline" size="sm" onClick={() => navigate("/events")}>Manage event</Button>}>
        <div className="event-navigator" aria-label="Choose an event to view">
          <div className="event-navigator__label">
            <FiCalendar aria-hidden="true" />
            <span><small>Viewing event</small><strong>{selectedIndex + 1} of {events.length}</strong></span>
          </div>
          <label className="event-navigator__select">
            <span className="sr-only">Selected event</span>
            <select value={selected?._id || ""} onChange={(event) => setSelectedId(event.target.value)}>
              {events.map((event) => <option value={event._id} key={event._id}>{event.name}</option>)}
            </select>
          </label>
          <div className="event-navigator__buttons">
            <button type="button" onClick={() => moveSelectedEvent(-1)} disabled={events.length < 2} aria-label="View previous event"><FiChevronLeft /></button>
            <button type="button" onClick={() => moveSelectedEvent(1)} disabled={events.length < 2} aria-label="View next event"><FiChevronRight /></button>
          </div>
        </div>
        <div className="selected-event-summary">
          <p className="page-eyebrow">{eventDate(selected)?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) || "Date not set"}</p>
          <h2>{selected.name}</h2>
          <p>{selected.audience?.join(", ") || "Audience strategy not approved yet"}</p>
          <div className="selected-event-kpis"><span><strong>{selectedProgress}%</strong> ticket goal</span><span><strong>{outreachCount}</strong> outreach records</span><span><strong>${eventRevenue(selected).toLocaleString()}</strong> gross</span></div>
          <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${selectedProgress}%` }} /></div>
        </div>
      </DashboardCard>
      <DashboardCard title="All events" action={<Button variant="outline" size="sm" onClick={() => navigate("/events")}><FiGrid /> Open event workspace</Button>}>
        <p className="event-directory-help">Choose any event below to display its performance above.</p>
        <div className="event-portfolio-list">
          {events.map((event) => {
            const goal = Number(event.ticketGoal || 0);
            const sold = Number(event.ticketsSold || 0);
            return <button className={selected?._id === event._id ? "is-selected" : ""} key={event._id} onClick={() => setSelectedId(event._id)}>
              <div><strong>{event.name}</strong><span>{eventDate(event)?.toLocaleDateString() || "Date not set"}</span></div>
              <div><strong>{sold}{goal ? ` / ${goal}` : ""}</strong><span>tickets</span></div>
              <div><strong>${eventRevenue(event).toLocaleString()}</strong><span>gross</span></div>
              <span className="event-row-state">{selected?._id === event._id ? "Viewing" : "View"}</span>
            </button>;
          })}
        </div>
      </DashboardCard>
    </section>

    <section className="dashboard-chart-grid"><TicketSalesChart data={salesData} /><RevenueBarChart data={revenueData} /></section>
  </div>;
}
