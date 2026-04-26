import { Link } from 'react-router-dom'
import { completionPercent } from '../../domain/executiveDashboard'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
  resolveSiteStatus,
} from '../../domain/objectStatus'
import type { SiteDetailDashboard } from '../../domain/siteDetailDashboard'
import type { ConstructionSite } from '../../types/constructionSite'
import styles from './SiteDetailHeader.module.css'

type Props = {
  site: ConstructionSite
  dashboard: SiteDetailDashboard
}

export function SiteDetailHeader({ site, dashboard }: Props) {
  const status = resolveSiteStatus(site)
  const token = SITE_STATUS_TOKEN[status]
  const pct = completionPercent(site)

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <Link
          className={styles.back}
          to="/"
          aria-label="Вернуться к обзору портфеля"
        >
          <span className={styles.backIcon} aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              focusable="false"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </span>
          <span className={styles.backLabel}>Назад</span>
        </Link>
        <div className={styles.meta}>
          <span className={styles.code}>{dashboard.meta.objectCode}</span>
          {dashboard.meta.addressNote ? (
            <>
              <span className={styles.metaSep} aria-hidden>
                ·
              </span>
              <span className={styles.metaNote}>{dashboard.meta.addressNote}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.statusLine}>
            <span className={styles.dot} data-status={token} aria-hidden />
            <span className={styles.statusLabel}>{SITE_STATUS_LABEL[status]}</span>
          </div>
          <h1 className={styles.title}>{site.name}</h1>
          <p className={styles.reason}>{dashboard.statusReason}</p>
        </div>
        <div
          className={styles.heroStat}
          aria-label={`Выполнение ${pct} процентов`}
        >
          <span className={styles.pctValue}>{pct}</span>
          <span className={styles.pctSuffix}>%</span>
          <span className={styles.pctCaption}>факт по объекту</span>
        </div>
      </div>
    </header>
  )
}
