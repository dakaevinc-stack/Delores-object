import { Link } from 'react-router-dom'
import type { ConstructionSite } from '../../types/constructionSite'
import { completionPercent } from '../../domain/executiveDashboard'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
  resolveSiteStatus,
} from '../../domain/objectStatus'
import styles from './ObjectCard.module.css'

type Props = {
  site: ConstructionSite
}

export function ObjectCard({ site }: Props) {
  const status = resolveSiteStatus(site)
  const token = SITE_STATUS_TOKEN[status]
  const label = SITE_STATUS_LABEL[status]
  const pct = completionPercent(site)

  return (
    <Link
      className={styles.card}
      to={`/objects/${site.id}`}
      aria-label={`${site.name}, статус: ${label}, выполнение ${pct}%`}
    >
      <div className={styles.top}>
        <div className={styles.leftMeta}>
          <span className={styles.dot} data-status={token} aria-hidden />
          <span className={styles.status}>{label}</span>
        </div>
        <div className={styles.rightMeta}>
          {site.executive.hasOpenRisks ? (
            <span className={styles.risk}>Риски</span>
          ) : null}
          <span className={styles.pct} aria-hidden>
            {pct}%
          </span>
        </div>
      </div>

      <h2 className={styles.title}>{site.name}</h2>

      <div
        className={styles.progress}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Фактическое выполнение: ${pct}%`}
      >
        <span className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>

      <p className={styles.summary}>{site.executive.summaryLine}</p>

      <p className={styles.hint}>Подробнее по объекту</p>
    </Link>
  )
}
