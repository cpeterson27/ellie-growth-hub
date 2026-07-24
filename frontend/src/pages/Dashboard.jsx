import { useEffect, useState } from "react";
import {
  FiCalendar,
  FiDollarSign,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import StatCard from "../components/StatCard.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import { TicketSalesChart, RevenueBarChart } from "../components/Charts.jsx";
import {
  fetchEvents,
  fetchOutreach,
  getGrowthOperatorHistory,
} from "../services/api.js";

export default function Dashboard() {
  const [event, setEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [outreach, setOutreach] = useState([]);
  const [loading, setLoading] = useState(true);
  const [growthHistory, setGrowthHistory] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const events = await fetchEvents();
        const activeEvent = events[0] || null;
        setEvents(Array.isArray(events) ? events : []);
        setEvent(activeEvent);
        if (activeEvent) {
          const outreachItems = await fetchOutreach(activeEvent._id);
          setOutreach(outreachItems);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const selectEvent = async (eventId) => {
    const nextEvent = events.find((item) => item._id === eventId) || null;
    setEvent(nextEvent);
    if (!nextEvent) return setOutreach([]);
    try {
      const items = await fetchOutreach(nextEvent._id);
      setOutreach(Array.isArray(items) ? items : items.outreach || []);
    } catch {
      setOutreach([]);
    }
  };

  if (loading) {
    return (
      <div className="page-dashboard">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="page-dashboard">
        <div className="page-header">
          <div>
            <p className="page-subtitle">Event</p>
            <h1 className="page-title">No Event Connected</h1>
            <p className="page-subtitle">
              Connect Eventbrite to import your event data.
            </p>
          </div>
        </div>

        <DashboardCard title="Event Connection">
          <p>
            No event has been connected yet. Connect Eventbrite to sync event
            details, ticket sales, revenue, and attendee information.
          </p>
        </DashboardCard>
      </div>
    );
  }

  const ticketsSold = event.ticketsSold || 0;
  const ticketsGoal = event.ticketGoal || 0;
  const revenue = ticketsSold * (event.ticketPrice || 0);
  const conversionRate =
    ticketsGoal > 0 ? ((ticketsSold / ticketsGoal) * 100).toFixed(1) : "0.0";
  const successRate =
    ticketsGoal > 0
      ? `${Math.min(100, ((ticketsSold / ticketsGoal) * 100).toFixed(0))}% complete`
      : "0% complete";

  const stats = [
    {
      title: "Tickets Sold",
      value: `${ticketsSold} / ${ticketsGoal}`,
      subtitle: "Seats reserved for the event",
      icon: <FiCalendar />,
      trend: ticketsGoal > 0 ? successRate : "",
    },
    {
      title: "Revenue",
      value: `$${revenue}`,
      subtitle: "Event ticket revenue so far",
      icon: <FiDollarSign />,
      trend:
        ticketsSold > 0 ? "Revenue is tracking with sales" : "No revenue yet",
    },
    {
      title: "Conversion Rate",
      value: `${conversionRate}%`,
      subtitle: "Booked tickets vs goal",
      icon: <FiTrendingUp />,
      trend: ticketsGoal > 0 ? "Based on current event progress" : "",
    },
    {
      title: "Outreach Opportunities",
      value: `${outreach.length}`,
      subtitle: "Suggested outreach targets for the event",
      icon: <FiUsers />,
      trend:
        outreach.length > 0
          ? "Awaiting review"
          : "Generate outreach suggestions",
    },
  ];

  const salesData = [
    {
      date: event.startDate
        ? new Date(event.startDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "Event",
      tickets: ticketsSold,
    },
  ];

  const revenueData = [
    {
      campaign: event.name,
      revenue,
    },
  ];

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <p className="page-subtitle">Event</p>
          <h1 className="page-title">{event.name}</h1>
          <p className="page-subtitle">
            {new Date(event.startDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · Ticket Price ${event.ticketPrice}
          </p>
          {events.length > 1 ? (
            <label className="dashboard-event-picker">
              Dashboard event
              <select value={event._id} onChange={(entry) => selectEvent(entry.target.value)}>
                {events.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <section className="section-grid">
        {stats.map((item) => (
          <StatCard
            key={item.title}
            title={item.title}
            value={item.value}
            subtitle={item.subtitle}
            icon={item.icon}
            trend={item.trend}
          />
        ))}
      </section>

      <section className="section-grid" style={{ marginTop: "1.5rem" }}>
        <DashboardCard
          title="Event Progress"
          action={<span className="label-pill">{successRate}</span>}
        >
          <p>Current ticket sales show event momentum and event performance.</p>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{
                width: `${Math.min(100, (ticketsSold / Math.max(1, ticketsGoal)) * 100)}%`,
              }}
            />
          </div>
        </DashboardCard>

        <DashboardCard title="Upcoming Event">
          <div className="upcoming-card">
            <div>
              <p className="stat-card__title">{event.name}</p>
              <p className="page-subtitle">{event.audience?.join(", ")}</p>
            </div>
            <div className="event-meta">
              <span>
                {new Date(event.startDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>Ticket goal: {event.ticketGoal}</span>
            </div>
          </div>
        </DashboardCard>
      </section>

      <section className="section-grid" style={{ marginTop: "1.5rem" }}>
        <TicketSalesChart data={salesData} />
        <RevenueBarChart data={revenueData} />
      </section>
    </div>
  );
}
