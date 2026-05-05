import { useMemo } from 'react'
import type { ConstructionSite, SiteStatus } from '../../types/constructionSite'
import { completionPercent } from '../../domain/executiveDashboard'
import { resolveSiteStatus, SITE_STATUS_LABEL } from '../../domain/objectStatus'
import { DashboardCard } from './DashboardCard'
import styles from './CompletionBySiteChart.module.css'

type Row = {
  id: string
  name: string
  fact: number
  status: SiteStatus
}

const TICKS = [0, 25, 50, 75, 100] as const

const STATUS_TONE: Record<SiteStatus, 'normal' | 'attention' | 'critical'> = {
  normal: 'normal',
  attention: 'attention',
  critical: 'critical',
}

export function CompletionBySiteChart({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const data = useMemo<Row[]>(() => {
    return [...sites]
      .sort((a, b) => completionPercent(a) - completionPercent(b))
      .map((s) => ({
        id: s.id,
        name: s.name,
        fact: completionPercent(s),
        status: resolveSiteStatus(s),
      }))
  }, [sites])

  const counts = useMemo(() => {
    const total = data.length
    const min = total > 0 ? Math.min(...data.map((d) => d.fact)) : 0
    const max = total > 0 ? Math.max(...data.map((d) => d.fact)) : 0
    const avg =
      total > 0
        ? Math.round(data.reduce((acc, d) => acc + d.fact, 0) / total)
        : 0
    return { total, min, max, avg }
  }, [data])

  return (
    <DashboardCard
      kicker="Готовность портфеля"
      title="Фактическое выполнение по объектам"
      description="Сверху — объекты, по которым нужна ближайшая оперативка: готовность ниже среднего по портфелю."
      meta={
        <span className={styles.metaPill}>
          <span className={styles.metaLabel}>Среднее</span>
          <span className={styles.metaValue}>{counts.avg}%</span>
        </span>
      }
    >
      <div className={styles.wrap}>
        <ul className={styles.list}>
          {data.map((row) => {
            const visible = Math.max(0, Math.min(100, row.fact))
            const widthPct = Math.max(2, visible)
            const tone = STATUS_TONE[row.status]
            return (
              <li key={row.id} className={`${styles.row} ${styles[`tone_${tone}`]}`}>
                <div className={styles.rowHead}>
                  <span className={styles.name}>{row.name}</span>
                  <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>
                    <span className={styles.statusDot} aria-hidden />
                    {SITE_STATUS_LABEL[row.status]}
                  </span>
                  <span className={styles.value}>
                    <span className={styles.valueNum}>{visible}</span>
                    <span className={styles.valuePct}>%</span>
                  </span>
                </div>
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={visible}
                  aria-label={`${row.name}: ${SITE_STATUS_LABEL[row.status]}, факт ${visible}%`}
                >
                  <div className={styles.trackTicks} aria-hidden>
                    {[25, 50, 75].map((t) => (
                      <span
                        key={t}
                        className={styles.trackTick}
                        style={{ left: `${t}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className={styles.fill}
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className={styles.sheen} aria-hidden />
                    <span className={styles.cap} aria-hidden />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className={styles.scale} aria-hidden>
          {TICKS.map((t) => (
            <span key={t} className={styles.scaleTick} style={{ left: `${t}%` }}>
              <span className={styles.scaleLabel}>{t}%</span>
            </span>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}
