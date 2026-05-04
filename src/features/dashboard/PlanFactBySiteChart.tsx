import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ConstructionSite } from '../../types/constructionSite'
import { planFactGapPoints } from '../../domain/executiveDashboard'
import { CHART } from './chartTheme'
import { DashboardCard } from './DashboardCard'
import { PlanFactBySiteList } from './PlanFactBySiteList'
import { SiteAxisTick } from './SiteAxisTick'
import styles from './PlanFactBySiteChart.module.css'

type Row = { name: string; plan: number; fact: number; gap: number }

export function PlanFactBySiteChart({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const data = useMemo<Row[]>(() => {
    return [...sites]
      .map((s) => ({
        name: s.name,
        plan: s.executive.planPercent,
        fact: s.executive.factPercent,
        gap: planFactGapPoints(s),
      }))
      .sort((a, b) => b.gap - a.gap)
  }, [sites])

  return (
    <DashboardCard
      title="План и факт по объектам"
      description="Сравнение планового и фактического прогресса. Если план выше факта — объект отстаёт; порядок — по величине отставания."
    >
      {/* Мобильный вид: компактный список с прогресс-барами на всю ширину
          и подписью отставания/опережения. На широких экранах скрыт через CSS. */}
      <div className={styles.mobileOnly}>
        <PlanFactBySiteList sites={sites} />
      </div>

      {/* Десктоп: горизонтальный BarChart от recharts.
          На мобильных скрыт через CSS, чтобы не сжимать столбики до 150 px. */}
      <div className={`${styles.chart} ${styles.desktopOnly}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            barCategoryGap={14}
          >
            <CartesianGrid stroke={CHART.grid} strokeDasharray="4 4" horizontal />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              axisLine={{ stroke: CHART.grid }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={212}
              interval={0}
              tick={<SiteAxisTick />}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(28, 75, 130, 0.06)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as Row | undefined
                if (!row) return null
                return (
                  <div
                    style={{
                      background: CHART.tooltipBg,
                      border: `1px solid ${CHART.tooltipBorder}`,
                      borderRadius: 10,
                      fontSize: 13,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                    <div style={{ color: CHART.plan }}>План: {row.plan}%</div>
                    <div style={{ color: CHART.fact }}>Факт: {row.fact}%</div>
                    <div style={{ marginTop: 6, color: '#0f1114' }}>
                      Отставание: {row.gap} п.п.
                    </div>
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13, color: '#3c424b' }} />
            <Bar
              dataKey="plan"
              name="План, %"
              fill={CHART.plan}
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
            />
            <Bar
              dataKey="fact"
              name="Факт, %"
              fill={CHART.fact}
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}
