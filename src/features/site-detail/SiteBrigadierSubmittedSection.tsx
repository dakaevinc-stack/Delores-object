import { useMemo } from 'react'
import {
  brigadierProblemKindLabel,
  type BrigadierStoredReport,
} from '../../domain/brigadierReport'
import { FieldReportCard } from './FieldReportCard'
import styles from './SiteBrigadierSubmittedSection.module.css'

type Props = {
  siteName: string
  reports: readonly BrigadierStoredReport[]
  serverBacked?: boolean
  onRemoveReport: (id: string) => void | Promise<void>
}

function reportsWord(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'отчёт'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'отчёта'
  return 'отчётов'
}

function formatShortDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function formatPeriod(reports: readonly BrigadierStoredReport[]): string | null {
  const ts = reports
    .map((r) => r.reportedAtIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))

  if (ts.length === 0) return null

  const min = new Date(Math.min(...ts))
  const max = new Date(Math.max(...ts))
  const fmt = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })

  if (min.toDateString() === max.toDateString()) return fmt(min)
  return `${fmt(min)} — ${fmt(max)}`
}

/**
 * Берём 0..2 уникальных ответственных по последним записям —
 * чтобы в шапке поместился короткий сводный список без перелива.
 */
function pickActiveResponsibles(
  reports: readonly BrigadierStoredReport[],
): string {
  const seen: string[] = []
  for (const r of reports) {
    const t = r.responsible?.trim()
    if (!t) continue
    if (!seen.includes(t)) seen.push(t)
    if (seen.length >= 2) break
  }
  if (seen.length === 0) return '—'
  return seen.join(', ')
}

export function SiteBrigadierSubmittedReportsSection({
  siteName,
  reports,
  serverBacked = false,
  onRemoveReport,
}: Props) {
  const sorted = useMemo(
    () =>
      [...reports].sort((a, b) =>
        (b.reportedAtIso ?? '').localeCompare(a.reportedAtIso ?? ''),
      ),
    [reports],
  )

  const total = sorted.length
  const latest = sorted[0]
  const latestDate = formatShortDate(latest?.reportedAtIso)
  const period = formatPeriod(sorted)
  const totalProblems = sorted.reduce((acc, r) => acc + (r.problems?.length ?? 0), 0)
  const totalAttachments = sorted.reduce(
    (acc, r) => acc + (r.attachments?.length ?? 0),
    0,
  )
  const responsibles = pickActiveResponsibles(sorted)

  return (
    <section className={styles.section} aria-labelledby="brigadier-submitted-heading">
      <div className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden="true"
            />
            <span>Журнал бригадира</span>
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="brigadier-submitted-heading">
              Отчёты бригадира
            </h2>
            <span className={styles.sourceBadge}>
              <svg
                className={styles.sourceBadgeIcon}
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {serverBacked ? (
                  <>
                    <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" />
                    <path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
                    <path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
                  </>
                ) : (
                  <>
                    <rect x="4" y="3.5" width="14" height="17" rx="2" />
                    <path d="M8 8h6M8 12h6M8 16h4" />
                  </>
                )}
              </svg>
              {serverBacked ? 'Источник · Сервер' : 'Источник · Это устройство'}
            </span>
          </div>

          <p className={styles.lead}>
            Объект «{siteName}» —{' '}
            {total > 0 ? (
              <>
                {total} {reportsWord(total)} за журналируемый период.{' '}
                {serverBacked
                  ? 'Фото, видео и проблемы хранятся на сервере, в браузере остаётся копия для просмотра без сети.'
                  : 'Записи сохранены на этом устройстве. После подключения API они синхронизируются между сотрудниками.'}
                {latestDate ? <> Свежая запись — {latestDate}.</> : null}
              </>
            ) : (
              <>
                Здесь появятся ежедневные отчёты бригадира с этого объекта: работы, проблемы,
                фото и комментарии. Нажмите «Ввод отчёта» выше — можно отправить только текст и
                вложения, без таблицы работ.
              </>
            )}
          </p>

          {total > 0 ? (
            <dl className={styles.summary}>
              <div className={styles.summaryItem}>
                <dt className={styles.summaryLabel}>Отчётов</dt>
                <dd className={styles.summaryValue}>{total}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt className={styles.summaryLabel}>Проблем</dt>
                <dd className={styles.summaryValue}>{totalProblems}</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt className={styles.summaryLabel}>Вложений</dt>
                <dd className={styles.summaryValue}>{totalAttachments}</dd>
              </div>
              {period ? (
                <div className={`${styles.summaryItem} ${styles.summaryItemWide}`}>
                  <dt className={styles.summaryLabel}>Период</dt>
                  <dd className={styles.summaryValue}>{period}</dd>
                </div>
              ) : null}
              <div className={`${styles.summaryItem} ${styles.summaryItemWide}`}>
                <dt className={styles.summaryLabel}>Ответственные</dt>
                <dd className={styles.summaryValue}>{responsibles}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>

      {total === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Пока нет отчётов</p>
          <p className={styles.emptyText}>
            На объекте «{siteName}» нажмите «Ввод отчёта» выше — можно отправить только текст и
            вложения, без таблицы работ.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map((r) => (
            <div key={r.id} className={styles.reportBlock}>
              <FieldReportCard
                accent="brigadier"
                badgeKicker="Отчёт"
                badge="Бригадир"
                dateTimeIso={r.reportedAtIso}
                lines={r.lines}
                narrativeComment={r.comment}
                chips={[{ id: 'p', text: `Ответственный: ${r.responsible}`, tone: 'muted' }]}
                problems={r.problems.map((p) => ({
                  kindLabel: brigadierProblemKindLabel(p.kindId),
                  details: p.details,
                }))}
                attachments={r.attachments}
              />
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => onRemoveReport(r.id)}
              >
                Удалить с этого устройства
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
