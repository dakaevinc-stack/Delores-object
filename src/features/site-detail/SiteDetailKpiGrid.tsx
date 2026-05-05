import {
  pluralizeDays,
  type SiteLiveKpis,
  type SiteLiveKpisStatus,
} from '../../domain/siteKpis'
import styles from './SiteDetailKpiGrid.module.css'

type Props = {
  kpis: SiteLiveKpis
  openIssuesCount: number
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
  const sign = n > 0 ? '−' : '+'
  return `${sign}${Math.abs(n).toFixed(1).replace('.', ',')}`
}

export function SiteDetailKpiGrid({ kpis, openIssuesCount }: Props) {
  const tone = STATUS_TONE[kpis.status]
  const statusLabel = STATUS_LABEL[kpis.status]

  // Маркер «сегодня» на шкале прогресса по объекту: показывает,
  // где должны были быть к сегодня по календарному графику.
  const todayMarkerPercent = Math.max(0, Math.min(100, kpis.planToDatePercent))
  const factFillPercent = Math.max(0, Math.min(100, kpis.factPercent))

  // Шкала срока — сколько процентов длительности уже за плечами.
  const periodFillPercent = Math.max(0, Math.min(100, kpis.scheduleProgressPercent))

  const devTone =
    kpis.deviationPercent >= 12
      ? 'critical'
      : kpis.deviationPercent >= 5
        ? 'attention'
        : kpis.deviationPercent <= -1
          ? 'ahead'
          : 'normal'

  return (
    <section className={styles.section} aria-labelledby="site-kpi-heading">
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
          Реальные цифры по объёму работ и срокам — пересчитываются автоматически
          из плана и отчётов бригадира.
        </p>
      </div>

      <div className={styles.grid}>
        {/* ── Прогресс по объекту ─────────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardHero} ${styles[`tone_${tone}`]}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Прогресс по объекту</span>
            <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>
              <span className={styles.statusDot} aria-hidden />
              {statusLabel}
            </span>
          </header>

          <div className={styles.heroFigure}>
            <span className={styles.heroValue}>{fmtPct(kpis.factPercent)}</span>
            <span className={styles.heroSign}>%</span>
          </div>
          <p className={styles.heroSub}>факт по объёмам</p>

          <div className={styles.progressBar} aria-hidden>
            <span
              className={styles.progressFill}
              style={{ width: `${factFillPercent}%` }}
            />
            <span
              className={styles.progressMarker}
              style={{ left: `${todayMarkerPercent}%` }}
            />
          </div>

          <dl className={styles.miniMetrics}>
            <div className={styles.miniMetric}>
              <dt>План на сегодня</dt>
              <dd>{fmtPct(kpis.planToDatePercent)}%</dd>
            </div>
            <div className={styles.miniMetric}>
              <dt>Факт</dt>
              <dd>{fmtPct(kpis.factPercent)}%</dd>
            </div>
          </dl>
        </article>

        {/* ── Срок объекта ────────────────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardSchedule}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Срок</span>
            <span className={styles.scheduleProgress}>
              {Math.round(periodFillPercent)}% срока пройдено
            </span>
          </header>

          <div className={styles.countdown}>
            <span className={styles.countdownNumber}>
              {NUM_FMT.format(kpis.daysToCompletion)}
            </span>
            <span className={styles.countdownUnit}>
              {pluralizeDays(kpis.daysToCompletion)} до завершения
            </span>
          </div>

          <div className={styles.timeline} aria-hidden>
            <span
              className={styles.timelineFill}
              style={{ width: `${periodFillPercent}%` }}
            />
            <span
              className={styles.timelineToday}
              style={{ left: `${periodFillPercent}%` }}
            />
          </div>

          <dl className={styles.timelineMeta}>
            <div className={styles.timelineMetaItem}>
              <dt>Старт</dt>
              <dd title={fmtDate(kpis.startIso)}>{fmtDateShort(kpis.startIso)}</dd>
            </div>
            <div className={styles.timelineMetaItem} data-align="right">
              <dt>Завершение</dt>
              <dd title={fmtDate(kpis.endIso)}>{fmtDateShort(kpis.endIso)}</dd>
            </div>
          </dl>

          <p className={styles.timelineNote}>
            Прошло {NUM_FMT.format(kpis.daysSinceStart)} из{' '}
            {NUM_FMT.format(kpis.daysTotal)} {pluralizeDays(kpis.daysTotal)}
          </p>
        </article>

        {/* ── Отклонение от графика ───────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardDeviation} ${styles[`devTone_${devTone}`]}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Отклонение от графика</span>
            <span className={styles.devTrend} aria-hidden>
              {kpis.deviationPercent > 0 ? (
                /* Падение / отстаём */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 9l7 7 7-7" />
                </svg>
              ) : kpis.deviationPercent < 0 ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                </svg>
              )}
            </span>
          </header>

          <div className={styles.heroFigure}>
            <span className={styles.heroValue}>
              {fmtSignedPct(kpis.deviationPercent)}
            </span>
            <span className={styles.heroSign}>п.п.</span>
          </div>
          <p className={styles.heroSub}>
            {kpis.deviationPercent > 0
              ? 'отстаём от плана на сегодня'
              : kpis.deviationPercent < 0
                ? 'опережаем план на сегодня'
                : 'идём ровно по плану'}
          </p>

          <div className={styles.devCompare}>
            <div className={styles.devRow}>
              <span className={styles.devRowLabel}>План</span>
              <span className={styles.devRowBar}>
                <span
                  className={`${styles.devRowFill} ${styles.devRowFillPlan}`}
                  style={{ width: `${todayMarkerPercent}%` }}
                />
              </span>
              <span className={styles.devRowValue}>{fmtPct(kpis.planToDatePercent)}%</span>
            </div>
            <div className={styles.devRow}>
              <span className={styles.devRowLabel}>Факт</span>
              <span className={styles.devRowBar}>
                <span
                  className={`${styles.devRowFill} ${styles.devRowFillFact}`}
                  style={{ width: `${factFillPercent}%` }}
                />
              </span>
              <span className={styles.devRowValue}>{fmtPct(kpis.factPercent)}%</span>
            </div>
          </div>
        </article>

        {/* ── Замечаний / рисков ──────────────────────────────────────── */}
        <article className={`${styles.card} ${styles.cardIssues}`}>
          <header className={styles.cardHead}>
            <span className={styles.label}>Замечаний / рисков</span>
            {openIssuesCount === 0 ? (
              <span className={`${styles.statusPill} ${styles.statusPill_normal}`}>
                <span className={styles.statusDot} aria-hidden />
                Чисто
              </span>
            ) : null}
          </header>
          <div className={styles.issuesValue}>
            <span className={styles.issuesNumber}>{openIssuesCount}</span>
            <span className={styles.issuesUnit}>
              {openIssuesCount === 0
                ? 'открытых пунктов'
                : 'в работе у руководства'}
            </span>
          </div>
          <p className={styles.issuesHint}>
            {openIssuesCount === 0
              ? 'Замечаний и рисков по объекту нет.'
              : 'Снимаются после устранения и принятия технадзором.'}
          </p>
        </article>
      </div>
    </section>
  )
}
