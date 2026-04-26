import type { DailyTelegramReport } from '../../domain/dailyTelegramReport'
import { FieldReportCard } from './FieldReportCard'
import styles from './SiteDailyTelegramReportsSection.module.css'

type Props = {
  siteName: string
  reports: readonly DailyTelegramReport[]
}

function messagesWord(n: number) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'сообщение'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'сообщения'
  return 'сообщений'
}

function formatShortDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function formatPeriod(reports: readonly DailyTelegramReport[]): string | null {
  const dates = reports
    .map((r) => r.reportedAtIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))

  if (dates.length === 0) return null

  const min = new Date(Math.min(...dates))
  const max = new Date(Math.max(...dates))
  const fmt = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

  if (min.toDateString() === max.toDateString()) return fmt(min)
  return `${fmt(min)} — ${fmt(max)}`
}

export function SiteDailyTelegramReportsSection({ siteName, reports }: Props) {
  if (reports.length === 0) return null

  const dated = reports.every((r) => Boolean(r.reportedAtIso))
  // Лента приходит уже отсортированной по убыванию даты, поэтому [0] — самая свежая сводка.
  const latest = reports[0]
  const latestDate = formatShortDate(latest.reportedAtIso)
  const period = formatPeriod(reports)

  return (
    <section className={styles.section} aria-labelledby="tg-reports-heading">
      <div className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden="true"
            />
            <span>Лента площадки</span>
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="tg-reports-heading">
              Суточные сводки из Telegram
            </h2>
            <span className={styles.sourceBadge}>
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M21.7 2.3a1 1 0 0 0-1.06-.23L2.74 9.34a1 1 0 0 0 .07 1.88l6.5 1.94 1.94 6.5a1 1 0 0 0 1.86.1l7.84-17.4a1 1 0 0 0-.25-1.06ZM10.7 14.18 9.6 17.92l-1.4-4.7 6.6-6.6-4.1 7.56Z" />
              </svg>
              Источник · Telegram
            </span>
          </div>

          <p className={styles.lead}>
            Объект «{siteName}» — {reports.length} {messagesWord(reports.length)} в том виде,
            как приходят с площадки.
            {dated
              ? ' Даты и время — по переписке; лента отсортирована от новых к более ранним.'
              : ' Часть записей может быть без даты в источнике.'}
            {' '}Ресурсы в сводке ниже — по свежей записи
            {latestDate ? ` (${latestDate})` : ''}.
          </p>

          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Сообщений</dt>
              <dd className={styles.summaryValue}>{reports.length}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Рабочие</dt>
              <dd className={styles.summaryValue}>{latest.workers}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>ИТР</dt>
              <dd className={styles.summaryValue}>{latest.itr}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Техника, ед.</dt>
              <dd className={styles.summaryValue}>{latest.equipmentUnits}</dd>
            </div>
            {period ? (
              <div className={`${styles.summaryItem} ${styles.summaryItemWide}`}>
                <dt className={styles.summaryLabel}>Период</dt>
                <dd className={styles.summaryValue}>{period}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className={styles.list}>
        {reports.map((r) => (
          <FieldReportCard
            key={r.id}
            accent="telegram"
            badgeKicker="Telegram"
            badge={`Сводка №${r.sequence}`}
            dateTimeIso={r.reportedAtIso}
            lines={r.lines}
            metrics={[
              { id: 'w', value: String(r.workers), label: 'Рабочие', tone: 'navy' },
              { id: 'i', value: String(r.itr), label: 'ИТР', tone: 'navy' },
              {
                id: 'e',
                value: `${r.equipmentUnits} ед.`,
                label: 'Техника',
                tone: 'red',
              },
            ]}
            chips={[{ id: 'p', text: `Ответственный: ${r.responsible}`, tone: 'muted' }]}
          />
        ))}
      </div>
    </section>
  )
}
