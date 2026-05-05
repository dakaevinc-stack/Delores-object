import { useMemo } from 'react'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import { diffDaysIso, pluralizeDays } from '../../domain/siteKpis'
import styles from './SiteReportingSection.module.css'

type Props = {
  reports: readonly BrigadierStoredReport[]
  todayIso: string
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const SHORT_DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
})
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function dayShift(iso: string, days: number): string {
  const dt = isoToDate(iso)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function pluralize(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = Math.abs(n) % 10
  const m100 = Math.abs(n) % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function SiteReportingSection({ reports, todayIso }: Props) {
  const summary = useMemo(() => {
    const sorted = [...reports].sort((a, b) =>
      b.reportedAtIso.localeCompare(a.reportedAtIso),
    )
    const last = sorted[0] ?? null
    const today = sorted.find((r) => r.reportedAtIso.slice(0, 10) === todayIso) ?? null

    // Семидневный «трекер»: точки на каждый из последних 7 дней,
    // включая сегодня. Для каждого дня помечаем, был ли отчёт.
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const iso = dayShift(todayIso, -(6 - i))
      const has = sorted.some((r) => r.reportedAtIso.slice(0, 10) === iso)
      const date = isoToDate(iso)
      return {
        iso,
        weekday: WEEKDAY_FMT.format(date),
        date,
        hasReport: has,
        isToday: iso === todayIso,
      }
    })

    const reportsLast7 = weekDays.filter((d) => d.hasReport).length

    const lastIsoDay = last?.reportedAtIso.slice(0, 10) ?? null
    const daysSinceLast = lastIsoDay ? diffDaysIso(lastIsoDay, todayIso) : null

    const photosToday = today?.attachments.filter((a) => a.kind === 'photo').length ?? 0
    const videosToday = today?.attachments.filter((a) => a.kind === 'video').length ?? 0
    const hasCommentToday = (today?.comment.trim().length ?? 0) > 0
    const problemsToday = today?.problems.length ?? 0
    const problemsLast7 = weekDays
      .filter((d) => d.hasReport)
      .reduce((acc, day) => {
        const r = sorted.find((x) => x.reportedAtIso.slice(0, 10) === day.iso)
        return acc + (r?.problems.length ?? 0)
      }, 0)

    return {
      last,
      today,
      weekDays,
      reportsLast7,
      daysSinceLast,
      photosToday,
      videosToday,
      hasCommentToday,
      problemsToday,
      problemsLast7,
    }
  }, [reports, todayIso])

  // Тон карточки: сданный сегодня — зелёный, вчерашний — внимание,
  // 2+ дней без отчёта или совсем без отчётов — критично.
  const status: 'submitted' | 'overdue' | 'late' | 'empty' = !summary.last
    ? 'empty'
    : summary.today
      ? 'submitted'
      : summary.daysSinceLast !== null && summary.daysSinceLast >= 2
        ? 'overdue'
        : 'late'

  const tone =
    status === 'submitted'
      ? 'normal'
      : status === 'late'
        ? 'attention'
        : status === 'overdue'
          ? 'critical'
          : 'muted'

  const statusLabel = {
    submitted: 'Сдан',
    late: 'Не сдан',
    overdue: 'Просрочен',
    empty: 'Нет отчётов',
  }[status]

  // Главная цифра/строка hero-блока.
  const heroPrimary =
    status === 'empty'
      ? '—'
      : summary.today
        ? 'Сегодня'
        : summary.daysSinceLast === 1
          ? 'Вчера'
          : `${summary.daysSinceLast} ${pluralizeDays(summary.daysSinceLast ?? 0)}`

  const heroSecondary =
    status === 'empty'
      ? 'Отчёты пока не сдавались'
      : summary.today
        ? `${TIME_FMT.format(new Date(summary.today.reportedAtIso))} · ${summary.today.responsible || 'Без подписи'}`
        : summary.last
          ? `${SHORT_DATE_FMT.format(new Date(summary.last.reportedAtIso))} · ${summary.last.responsible || 'Без подписи'}`
          : ''

  const lead =
    status === 'empty'
      ? 'Бригадирские отчёты по объекту ещё не приходили.'
      : status === 'submitted'
        ? 'Сегодняшняя смена закрыта отчётом бригадира.'
        : status === 'late'
          ? 'За сегодня отчёта пока нет.'
          : `Без отчёта ${summary.daysSinceLast} ${pluralizeDays(summary.daysSinceLast ?? 0)} подряд.`

  return (
    <section
      className={`${styles.section} ${styles[`tone_${tone}`]}`}
      aria-labelledby="reporting-heading"
    >
      <div className={styles.sectionHead}>
        <p className={styles.kicker}>
          <img
            className={styles.kickerMark}
            src="/brand-chevron.svg"
            alt=""
            aria-hidden="true"
          />
          <span>Отчётность бригады</span>
        </p>
        <div className={styles.titleRow}>
          <h2 className={styles.sectionTitle} id="reporting-heading">
            Сегодняшний отчёт
          </h2>
          <span className={`${styles.statusPill} ${styles[`statusPill_${tone}`]}`}>
            <span className={styles.statusDot} aria-hidden />
            {statusLabel}
          </span>
        </div>
        <p className={styles.sectionLead}>{lead}</p>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroFigure}>
          <span className={styles.heroValue}>{heroPrimary}</span>
        </div>
        {heroSecondary ? <p className={styles.heroSub}>{heroSecondary}</p> : null}
      </div>

      <div className={styles.week} role="list" aria-label="Отчётность за последние 7 дней">
        {summary.weekDays.map((d) => (
          <div
            key={d.iso}
            role="listitem"
            className={`${styles.weekDay} ${d.hasReport ? styles.weekDayOn : styles.weekDayOff} ${d.isToday ? styles.weekDayToday : ''}`}
            title={`${d.iso}${d.hasReport ? ' — отчёт сдан' : ' — нет отчёта'}`}
          >
            <span className={styles.weekLabel}>{d.weekday}</span>
            <span className={styles.weekDot} aria-hidden />
          </div>
        ))}
      </div>

      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>Фото</dt>
          <dd>{summary.photosToday > 0 ? `${summary.photosToday} шт.` : 'Нет'}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Видео</dt>
          <dd>{summary.videosToday > 0 ? `${summary.videosToday} шт.` : 'Нет'}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Комментарий</dt>
          <dd>{summary.hasCommentToday ? 'Есть' : 'Нет'}</dd>
        </div>
        <div className={`${styles.metric} ${summary.problemsToday > 0 ? styles.metricWarn : ''}`}>
          <dt>Проблемы</dt>
          <dd>
            {summary.problemsToday > 0
              ? `${summary.problemsToday} ${pluralize(summary.problemsToday, ['отметка', 'отметки', 'отметок'])}`
              : 'Нет'}
          </dd>
        </div>
      </dl>

      <div className={styles.footer}>
        <span className={styles.footerText}>
          За 7 дней:{' '}
          <strong className={styles.footerStrong}>
            {summary.reportsLast7}/7 {pluralize(summary.reportsLast7, ['отчёт', 'отчёта', 'отчётов'])}
          </strong>
          {summary.problemsLast7 > 0 ? (
            <>
              {' · '}
              <span className={styles.footerWarn}>
                {summary.problemsLast7}{' '}
                {pluralize(summary.problemsLast7, ['проблема', 'проблемы', 'проблем'])}
              </span>
            </>
          ) : null}
        </span>
      </div>
    </section>
  )
}
