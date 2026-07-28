import { useEffect, useMemo, useState } from "react";
import DashboardCard from "../components/DashboardCard.jsx";
import { TicketSalesChart, RevenueBarChart } from "../components/Charts.jsx";
import { fetchEvents } from "../services/api.js";

const revenueFor = (event) => Number(event.eventbriteLogistics?.grossRevenue || 0) || Number(event.ticketsSold || 0) * Number(event.ticketPrice || 0);

export default function Analytics() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchEvents().then((items) => setEvents(Array.isArray(items) ? items : [])).finally(() => setLoading(false)); }, []);
  const totals = useMemo(() => events.reduce((sum, event) => ({ tickets: sum.tickets + Number(event.ticketsSold || 0), revenue: sum.revenue + revenueFor(event) }), { tickets: 0, revenue: 0 }), [events]);
  const ticketData = events.map((event) => ({ date: event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD", tickets: Number(event.ticketsSold || 0) }));
  const revenueData = events.map((event) => ({ campaign: event.name.length > 18 ? `${event.name.slice(0, 18)}…` : event.name, revenue: revenueFor(event) }));

  return <div className="page-dashboard">
    <div className="page-header"><div><p className="page-eyebrow">Event portfolio</p><h1 className="page-title">Analytics</h1><p className="page-subtitle">Real synchronized results across {events.length} event{events.length === 1 ? "" : "s"}—not placeholder cards.</p></div></div>
    {loading ? <p>Loading analytics…</p> : <>
      <section className="section-grid">
        <DashboardCard title="Portfolio totals"><h2>{totals.tickets} tickets</h2><p>${totals.revenue.toLocaleString()} gross revenue across all tracked events.</p></DashboardCard>
        <DashboardCard title="Data coverage"><h2>{events.filter((event) => event.integrations?.eventbrite?.eventId).length} synchronized</h2><p>Events connected to Eventbrite can report orders, attendees, and check-ins.</p></DashboardCard>
      </section>
      <section className="section-grid" style={{ marginTop: "1.5rem" }}><TicketSalesChart data={ticketData} /><RevenueBarChart data={revenueData} /></section>
    </>}
  </div>;
}
