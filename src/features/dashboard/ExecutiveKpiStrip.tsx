import type { StatusCounts } from '../../domain/executiveDashboard'
import { SITE_STATUS_LABEL } from '../../domain/objectStatus'
import styles from './ExecutiveKpiStrip.module.css'

type Props = {
  counts: StatusCounts
}

function sharePercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

export function ExecutiveKpiStrip({ counts }: Props) {
  const total = counts.all
  const okShare = sharePercent(counts.normal, total)
  const warnShare = sharePercent(counts.attention, total)
  const badShare = sharePercent(counts.critical, total)

  return (
    <section className={styles.wrap} aria-label="Ключевые показатели по объектам">
      <ul className={styles.grid}>
        <li className={`${styles.item} ${styles.itemHero}`}>
          <div className={styles.heroHead}>
            <span className={styles.heroKicker}>Портфель</span>
          </div>
          <p className={styles.heroLabel}>Действующих объектов</p>
          <p className={styles.heroValue}>{counts.all}</p>
          <p className={styles.heroHint}>В работе на сегодня</p>
          <div className={styles.heroFootline} aria-hidden />
        </li>

        <li className={`${styles.item} ${styles.ok}`}>
          <span className={styles.cardStripe} aria-hidden />
          <span className={styles.cardDot} aria-hidden />
          <p className={styles.label}>{SITE_STATUS_LABEL.normal}</p>
          <p className={styles.value}>{counts.normal}</p>
          <p className={styles.hint}>В графике, без критики</p>
          <div className={styles.shareRow}>
            <span className={styles.shareLabel}>Доля портфеля</span>
            <span className={styles.shareVal}>{okShare}%</span>
          </div>
          <div className={styles.shareTrack} aria-hidden>
            <span
              className={`${styles.shareFill} ${styles.shareFillOk}`}
              style={{ width: `${okShare}%` }}
            />
          </div>
        </li>

        <li className={`${styles.item} ${styles.warn}`}>
          <span className={styles.cardStripe} aria-hidden />
          <span className={styles.cardDot} aria-hidden />
          <p className={styles.label}>{SITE_STATUS_LABEL.attention}</p>
          <p className={styles.value}>{counts.attention}</p>
          <p className={styles.hint}>Нужен контроль</p>
          <div className={styles.shareRow}>
            <span className={styles.shareLabel}>Доля портфеля</span>
            <span className={styles.shareVal}>{warnShare}%</span>
          </div>
          <div className={styles.shareTrack} aria-hidden>
            <span
              className={`${styles.shareFill} ${styles.shareFillWarn}`}
              style={{ width: `${warnShare}%` }}
            />
          </div>
        </li>

        <li className={`${styles.item} ${styles.bad}`}>
          <span className={styles.cardStripe} aria-hidden />
          <span className={styles.cardDot} aria-hidden />
          <p className={styles.label}>{SITE_STATUS_LABEL.critical}</p>
          <p className={styles.value}>{counts.critical}</p>
          <p className={styles.hint}>Срочные решения</p>
          <div className={styles.shareRow}>
            <span className={styles.shareLabel}>Доля портфеля</span>
            <span className={styles.shareVal}>{badShare}%</span>
          </div>
          <div className={styles.shareTrack} aria-hidden>
            <span
              className={`${styles.shareFill} ${styles.shareFillBad}`}
              style={{ width: `${badShare}%` }}
            />
          </div>
        </li>
      </ul>
    </section>
  )
}
