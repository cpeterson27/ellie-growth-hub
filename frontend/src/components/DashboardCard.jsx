import './DashboardCard.css'

export default function DashboardCard({ title, children, action, className = "" }) {
  return (
    <section className={`dashboard-card ${className}`.trim()}>
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
