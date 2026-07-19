import './DashboardCard.css'

export default function DashboardCard({ title, children, action }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card__header">
        <div>
          <h2>{title}</h2>
        </div>
        {action ? <div className="dashboard-card__action">{action}</div> : null}
      </div>
      <div className="dashboard-card__content">{children}</div>
    </section>
  )
}
