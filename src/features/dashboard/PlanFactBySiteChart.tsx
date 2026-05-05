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
      description="Цветная полоса — фактическое выполнение, вертикальная отметка — где объект должен быть по плану. Расстояние между ними — отставание или опережение."
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
            {fmtSigned(summary.avgGap)}%
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
                    <span className={styles.valueDivider} aria-hidden>
                      ·
                    </span>
                    <span className={styles.value}>
                      <span className={styles.valueLabel}>План</span>
                      <span className={`${styles.valueNum} ${styles.valueNum_plan}`}>
                        {Math.round(plan)}
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
                      : `${fmtSigned(r.gap)}%`}
                  </span>
                </div>

                <div
                  className={styles.track}
                  role="img"
                  aria-label={`${r.name}: факт ${Math.round(fact)}%, план ${Math.round(plan)}%`}
                >
                  {/* Серая дорожка-фон. */}
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

                  {/* Заливка факта — главный сигнал. Цвет — по статусу. */}
                  <div
                    className={`${styles.factFill} ${
                      isBehind
                        ? styles.factFill_behind
                        : isAhead
                          ? styles.factFill_ahead
                          : styles.factFill_ontrack
                    }`}
                    style={{ width: `${fact}%` }}
                    aria-hidden
                  >
                    <span className={styles.factSheen} aria-hidden />
                  </div>

                  {/* Заштрихованный «долг» — только когда отстаём:
                      зона от факта до плановой отметки. */}
                  {isBehind && (
                    <div
                      className={styles.gapZone}
                      style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }}
                      aria-hidden
                    />
                  )}

                  {/* Лёгкий «бонус» — когда опережаем: подсветка
                      участка от плана до факта. */}
                  {isAhead && (
                    <div
                      className={styles.bonusZone}
                      style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }}
                      aria-hidden
                    />
                  )}

                  {/* Плановая отметка — где объект должен быть. */}
                  <div
                    className={styles.planMarker}
                    style={{ left: `${plan}%` }}
                    aria-hidden
                  >
                    <span className={styles.planMarkerLine} />
                    <span className={styles.planMarkerCap} />
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

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendBar} ${styles.legendBar_fact}`}
              aria-hidden
            />
            Факт
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendMarker} aria-hidden />
            План
          </span>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendHatch} ${styles.legendHatch_behind}`}
              aria-hidden
            />
            Отставание
          </span>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendHatch} ${styles.legendHatch_ahead}`}
              aria-hidden
            />
            Опережение
          </span>
        </div>
      </div>
    </DashboardCard>
  )
}
