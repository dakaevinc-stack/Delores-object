import type { ConstructionSite } from '../../types/constructionSite'
import { planFactGapPoints } from '../../domain/executiveDashboard'
import styles from './PlanFactBySiteList.module.css'

type Row = {
  id: string
  name: string
  plan: number
  fact: number
  gap: number
}

function pluralizePoints(n: number): string {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return 'п.п.'
  return 'п.п.'
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/**
 * Мобильная версия графика «План и факт по объектам».
 * Каждый объект — строка с двумя прогресс-барами (план, факт)
 * и микро-подписью отставания/опережения.
 *
 * На десктопе скрыта через CSS media-query, на мобиле — единственный
 * видимый рендер. Так читается на 100% ширины экрана без уродливых
 * полоконных столбиков, которые получаются у horizontal BarChart на 360 px.
 */
export function PlanFactBySiteList({
  sites,
}: {
  sites: readonly ConstructionSite[]
}) {
  const rows: Row[] = [...sites]
    .map((s) => ({
      id: s.id,
      name: s.name,
      plan: s.executive.planPercent,
      fact: s.executive.factPercent,
      gap: planFactGapPoints(s),
    }))
    .sort((a, b) => b.gap - a.gap)

  if (rows.length === 0) {
    return <p className={styles.empty}>Нет данных по объектам.</p>
  }

  return (
    <ol className={styles.list} aria-label="Список объектов с планом и фактом">
      {rows.map((r) => {
        const gapKind: 'behind' | 'ahead' | 'onTrack' =
          r.gap > 1 ? 'behind' : r.gap < -1 ? 'ahead' : 'onTrack'
        return (
          <li key={r.id} className={styles.row}>
            <div className={styles.head}>
              <span className={styles.name}>{r.name}</span>
              <span
                className={`${styles.gap} ${
                  gapKind === 'behind'
                    ? styles.gap_behind
                    : gapKind === 'ahead'
                      ? styles.gap_ahead
                      : styles.gap_ontrack
                }`}
              >
                {gapKind === 'behind'
                  ? `−${Math.abs(Math.round(r.gap))} ${pluralizePoints(r.gap)}`
                  : gapKind === 'ahead'
                    ? `+${Math.abs(Math.round(r.gap))} ${pluralizePoints(r.gap)}`
                    : 'по графику'}
              </span>
            </div>

            <dl className={styles.bars}>
              <div className={styles.barRow}>
                <dt className={styles.barLabel}>План</dt>
                <dd className={styles.barValueGroup}>
                  <span
                    className={`${styles.track} ${styles.track_plan}`}
                    aria-hidden
                  >
                    <span
                      className={`${styles.fill} ${styles.fill_plan}`}
                      style={{ width: `${clamp01(r.plan)}%` }}
                    />
                  </span>
                  <span className={styles.barValue}>{Math.round(r.plan)}%</span>
                </dd>
              </div>

              <div className={styles.barRow}>
                <dt className={styles.barLabel}>Факт</dt>
                <dd className={styles.barValueGroup}>
                  <span
                    className={`${styles.track} ${styles.track_fact}`}
                    aria-hidden
                  >
                    <span
                      className={`${styles.fill} ${styles.fill_fact}`}
                      style={{ width: `${clamp01(r.fact)}%` }}
                    />
                  </span>
                  <span className={styles.barValue}>{Math.round(r.fact)}%</span>
                </dd>
              </div>
            </dl>
          </li>
        )
      })}
    </ol>
  )
}
