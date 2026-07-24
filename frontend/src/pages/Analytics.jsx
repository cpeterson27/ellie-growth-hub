import DashboardCard from "../components/DashboardCard.jsx";

export default function Analytics() {
  const metrics = ["Revenue", "Ticket sales", "Campaign conversion", "Partner performance", "Contact growth", "Outreach delivery"];
  return <div className="page-dashboard"><div className="page-header"><div><h1 className="page-title">Analytics</h1><p className="page-subtitle">Live business reporting will appear here as campaigns, outreach, ticketing, and partner attribution produce data.</p></div></div><section className="section-grid">{metrics.map((metric) => <DashboardCard key={metric} title={metric}><div className="table-state table-state--empty">No live data is available yet. Historical sample data has been removed.</div></DashboardCard>)}</section></div>;
}
