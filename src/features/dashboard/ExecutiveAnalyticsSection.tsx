import type { ConstructionSite } from '../../types/constructionSite'
import type { StatusCounts } from '../../domain/executiveDashboard'
import { CompletionBySiteChart } from './CompletionBySiteChart'
import { LaggingObjectsPanel } from './LaggingObjectsPanel'
import { PlanFactBySiteChart } from './PlanFactBySiteChart'
import { ProblemStagesPanel } from './ProblemStagesPanel'
import { StatusDistributionChart } from './StatusDistributionChart'
import styles from './ExecutiveAnalyticsSection.module.css'

type Props = {
  sites: readonly ConstructionSite[]
  counts: StatusCounts
}

export function ExecutiveAnalyticsSection({ sites, counts }: Props) {
  return (
    <section className={styles.section} aria-labelledby="analytics-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="analytics-heading">
          Аналитика для решений
        </h2>
        <p className={styles.sectionLead}>
          Визуализации привязаны к плану и факту по объектам: отставание, критика и
          зоны риска видны без дополнительных пояснений.
        </p>
      </div>

      <div className={styles.gridTop}>
        <StatusDistributionChart counts={counts} />
        <CompletionBySiteChart sites={sites} />
      </div>

      <div className={styles.gridFull}>
        <PlanFactBySiteChart sites={sites} />
      </div>

      <div className={styles.gridBottom}>
        <LaggingObjectsPanel sites={sites} />
        <ProblemStagesPanel sites={sites} />
      </div>
    </section>
  )
}
