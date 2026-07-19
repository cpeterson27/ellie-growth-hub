import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import './Charts.css'

export function TicketSalesChart({ data }) {
  return (
    <div className="chart-card">
      <h3>Ticket Sales</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 24, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis dataKey="date" stroke="#8f93a7" />
          <YAxis stroke="#8f93a7" />
          <Tooltip />
          <Line type="monotone" dataKey="tickets" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RevenueBarChart({ data }) {
  return (
    <div className="chart-card">
      <h3>Revenue by Campaign</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 24, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis dataKey="campaign" stroke="#8f93a7" />
          <YAxis stroke="#8f93a7" />
          <Tooltip />
          <Bar dataKey="revenue" fill="#5b4bff" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TrafficPieChart({ data }) {
  const palette = ['#5b4bff', '#3b82f6', '#14b8a6', '#f59e0b']
  return (
    <div className="chart-card chart-card--compact">
      <h3>Traffic Sources</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            outerRadius={95}
            innerRadius={52}
            paddingAngle={5}
          >
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend verticalAlign="bottom" height={46} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
