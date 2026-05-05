import { useMemo } from 'react'
import type { ConstructionSite } from '../../types/constructionSite'
import { planFactGapPoints } from '../../domain/executiveDashboard'
import { DashboardCard } from './DashboardCard'
import styles from './PlanFactBySiteChart.module.css'

type Row = {
  id: string
  name: string
  plan: number
  fact: number
  gap: number
  status: 'behind' | 'ahead' | 'on_track'
}

const TICKS = [0, 25, 50, 75, 100] as const

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function fmtSigned(n: number): string {
  if (n === 0) return '0'
  if (n > 0) return `+${Math.round(n)}`
  return `−${Math.round(Math.abs(n))}`
}

export function PlanFactBySiteChart({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const rows = useMemo<Row[]>(() => {
    return [...sites]
      .map((s) => {
        // Положительный gap = отстаём (план > факт), отрицательный = опережаем.
        const gap = planFactGapPoints(s)
        const status: Row['status'] =
          gap > 1 ? 'behind' : gap < -1 ? 'ahead' : 'on_track'
        return {
          id: s.id,
          name: s.name,
          plan: s.executive.planPercent,
          fact: s.executive.factPercent,
          gap,
          status,
        }
      })
      .sort((a, b) => b.gap - a.gap)
  }, [sites])

  const summary = useMemo(() => {
    const total = rows.length
    if (total === 0) return { total: 0, avgGap: 0 }
    const sumGap = rows.reduce((acc, r) => acc + r.gap, 0)
    return { total, avgGap: Math.round(sumGap / total) }
  }, [rows])

  return (
    <DashboardCard
      kicker="План и факт"
      title="Сравнение по объектам"
      description="Каждая строка — пара точек «Факт ↔ План». Цветная перемычка показывает, насколько площадка отстаёт или идёт впереди графика."
      meta={
        <span className={styles.metaPill}>
          <span className={styles.metaLabel}>Среднее</span>
          <span
            className={`${styles.metaValue} ${
              summary.avgGap > 1
                ? styles.metaValue_behind
                : summary.avgGap < -1
                  ? styles.metaValue_ahead
                  : ''
            }`}
          >
            {fmtSigned(summary.avgGap)} п.п.
          </span>
        </span>
      }
    >
      <div className={styles.wrap}>
        <ul className={styles.list}>
          {rows.map((r) => {
            const fact = clampPct(r.fact)
            const plan = clampPct(r.plan)
            const lo = Math.min(fact, plan)
            const hi = Math.max(fact, plan)
            const isBehind = r.status === 'behind'
            const isAhead = r.status === 'ahead'

            return (
              <li
                key={r.id}
                className={`${styles.row} ${styles[`row_${r.status}`]}`}
              >
                <div className={styles.rowHead}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.values}>
                    <span className={styles.value}>
                      <span className={styles.valueLabel}>План</span>
                      <span className={`${styles.valueNum} ${styles.valueNum_plan}`}>
                        {Math.round(plan)}
                      </span>
                      <span className={styles.valuePct}>%</span>
                    </span>
                    <span className={styles.valueDivider} aria-hidden>
                      ·
                    </span>
                    <span className={styles.value}>
                      <span className={styles.valueLabel}>Факт</span>
                      <span
                        className={`${styles.valueNum} ${
                          isBehind
                            ? styles.valueNum_behind
                            : isAhead
                              ? styles.valueNum_ahead
                              : styles.valueNum_ontrack
                        }`}
                      >
                        {Math.round(fact)}
                      </span>
                      <span className={styles.valuePct}>%</span>
                    </span>
                  </span>
                  <span
                    className={`${styles.gapPill} ${styles[`gapPill_${r.status}`]}`}
                  >
                    <span className={styles.gapDot} aria-hidden />
                    {r.status === 'on_track'
                      ? 'По графику'
                      : `${fmtSigned(r.gap)} п.п.`}
                  </span>
                </div>

                <div
                  className={styles.track}
                  role="img"
                  aria-label={`${r.name}: план ${Math.round(plan)}%, факт ${Math.round(fact)}%`}
                >
                  <div className={styles.trackBase} aria-hidden />
                  <div className={styles.trackTicks} aria-hidden>
                    {[25, 50, 75].map((t) => (
                      <span
                        key={t}
                        className={styles.trackTick}
                        style={{ left: `${t}%` }}
                      />
                    ))}
                  </div>

                  {/* Тонкий шов от 0 до меньшей точки. */}
                  <span
                    className={styles.spine}
                    style={{ width: `${lo}%` }}
                    aria-hidden
                  />

                  {/* Цветная перемычка между фактом и планом. */}
                  <span
                    className={`${styles.connector} ${
                      isBehind
                        ? styles.connector_behind
                        : isAhead
                          ? styles.connector_ahead
                          : styles.connector_ontrack
                    }`}
                    style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }}
                    aria-hidden
                  />

                  <span
                    className={`${styles.dot} ${styles.dotPlan}`}
                    style={{ left: `${plan}%` }}
                    aria-hidden
                  />
                  <span
                    className={`${styles.dot} ${
                      isBehind
                        ? styles.dotFact_behind
                        : isAhead
                          ? styles.dotFact_ahead
                          : styles.dotFact_ontrack
                    }`}
                    style={{ left: `${fact}%` }}
                    aria-hidden
                  />
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

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotPlan}`} aria-hidden />
            План
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotFact}`} aria-hidden />
            Факт
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendBar} ${styles.legendBar_behind}`} aria-hidden />
            Отстаём
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendBar} ${styles.legendBar_ahead}`} aria-hidden />
            Опережаем
          </span>
        </div>
      </div>
    </DashboardCard>
  )
}
