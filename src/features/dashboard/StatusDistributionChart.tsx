import { useId, type CSSProperties } from 'react'
import {
  Cell,
  Layer,
  Pie,
  PieChart,
  ResponsiveContainer,
  Text,
  Tooltip,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import type { StatusCounts } from '../../domain/executiveDashboard'
import { SITE_STATUS_LABEL } from '../../domain/objectStatus'
import type { SiteStatus } from '../../types/constructionSite'
import { CHART } from './chartTheme'
import { DashboardCard } from './DashboardCard'
import styles from './StatusDistributionChart.module.css'

const STATUS_ORDER: SiteStatus[] = ['normal', 'attention', 'critical']

type Slice = {
  key: SiteStatus
  name: string
  value: number
}

function buildSlices(counts: StatusCounts): Slice[] {
  return STATUS_ORDER.map((key) => ({
    key,
    name: SITE_STATUS_LABEL[key],
    value: counts[key],
  }))
}

const RADIAN = Math.PI / 180

function sliceLabelStyle(name: string | number | undefined): CSSProperties {
  const label = String(name ?? '')
  const dark = label === SITE_STATUS_LABEL.attention
  return {
    fontVariantNumeric: 'tabular-nums',
    paintOrder: 'stroke fill',
    stroke: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.22)',
    strokeWidth: 0.4,
    filter: dark ? 'none' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.32))',
  }
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  return {
    x: cx + Math.cos(-RADIAN * angleDeg) * radius,
    y: cy + Math.sin(-RADIAN * angleDeg) * radius,
  }
}

function renderSliceValue(props: PieLabelRenderProps) {
  const { cx, cy, innerRadius, outerRadius, value, name } = props
  if (!value || value <= 0) return null

  const midAngle =
    typeof props.midAngle === 'number'
      ? props.midAngle
      : (props.startAngle + props.endAngle) / 2
  const radius =
    typeof props.middleRadius === 'number' && props.middleRadius > 0
      ? props.middleRadius
      : (innerRadius + outerRadius) / 2

  const { x, y } = polarToCartesian(cx, cy, radius, midAngle)
  const fill = name === SITE_STATUS_LABEL.attention ? '#0f1114' : '#ffffff'
  return (
    <Text
      x={x}
      y={y}
      fill={fill}
      textAnchor="middle"
      verticalAnchor="middle"
      fontSize={20}
      fontWeight={700}
      style={sliceLabelStyle(name)}
    >
      {value}
    </Text>
  )
}

const LEGEND_DOT: Record<SiteStatus, string> = {
  normal: CHART.ok,
  attention: CHART.warn,
  critical: CHART.bad,
}

function LegendDockFixed({ data, total }: { data: Slice[]; total: number }) {
  return (
    <footer className={styles.legendDock}>
      <ul className={styles.legend}>
        {data.map((d) => {
          const share = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.key} className={styles.legendRow}>
              <span
                className={styles.swatch}
                style={{ background: LEGEND_DOT[d.key] }}
              />
              <span className={styles.legendName}>{d.name}</span>
              <span className={styles.legendVal}>
                <span className={styles.legendCount}>{d.value}</span>
                <span className={styles.legendShare}>{share}%</span>
              </span>
            </li>
          )
        })}
      </ul>
    </footer>
  )
}

export function StatusDistributionChart({ counts }: { counts: StatusCounts }) {
  const data = buildSlices(counts)
  const total = counts.all
  const gid = useId().replace(/:/g, '')

  return (
    <DashboardCard
      title="Распределение по статусам"
      description="Сколько объектов в каждом управленческом статусе — мгновенная сводка портфеля."
    >
      <div className={styles.cardBody}>
        <div className={styles.chartStage}>
          <div className={styles.backdrop} aria-hidden />
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id={`${gid}-g-ok`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3fd07a" />
                  <stop offset="48%" stopColor={CHART.ok} />
                  <stop offset="100%" stopColor="#0f4a26" />
                </linearGradient>
                <linearGradient id={`${gid}-g-warn`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f4d570" />
                  <stop offset="50%" stopColor={CHART.warn} />
                  <stop offset="100%" stopColor="#7a5800" />
                </linearGradient>
                <linearGradient id={`${gid}-g-bad`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f57878" />
                  <stop offset="48%" stopColor={CHART.bad} />
                  <stop offset="100%" stopColor="#681010" />
                </linearGradient>

                <radialGradient id={`${gid}-sheen`} cx="50%" cy="38%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
                  <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>

                <filter
                  id={`${gid}-ring-shadow`}
                  x="-40%"
                  y="-40%"
                  width="180%"
                  height="180%"
                >
                  <feDropShadow
                    dx="0"
                    dy="6"
                    stdDeviation="6"
                    floodColor="#0f1114"
                    floodOpacity="0.18"
                  />
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="1"
                    floodColor="#0f1114"
                    floodOpacity="0.08"
                  />
                </filter>
              </defs>

              <Layer style={{ filter: `url(#${gid}-ring-shadow)` }}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={112}
                  paddingAngle={1.6}
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  cornerRadius={3}
                  labelLine={false}
                  label={(props: PieLabelRenderProps) => renderSliceValue(props)}
                  isAnimationActive
                  animationDuration={720}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.key}
                      fill={`url(#${gid}-g-${d.key === 'normal' ? 'ok' : d.key === 'attention' ? 'warn' : 'bad'})`}
                    />
                  ))}
                </Pie>
              </Layer>

              {/* Сияющий блик сверху на ободе — даёт объём. */}
              <Pie
                data={[{ name: 'sheen', value: 1 }]}
                dataKey="value"
                innerRadius={70}
                outerRadius={112}
                stroke="none"
                isAnimationActive={false}
                fill={`url(#${gid}-sheen)`}
                pointerEvents="none"
              />

              <text
                x="50%"
                textAnchor="middle"
                className={styles.centerGroup}
              >
                <tspan
                  x="50%"
                  y="50%"
                  dy={-4}
                  className={styles.centerTotal}
                >
                  {total}
                </tspan>
                <tspan
                  x="50%"
                  y="50%"
                  dy={26}
                  className={styles.centerCaption}
                >
                  объектов
                </tspan>
              </text>

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as Slice | undefined
                  const raw = payload[0]?.value
                  const value = typeof raw === 'number' ? raw : Number(raw)
                  const countLabel = value === 1 ? 'объект' : 'объектов'
                  const share =
                    Number.isFinite(value) && total > 0
                      ? Math.round((value / total) * 100)
                      : 0
                  return (
                    <div className={styles.tooltip}>
                      <div className={styles.tooltipTitle}>
                        {row?.name ?? 'Статус'}
                      </div>
                      <div className={styles.tooltipValue}>
                        {Number.isFinite(value)
                          ? `${value} ${countLabel} · ${share}%`
                          : '—'}
                      </div>
                    </div>
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <LegendDockFixed data={data} total={total} />
      </div>
    </DashboardCard>
  )
}
