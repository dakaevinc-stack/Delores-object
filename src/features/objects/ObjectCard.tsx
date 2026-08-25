import { Link } from 'react-router-dom'
import type { ConstructionSite } from '../../types/constructionSite'
import { completionPercent } from '../../domain/executiveDashboard'
import { daysUntil } from '../../domain/fleet'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
  resolveSiteStatus,
} from '../../domain/objectStatus'
import styles from './ObjectCard.module.css'

type Props = {
  site: ConstructionSite
}

function deadlineMeta(site: ConstructionSite): string {
  if (!site.endDateIso) return 'Срок не задан'
  const days = daysUntil(site.endDateIso)
  const dateLabel = new Date(site.endDateIso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
  if (days < 0) return `Просрочено · ${Math.abs(days)} дн.`
  if (days === 0) return `Срок сегодня · ${dateLabel}`
  return `До ${dateLabel} · ${days} дн.`
}

export function ObjectCard({ site }: Props) {
  const status = resolveSiteStatus(site)
  const token = SITE_STATUS_TOKEN[status]
  const label = SITE_STATUS_LABEL[status]
  const fact = completionPercent(site)
  const plan = site.executive.planPercent
  const meta = deadlineMeta(site)
  const delta = fact - plan

  return (
    <Link
      className={styles.card}
      to={`/objects/${site.id}`}
      aria-label={`${site.name}, ${label}, факт ${fact}%, план ${plan}%, ${meta}`}
    >
      <span className={styles.face}>
        <span className={styles.specular} aria-hidden />
        <span className={styles.caustic} aria-hidden />

        <div className={styles.head}>
          <span className={styles.dot} data-status={token} aria-hidden />
          <span className={styles.status}>{label}</span>
          {site.executive.hasOpenRisks ? (
            <span className={styles.risk}>Риск</span>
          ) : null}
          <span className={styles.pct}>{fact}%</span>
        </div>

        <h2 className={styles.title}>{site.name}</h2>

        <div
          className={styles.track}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fact}
          aria-label={`Факт ${fact}%, план ${plan}%`}
        >
          <span className={styles.trackPlan} style={{ width: `${plan}%` }} />
          <span className={styles.trackFact} style={{ width: `${fact}%` }} />
        </div>

        <div className={styles.foot}>
          <p className={styles.meta}>{meta}</p>
          <p className={styles.delta} data-tone={delta >= 0 ? 'up' : 'down'}>
            {delta > 0 ? `+${delta}` : delta} к плану
          </p>
        </div>
      </span>
    </Link>
  )
}
