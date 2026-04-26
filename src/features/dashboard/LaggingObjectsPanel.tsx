import { Link } from 'react-router-dom'
import type { ConstructionSite } from '../../types/constructionSite'
import { selectLaggingSites } from '../../domain/executiveDashboard'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
  resolveSiteStatus,
} from '../../domain/objectStatus'
import { DashboardCard } from './DashboardCard'
import styles from './LaggingObjectsPanel.module.css'

export function LaggingObjectsPanel({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const rows = selectLaggingSites(sites, 2)

  return (
    <DashboardCard
      title="Отставание факта от плана"
      description="Объекты, где фактический прогресс заметно ниже планового — приоритет для совещаний и решений."
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>
          Значимого отставания по портфелю не зафиксировано (порог 2 п.п.).
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map(({ site, gapPoints }) => {
            const st = resolveSiteStatus(site)
            const token = SITE_STATUS_TOKEN[st]
            return (
              <li key={site.id} className={styles.row}>
                <Link className={styles.link} to={`/objects/${site.id}`}>
                  <div className={styles.top}>
                    <span
                      className={styles.dot}
                      data-status={token}
                      aria-hidden
                    />
                    <span className={styles.name}>{site.name}</span>
                    <span className={styles.gap}>−{gapPoints} п.п.</span>
                  </div>
                  <div className={styles.meta}>
                    <span className={styles.pill}>{SITE_STATUS_LABEL[st]}</span>
                    <span className={styles.sub}>
                      План {site.executive.planPercent}% · факт{' '}
                      {site.executive.factPercent}%
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
