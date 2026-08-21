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
  const planPct = Math.round(site.executive.planPercent)
  const factPct = Math.max(0, Math.min(100, pct))

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

        <div className={styles.heroTop}>
          <div className={styles.statusLine}>
            <span className={styles.dot} data-status={token} aria-hidden />
            <span className={styles.statusLabel}>{SITE_STATUS_LABEL[status]}</span>
            {site.address ? (
              <>
                <span className={styles.statusSep} aria-hidden>
                  ·
                </span>
                <span className={styles.address}>{site.address}</span>
              </>
            ) : null}
          </div>

          <div
            className={styles.heroStat}
            aria-label={`Факт ${pct} процентов, план ${planPct} процентов`}
          >
            <p className={styles.pct}>
              <span className={styles.pctValue}>{pct}</span>
              <span className={styles.pctSuffix}>%</span>
            </p>
            <p className={styles.pctCaption}>факт</p>
          </div>
        </div>

        <h1 className={styles.title}>{site.name}</h1>
        <p className={styles.reason}>{dashboard.statusReason}</p>

        <div className={styles.progressBlock}>
          <div
            className={styles.barTrack}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={factPct}
            aria-label="Фактическое выполнение"
          >
            <div className={styles.barFact} style={{ width: `${factPct}%` }} />
            <span
              className={styles.planMark}
              style={{ left: `${Math.max(0, Math.min(100, planPct))}%` }}
              title={`План ${planPct}%`}
              aria-hidden
            />
          </div>
          <div className={styles.progressMeta}>
            <span>
              План <strong>{planPct}%</strong>
            </span>
            <span>
              Факт <strong>{pct}%</strong>
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
