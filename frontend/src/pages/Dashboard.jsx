import { FiCalendar, FiDollarSign, FiTrendingUp, FiUsers } from 'react-icons/fi'
import StatCard from '../components/StatCard.jsx'
import DashboardCard from '../components/DashboardCard.jsx'
import { TicketSalesChart, RevenueBarChart } from '../components/Charts.jsx'

const stats = [
  {
    title: 'Tickets Sold',
    value: '32 / 50',
    subtitle: 'Seats reserved for the next event',
    icon: <FiCalendar />, 
    trend: '+12% this week',
  },
  {
    title: 'Revenue',
    value: '$15,904',
    subtitle: 'Estimated earnings from paid tickets',
    icon: <FiDollarSign />,
    trend: '+18% month over month',
  },
  {
    title: 'Conversion Rate',
    value: '8.4%',
    subtitle: 'Lead-to-sale percentage for the campaign',
    icon: <FiTrendingUp />,
    trend: '+1.2% compared to last week',
  },
  {
    title: 'Partners Active',
    value: '14',
    subtitle: 'Creators and affiliates working with this event',
    icon: <FiUsers />,
    trend: '+4 partners onboarded',
  },
]

const salesData = [
  { date: 'Aug 12', tickets: 6 },
  { date: 'Aug 13', tickets: 8 },
  { date: 'Aug 14', tickets: 10 },
  { date: 'Aug 15', tickets: 9 },
  { date: 'Aug 16', tickets: 12 },
  { date: 'Aug 17', tickets: 14 },
  { date: 'Aug 18', tickets: 16 },
]

const revenueData = [
  { campaign: 'Launch', revenue: 5600 },
  { campaign: 'Partnership', revenue: 7200 },
  { campaign: 'Email', revenue: 3100 },
]

export default function Dashboard() {
  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <p className="page-subtitle">Event</p>
          <h1 className="page-title">Deal To Close Bootcamp</h1>
          <p className="page-subtitle">August 22, 2026 · Ticket Price $497</p>
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

      <section className="section-grid" style={{ marginTop: '1.5rem' }}>
        <DashboardCard
          title="Campaign Progress"
          action={<span className="label-pill">64% complete</span>}
        >
          <p>Launch workflows and creative briefs are currently ahead of schedule for the next event.</p>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: '64%' }} />
          </div>
        </DashboardCard>

        <DashboardCard title="Upcoming Event">
          <div className="upcoming-card">
            <div>
              <p className="stat-card__title">Deal To Close Bootcamp</p>
              <p className="page-subtitle">Accelerate ticket sales, outreach, and partner success.</p>
            </div>
            <div className="event-meta">
              <span>Aug 22, 2026</span>
              <span>Live workshop · Hybrid</span>
            </div>
          </div>
        </DashboardCard>
      </section>

      <section className="section-grid" style={{ marginTop: '1.5rem' }}>
        <TicketSalesChart data={salesData} />
        <RevenueBarChart data={revenueData} />
      </section>
    </div>
  )
}
