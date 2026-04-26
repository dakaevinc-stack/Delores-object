import { Link } from 'react-router-dom'
import type { ConstructionSite } from '../../types/constructionSite'
import { selectProblemStages } from '../../domain/executiveDashboard'
import { DashboardCard } from './DashboardCard'
import styles from './ProblemStagesPanel.module.css'

export function ProblemStagesPanel({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const rows = selectProblemStages(sites, { minGapPoints: 6, limit: 8 })

  return (
    <DashboardCard
      title="Проблемные этапы и зоны"
      description="Этапы, где факт существенно ниже плана — точки давления по срокам и ресурсам."
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>
          Критичных отклонений по этапам в mock-данных ниже порога не найдено.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={`${r.siteId}-${r.stage.id}`} className={styles.row}>
              <Link className={styles.link} to={`/objects/${r.siteId}`}>
                <div className={styles.titleRow}>
                  <span className={styles.stage}>{r.stage.name}</span>
                  <span className={styles.gap}>−{r.gapPoints} п.п.</span>
                </div>
                <div className={styles.sub}>
                  <span className={styles.site}>{r.siteName}</span>
                  <span className={styles.sep} aria-hidden>
                    ·
                  </span>
                  <span className={styles.nums}>
                    план {r.stage.planPercent}% → факт {r.stage.factPercent}%
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
