import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
} from '../../domain/objectStatus'
import type { SiteDetailCriterion } from '../../domain/siteDetailDashboard'
import styles from './SiteWorkCriteriaSection.module.css'

type Props = {
  criteria: readonly SiteDetailCriterion[]
}

function fmtInt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

export function SiteWorkCriteriaSection({ criteria }: Props) {
  const order = { critical: 0, attention: 1, normal: 2 } as const
  const worst = [...criteria].sort((a, b) => {
    const bySev = order[a.status] - order[b.status]
    if (bySev !== 0) return bySev
    return a.completionPercent - b.completionPercent
  })[0]

  return (
    <section className={styles.section} aria-labelledby="criteria-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="criteria-heading">
          Критерии выполнения работ
        </h2>
        <p className={styles.sectionLead}>
          Направления, по которым считается здоровье объекта. Сейчас сильнее всего
          давит: <span className={styles.leadEm}>{worst.name}</span> —{' '}
          {SITE_STATUS_LABEL[worst.status].toLowerCase()}.
        </p>
      </div>

      <div className={styles.grid}>
        {criteria.map((c) => {
          const token = SITE_STATUS_TOKEN[c.status]
          const dev = c.deviationUnits
          const devStr =
            dev === 0 ? '0' : dev > 0 ? `+${fmtInt(dev)}` : `${fmtInt(dev)}`

          return (
            <article key={c.id} className={styles.card} data-status={c.status}>
              <div className={styles.cardTop}>
                <div className={styles.nameBlock}>
                  <h3 className={styles.name}>{c.name}</h3>
                  <div className={styles.pillRow}>
                    <span className={styles.dot} data-status={token} aria-hidden />
                    <span className={styles.pill}>{SITE_STATUS_LABEL[c.status]}</span>
                  </div>
                </div>
                <div className={styles.pctBlock} aria-label={`Выполнение ${c.completionPercent} процентов`}>
                  <span className={styles.pct}>{c.completionPercent}</span>
                  <span className={styles.pctSuffix}>%</span>
                </div>
              </div>

              <div className={styles.stats}>
                <div>
                  <p className={styles.statLabel}>План</p>
                  <p className={styles.statVal}>{fmtInt(c.planUnits)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Факт</p>
                  <p className={styles.statVal}>{fmtInt(c.factUnits)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Отклонение</p>
                  <p
                    className={styles.statVal}
                    data-dev={dev === 0 ? 'zero' : dev < 0 ? 'neg' : 'pos'}
                  >
                    {devStr}
                  </p>
                </div>
              </div>

              <div
                className={styles.meter}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={c.completionPercent}
                aria-label={`Прогресс по ${c.name}: ${c.completionPercent}%`}
              >
                <span
                  className={styles.meterFill}
                  data-status={token}
                  style={{ width: `${Math.min(100, c.completionPercent)}%` }}
                />
              </div>

              {c.lagReason ? <p className={styles.note}>{c.lagReason}</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
