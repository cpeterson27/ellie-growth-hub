import './StatCard.css'

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendDirection = 'positive',
}) {
  return (
    <article className="stat-card">
      <div className="stat-card__header">
        <div>
          <p className="stat-card__title">{title}</p>
          <p className="stat-card__value">{value}</p>
        </div>
        {icon ? <div className="stat-card__icon">{icon}</div> : null}
      </div>
      {subtitle ? <p className="stat-card__subtitle">{subtitle}</p> : null}
      {trend ? (
        <span className={`stat-card__trend stat-card__trend--${trendDirection}`}>
          {trend}
        </span>
      ) : null}
    </article>
  )
}
