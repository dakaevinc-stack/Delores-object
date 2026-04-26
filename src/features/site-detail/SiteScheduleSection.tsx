import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART } from '../dashboard/chartTheme'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
} from '../../domain/objectStatus'
import type { SiteDetailSchedule } from '../../domain/siteDetailDashboard'
import styles from './SiteScheduleSection.module.css'

type Props = {
  schedule: SiteDetailSchedule
}

const TREND_LABEL: Record<SiteDetailSchedule['trend'], string> = {
  improving: 'Улучшение',
  flat: 'Стабильно',
  worsening: 'Просадка',
}

export function SiteScheduleSection({ schedule }: Props) {
  const token = SITE_STATUS_TOKEN[schedule.timelineStatus]
  const data = schedule.curve.map((p) => ({
    name: p.label,
    План: p.planAlongTime,
    Факт: p.factAlongTime,
  }))

  return (
    <section className={styles.section} aria-labelledby="schedule-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="schedule-heading">
          Сроки и динамика
        </h2>
        <p className={styles.sectionLead}>{schedule.narrative}</p>
      </div>

      <div className={styles.panel}>
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <p className={styles.summaryLabel}>По графику</p>
            <p className={styles.summaryValue}>
              {schedule.onTrack ? 'Да, в коридоре' : 'Есть отставание'}
            </p>
          </div>
          <div className={styles.summaryItem}>
            <p className={styles.summaryLabel}>План по времени</p>
            <p className={styles.summaryValue}>{schedule.planProgressAlongTime}%</p>
          </div>
          <div className={styles.summaryItem}>
            <p className={styles.summaryLabel}>Факт по времени</p>
            <p className={styles.summaryValue}>{schedule.factProgressAlongTime}%</p>
          </div>
          <div className={styles.summaryItem}>
            <p className={styles.summaryLabel}>Динамика</p>
            <p className={styles.summaryValue}>{TREND_LABEL[schedule.trend]}</p>
          </div>
          <div className={styles.summaryItem} data-wide>
            <p className={styles.summaryLabel}>Статус по срокам</p>
            <div className={styles.statusRow}>
              <span className={styles.dot} data-status={token} aria-hidden />
              <p className={styles.summaryValue}>
                {SITE_STATUS_LABEL[schedule.timelineStatus]}
              </p>
            </div>
          </div>
        </div>

        <div className={styles.chartWrap}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fill: CHART.axis, fontSize: 11 }}
                axisLine={{ stroke: CHART.grid }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                width={36}
                tick={{ fill: CHART.axis, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: `1px solid ${CHART.tooltipBorder}`,
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="План"
                stroke={CHART.plan}
                strokeWidth={2.25}
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Факт"
                stroke={CHART.fact}
                strokeWidth={2.25}
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}
