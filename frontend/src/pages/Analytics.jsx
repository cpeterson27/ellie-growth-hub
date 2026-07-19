import { TrafficPieChart, TicketSalesChart, RevenueBarChart } from '../components/Charts.jsx'
import DashboardCard from '../components/DashboardCard.jsx'

const trafficData = [
  { label: 'Eventbrite', value: 38 },
  { label: 'Email', value: 25 },
  { label: 'Partners', value: 22 },
  { label: 'Social', value: 15 },
]

const salesData = [
  { date: 'Aug 14', tickets: 5 },
  { date: 'Aug 15', tickets: 9 },
  { date: 'Aug 16', tickets: 11 },
  { date: 'Aug 17', tickets: 13 },
  { date: 'Aug 18', tickets: 17 },
  { date: 'Aug 19', tickets: 19 },
]

const revenueData = [
  { campaign: 'Launch', revenue: 5900 },
  { campaign: 'Partners', revenue: 7300 },
  { campaign: 'Organic', revenue: 4100 },
]

export default function Analytics() {
  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Explore the metrics that move your event business.</p>
        </div>
      </div>

      <section className="section-grid">
        <DashboardCard title="Traffic Overview">
          <TrafficPieChart data={trafficData} />
        </DashboardCard>
        <TicketSalesChart data={salesData} />
      </section>

      <section className="section-grid" style={{ marginTop: '1.5rem' }}>
        <RevenueBarChart data={revenueData} />
      </section>
    </div>
  )
}
