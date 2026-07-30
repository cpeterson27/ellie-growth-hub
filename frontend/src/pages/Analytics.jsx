import { useEffect, useMemo, useState } from "react";
import DashboardCard from "../components/DashboardCard.jsx";
import { TicketSalesChart, RevenueBarChart } from "../components/Charts.jsx";
import { fetchEvents, fetchOutreachAnalytics } from "../services/api.js";
import "./Analytics.css";

const revenueFor = (event) => Number(event.eventbriteLogistics?.grossRevenue || 0) || Number(event.ticketsSold || 0) * Number(event.ticketPrice || 0);
const rate = (value, total) => total ? `${Math.round((value / total) * 100)}%` : "—";

export default function Analytics() {
  const [events, setEvents] = useState([]);
  const [outreach, setOutreach] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchEvents(), fetchOutreachAnalytics()])
      .then(([eventItems, outreachData]) => {
        setEvents(Array.isArray(eventItems) ? eventItems : []);
        setOutreach(outreachData);
      })
      .finally(() => setLoading(false));
  }, []);
  const totals = useMemo(() => events.reduce((sum, event) => ({
    tickets: sum.tickets + Number(event.ticketsSold || 0),
    revenue: sum.revenue + revenueFor(event),
  }), { tickets: 0, revenue: 0 }), [events]);
  const email = outreach?.totals || {};
  const ticketData = events.map((event) => ({
    date: event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD",
    tickets: Number(event.ticketsSold || 0),
  }));
  const revenueData = events.map((event) => ({
    campaign: event.name.length > 18 ? `${event.name.slice(0, 18)}…` : event.name,
    revenue: revenueFor(event),
  }));

  return <div className="page-dashboard analytics-page">
    <div className="page-header"><div><p className="page-eyebrow">Growth intelligence</p><h1 className="page-title">Analytics</h1><p className="page-subtitle">One view of campaign delivery, engagement, replies, registrations, and revenue.</p></div><span className={outreach?.webhook?.healthy ? "analytics-health is-healthy" : "analytics-health"}>{outreach?.webhook?.healthy ? `Tracking live · ${outreach.webhook.lastEventType}` : "Waiting for first tracked email event"}</span></div>
    {loading ? <p>Loading analytics…</p> : <>
      <section className="analytics-metrics">
        <DashboardCard title="Accepted by Resend"><strong>{email.sent || 0}</strong><span>campaign emails</span></DashboardCard>
        <DashboardCard title="Delivered"><strong>{email.delivered || 0}</strong><span>{rate(email.delivered, email.sent)} of accepted</span></DashboardCard>
        <DashboardCard title="Opened"><strong>{email.opened || 0}</strong><span>{rate(email.opened, email.delivered)} of delivered</span></DashboardCard>
        <DashboardCard title="Replied"><strong>{email.replied || 0}</strong><span>{rate(email.replied, email.delivered || email.sent)} response rate</span></DashboardCard>
        <DashboardCard title="Bounced"><strong>{email.bounced || 0}</strong><span>{rate(email.bounced, email.sent)} bounce rate</span></DashboardCard>
      </section>
      <DashboardCard title="Campaign performance">
        <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Campaign</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Replied</th><th>Bounced</th></tr></thead><tbody>{(outreach?.byCampaign || []).map((campaign) => <tr key={campaign.id}><td><strong>{campaign.name}</strong><small>{campaign.status}</small></td><td>{campaign.sent}</td><td>{campaign.delivered}</td><td>{campaign.opened}</td><td>{campaign.clicked}</td><td>{campaign.replied}</td><td>{campaign.bounced}</td></tr>)}</tbody></table></div>
      </DashboardCard>
      <section className="analytics-portfolio">
        <DashboardCard title="Event portfolio"><h2>{totals.tickets} tickets</h2><p>${totals.revenue.toLocaleString()} gross revenue across {events.length} tracked event{events.length === 1 ? "" : "s"}.</p></DashboardCard>
        <DashboardCard title="Data coverage"><h2>{events.filter((event) => event.integrations?.eventbrite?.eventId).length} synchronized</h2><p>Eventbrite-connected events can report orders, attendees, and check-ins.</p></DashboardCard>
      </section>
      <section className="analytics-charts"><TicketSalesChart data={ticketData} /><RevenueBarChart data={revenueData} /></section>
    </>}
  </div>;
}
