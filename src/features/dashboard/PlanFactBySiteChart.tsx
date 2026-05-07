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

/**
 * Внутренне `gap = planFactGapPoints(s)` положителен, когда фактический %
 * НИЖЕ планового, т.е. «отстаём». Для пользователя такой знак
 * контр-интуитивен (отставание со знаком «+»). Поэтому в UI мы
 * показываем «расстояние факта от плана»: при отставании — со
 * знаком «−», при опережении — со знаком «+».
 *
 * Передавайте сюда величину уже в «пользовательской» системе
 * (то есть `-gap` для строк/среднего), функция только форматирует
 * число со знаком и Unicode-минусом U+2212 (он визуально шире
 * hyphen-minus и в премиум-наборе чисел смотрится опрятнее).
 */
function fmtSigned(displayValue: number): string {
  if (displayValue === 0) return '0'
  if (displayValue > 0) return `+${Math.round(displayValue)}`
  return `−${Math.round(Math.abs(displayValue))}`
}

function GapIcon({ status }: { status: Row['status'] }) {
  if (status === 'on_track') {
    return (
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden focusable="false">
        <path
          d="m3.5 8.5 3 3 6-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  // ↑ для «опережаем», ↓ для «отстаём» — цвет наследуем из пилла.
  const upward = status === 'ahead'
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden focusable="false">
      <path
        d={upward ? 'M8 12.5V3.5M4 7.5l4-4 4 4' : 'M8 3.5v9M4 8.5l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
            {/* В UI — «расстояние факта от плана»: отстаём → −,
                опережаем → +. См. fmtSigned. */}
            {fmtSigned(-summary.avgGap)}%
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
                    <span className={styles.gapIcon} aria-hidden>
                      <GapIcon status={r.status} />
                    </span>
                    {r.status === 'on_track'
                      ? 'По графику'
                      : `${fmtSigned(-r.gap)}%`}
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
