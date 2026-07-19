import DashboardCard from '../components/DashboardCard.jsx'

export default function Settings() {
  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your workspace, notifications, and event defaults.</p>
        </div>
      </div>

      <section className="section-grid" style={{ marginTop: '1.5rem' }}>
        <DashboardCard title="Workspace">
          <p>Set default event tags, partner workflows, and calendar sync preferences from one place.</p>
        </DashboardCard>
        <DashboardCard title="Notifications">
          <p>Control update types for campaigns, leads, and partner activity so your team stays aligned.</p>
        </DashboardCard>
      </section>
    </div>
  )
}
