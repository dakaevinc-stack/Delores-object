import {
  pluralizeDays,
  type SiteLiveKpis,
  type SiteLiveKpisStatus,
} from '../../domain/siteKpis'
import styles from './SiteDetailKpiGrid.module.css'

type Props = {
  kpis: SiteLiveKpis
  /** Без своей шапки — когда сверху уже зона «Сводка по объекту». */
  embedded?: boolean
}

const NUM_FMT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

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

function fmtDate(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fmtDateShort(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}

function fmtPct(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

function fmtSignedPct(n: number): string {
  if (n === 0) return '0,0'
  // Отстаём → знак «минус», опережаем → «плюс».
  const sign = n > 0 ? '−' : '+'
  return `${sign}${Math.abs(n).toFixed(1).replace('.', ',')}`
}

export function SiteDetailKpiGrid({ kpis, embedded = false }: Props) {
  const tone = STATUS_TONE[kpis.status]
  const statusLabel = STATUS_LABEL[kpis.status]

  // Маркер «сегодня» на шкале прогресса по объекту: показывает,
  // где должны были быть к сегодня по календарному графику.
  const todayMarkerPercent = Math.max(0, Math.min(100, kpis.planToDatePercent))
  const factFillPercent = Math.max(0, Math.min(100, kpis.factPercent))
  const periodFillPercent = Math.max(0, Math.min(100, kpis.scheduleProgressPercent))

  const devTone =
    kpis.deviationPercent >= 12
      ? 'critical'
      : kpis.deviationPercent >= 5
        ? 'attention'
        : kpis.deviationPercent <= -1
          ? 'ahead'
          : 'normal'

  const devNarrative =
    kpis.deviationPercent > 0
      ? 'отстаём от плана на сегодня'
      : kpis.deviationPercent < 0
        ? 'опережаем план на сегодня'
        : 'идём ровно по плану'

  return (
    <section
      className={`${styles.section} ${embedded ? styles.sectionEmbedded : ''}`}
      aria-labelledby={embedded ? 'site-zone-manager-title' : 'site-kpi-heading'}
    >
      {embedded ? null : (
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden="true"
            />
            <span>Сводка по объекту</span>
          </p>
          <h2 className={styles.sectionTitle} id="site-kpi-heading">
            Ключевые показатели
          </h2>
          <p className={styles.sectionLead}>
            Прогресс, сроки и отклонение от плана — из графика работ и отчётов бригадира.
          </p>
        </div>
      )}

      <div className={styles.grid}>
        {/* ── Прогресс ─────────────────────────────────────────────── */}
        <article className={`${styles.card} ${styles[`tone_${tone}`]}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Прогресс по объекту</span>
            <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>
              <span className={styles.statusDot} aria-hidden />
              {statusLabel}
            </span>
          </header>

          <div className={styles.figure}>
            <span className={styles.figureValue}>{fmtPct(kpis.factPercent)}</span>
            <span className={styles.figureSign}>%</span>
          </div>
          <p className={styles.figureSub}>факт по объёмам</p>

          <div className={styles.bar} aria-hidden>
            <span
              className={styles.barFill}
              style={{ width: `${factFillPercent}%` }}
            />
            <span
              className={styles.barMarker}
              style={{ left: `${todayMarkerPercent}%` }}
            />
          </div>

          <dl className={styles.metaRow}>
            <div className={styles.metaCell}>
              <dt>План на сегодня</dt>
              <dd>{fmtPct(kpis.planToDatePercent)}%</dd>
            </div>
            <div className={styles.metaCell}>
              <dt>Факт</dt>
              <dd>{fmtPct(kpis.factPercent)}%</dd>
            </div>
          </dl>
        </article>

        {/* ── Срок ─────────────────────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardSchedule}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Срок</span>
            <span className={styles.scheduleProgress}>
              {Math.round(periodFillPercent)}% срока пройдено
            </span>
          </header>

          <div className={styles.figure}>
            <span className={styles.figureValue}>
              {NUM_FMT.format(kpis.daysToCompletion)}
            </span>
            <span className={styles.figureSign}>
              {pluralizeDays(kpis.daysToCompletion)}
            </span>
          </div>
          <p className={styles.figureSub}>до завершения</p>

          <div className={styles.bar} aria-hidden>
            <span
              className={styles.barFill}
              style={{ width: `${periodFillPercent}%` }}
            />
            <span
              className={styles.barMarker}
              style={{ left: `${periodFillPercent}%` }}
            />
          </div>

          <dl className={styles.metaRow}>
            <div className={styles.metaCell}>
              <dt>Старт</dt>
              <dd title={fmtDate(kpis.startIso)}>{fmtDateShort(kpis.startIso)}</dd>
            </div>
            <div className={styles.metaCell} data-align="right">
              <dt>Завершение</dt>
              <dd title={fmtDate(kpis.endIso)}>{fmtDateShort(kpis.endIso)}</dd>
            </div>
          </dl>
        </article>

        {/* ── Отклонение ───────────────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardDeviation} ${styles[`devTone_${devTone}`]}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Отклонение от графика</span>
          </header>

          <div className={styles.figure}>
            <span className={styles.figureValue}>
              {fmtSignedPct(kpis.deviationPercent)}
            </span>
            <span className={styles.figureSign}>%</span>
          </div>
          <p className={styles.figureSub}>{devNarrative}</p>

          <div className={styles.compareRow}>
            <span className={styles.compareLabel}>План</span>
            <span className={styles.compareBar}>
              <span
                className={`${styles.compareFill} ${styles.compareFillPlan}`}
                style={{ width: `${todayMarkerPercent}%` }}
              />
            </span>
            <span className={styles.compareValue}>{fmtPct(kpis.planToDatePercent)}%</span>
          </div>
          <div className={styles.compareRow}>
            <span className={styles.compareLabel}>Факт</span>
            <span className={styles.compareBar}>
              <span
                className={`${styles.compareFill} ${styles.compareFillFact}`}
                style={{ width: `${factFillPercent}%` }}
              />
            </span>
            <span className={styles.compareValue}>{fmtPct(kpis.factPercent)}%</span>
          </div>
        </article>
      </div>
    </section>
  )
}
