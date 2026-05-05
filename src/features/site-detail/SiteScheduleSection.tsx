import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import {
  buildScheduleCurve,
  pluralizeDays,
  type SiteLiveKpis,
  type SiteLiveKpisStatus,
} from '../../domain/siteKpis'
import type { WorkPlan } from '../../domain/workPlan'
import styles from './SiteScheduleSection.module.css'

type Props = {
  kpis: SiteLiveKpis
  basePlan: WorkPlan | null
  reports: readonly BrigadierStoredReport[]
}

const STATUS_LABEL: Record<SiteLiveKpisStatus, string> = {
  not_started: 'Не начат',
  normal: 'В графике',
  attention: 'Внимание',
  critical: 'Отстаём',
  finished: 'Завершён',
}

const STATUS_TONE: Record<SiteLiveKpisStatus, 'normal' | 'attention' | 'critical' | 'muted'> = {
  not_started: 'muted',
  normal: 'normal',
  attention: 'attention',
  critical: 'critical',
  finished: 'normal',
}

function fmtPct(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

function fmtSignedPct(n: number): string {
  if (n === 0) return '0,0'
  // «Минус» = отстаём, «плюс» = опережаем — так интуитивнее для прораба.
  const sign = n > 0 ? '−' : '+'
  return `${sign}${Math.abs(n).toFixed(1).replace('.', ',')}`
}

type TooltipPayloadEntry = {
  dataKey?: string | number
  value?: number | null
  payload?: { dateIso?: string; label?: string }
}

function ScheduleTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: readonly TooltipPayloadEntry[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const first = payload[0]
  const label = first?.payload?.label ?? ''
  const planRow = payload.find((p) => p.dataKey === 'План')
  const factRow = payload.find((p) => p.dataKey === 'Факт')
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      <div className={styles.tooltipRow}>
        <span className={`${styles.tooltipDot} ${styles.tooltipDotPlan}`} aria-hidden />
        <span className={styles.tooltipLabel}>План</span>
        <span className={styles.tooltipValue}>
          {typeof planRow?.value === 'number' ? `${fmtPct(planRow.value)}%` : '—'}
        </span>
      </div>
      <div className={styles.tooltipRow}>
        <span className={`${styles.tooltipDot} ${styles.tooltipDotFact}`} aria-hidden />
        <span className={styles.tooltipLabel}>Факт</span>
        <span className={styles.tooltipValue}>
          {typeof factRow?.value === 'number' ? `${fmtPct(factRow.value)}%` : '—'}
        </span>
      </div>
    </div>
  )
}

export function SiteScheduleSection({ kpis, basePlan, reports }: Props) {
  const tone = STATUS_TONE[kpis.status]
  const statusLabel = STATUS_LABEL[kpis.status]

  const curve = useMemo(
    () => buildScheduleCurve(basePlan, reports, kpis.startIso, kpis.endIso, kpis.todayIso),
    [basePlan, reports, kpis.startIso, kpis.endIso, kpis.todayIso],
  )

  // recharts работает с массивом записей; ключи «План»/«Факт» — те же,
  // что мы хотим видеть в подписях линий.
  const data = useMemo(
    () =>
      curve.map((p) => ({
        label: p.label,
        dateIso: p.dateIso,
        План: p.planPercent,
        Факт: p.factPercent,
      })),
    [curve],
  )

  // ИСО даты «сегодня» в рядах — для вертикальной риски-метки.
  const todayLabel = useMemo(() => {
    const exact = curve.find((p) => p.dateIso === kpis.todayIso)
    return exact ? exact.label : null
  }, [curve, kpis.todayIso])

  const devNarrative =
    kpis.deviationPercent > 0
      ? `Отстаём от плана на ${fmtPct(kpis.deviationPercent)}%`
      : kpis.deviationPercent < 0
        ? `Опережаем план на ${fmtPct(Math.abs(kpis.deviationPercent))}%`
        : 'Идём ровно по плану'

  return (
    <section
      className={`${styles.section} ${styles[`tone_${tone}`]}`}
      aria-labelledby="schedule-heading"
    >
      <div className={styles.sectionHead}>
        <p className={styles.kicker}>
          <img
            className={styles.kickerMark}
            src="/brand-chevron.svg"
            alt=""
            aria-hidden="true"
          />
          <span>Сроки и динамика</span>
        </p>
        <div className={styles.titleRow}>
          <h2 className={styles.sectionTitle} id="schedule-heading">
            Накопленный факт против плана
          </h2>
          <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>
            <span className={styles.statusDot} aria-hidden />
            {statusLabel}
          </span>
        </div>
        <p className={styles.sectionLead}>{devNarrative}.</p>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>План на сегодня</p>
          <p className={styles.metricValue}>{fmtPct(kpis.planToDatePercent)}%</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Факт</p>
          <p className={styles.metricValue}>{fmtPct(kpis.factPercent)}%</p>
        </div>
        <div className={`${styles.metric} ${styles[`metricDev_${tone}`]}`}>
          <p className={styles.metricLabel}>Отклонение</p>
          <p className={styles.metricValue}>{fmtSignedPct(kpis.deviationPercent)}%</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>До завершения</p>
          <p className={styles.metricValue}>
            {kpis.daysToCompletion}{' '}
            <span className={styles.metricUnit}>{pluralizeDays(kpis.daysToCompletion)}</span>
          </p>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="schedule-fact-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ee2d3a" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#ee2d3a" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="schedule-plan-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#172a4d" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#172a4d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(15,23,42,0.55)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(15,23,42,0.08)' }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              domain={[0, 100]}
              width={36}
              tick={{ fill: 'rgba(15,23,42,0.55)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<ScheduleTooltip />} cursor={{ stroke: 'rgba(15,23,42,0.12)' }} />
            {todayLabel ? (
              <ReferenceLine
                x={todayLabel}
                stroke="#172a4d"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: 'сегодня',
                  position: 'insideTop',
                  fill: '#172a4d',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  dy: -6,
                }}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="План"
              stroke="#172a4d"
              strokeWidth={2}
              fill="url(#schedule-plan-fill)"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="Факт"
              stroke="#ee2d3a"
              strokeWidth={2.4}
              fill="url(#schedule-fact-fill)"
              dot={{ r: 3, strokeWidth: 0, fill: '#ee2d3a' }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="План"
              stroke="transparent"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatchPlan}`} aria-hidden />
            План — линейный календарный график
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.legendSwatchFact}`} aria-hidden />
            Факт — накопленный по отчётам бригадира
          </span>
        </div>
      </div>
    </section>
  )
}
