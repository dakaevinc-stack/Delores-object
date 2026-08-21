import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
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
  const planPct = Math.round(site.executive.planPercent)
  const ring = Math.max(0, Math.min(100, pct))

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
      </div>

      <div className={styles.hero} data-status={token}>
        <span className={styles.heroRail} aria-hidden />
        <span className={styles.heroGlow} aria-hidden />

        <div className={styles.heroMain}>
          <div className={styles.statusPill} data-status={token}>
            <span className={styles.statusDot} aria-hidden />
            <span className={styles.statusLabel}>{SITE_STATUS_LABEL[status]}</span>
          </div>

          <h1 className={styles.title}>{site.name}</h1>

          <p className={styles.reason}>{dashboard.statusReason}</p>

          {site.address ? (
            <p className={styles.meta}>
              <span className={styles.metaLabel}>Адрес</span>
              <span className={styles.metaValue}>{site.address}</span>
            </p>
          ) : null}
        </div>

        <div
          className={styles.heroStat}
          aria-label={`Выполнение ${pct} процентов, план ${planPct} процентов`}
        >
          <div
            className={styles.ring}
            style={{ '--ring': `${ring}` } as CSSProperties}
            aria-hidden
          >
            <div className={styles.ringInner}>
              <span className={styles.pctValue}>{pct}</span>
              <span className={styles.pctSuffix}>%</span>
            </div>
          </div>
          <div className={styles.statCopy}>
            <span className={styles.pctCaption}>Факт по объекту</span>
            <span className={styles.planLine}>
              План <strong>{planPct}%</strong>
            </span>
            <div className={styles.barTrack} aria-hidden>
              <div className={styles.barPlan} style={{ width: `${Math.min(100, planPct)}%` }} />
              <div className={styles.barFact} style={{ width: `${ring}%` }} />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
