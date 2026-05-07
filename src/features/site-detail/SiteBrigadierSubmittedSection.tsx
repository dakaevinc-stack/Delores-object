import { useMemo, useState } from 'react'
import {
  brigadierProblemKindLabel,
  type BrigadierStoredReport,
} from '../../domain/brigadierReport'
import { brigadierAttachmentBlobUrl } from '../../lib/siteFormsApi'
import { CollapseToggle } from './CollapseToggle'
import {
  FieldReportCard,
  type FieldReportAttachment,
  type FieldReportMetaChip,
} from './FieldReportCard'
import { parseBrigadierComment } from './brigadierCommentSections'
import styles from './SiteBrigadierSubmittedSection.module.css'

type Props = {
  siteId: string
  siteName: string
  reports: readonly BrigadierStoredReport[]
  serverBacked?: boolean
  onRemoveReport: (id: string) => void | Promise<void>
}

/**
 * Превращает локальное вложение в `FieldReportAttachment` с готовым
 * `previewUrl`. Если локального preview нет (data:/blob:), но API
 * подключён и файл не помечен `notPersisted` — собираем прямую ссылку
 * на серверный blob; браузер сам подгрузит изображение/видео.
 */
function resolveAttachment(
  siteId: string,
  reportId: string,
  a: BrigadierStoredReport['attachments'][number],
  serverBacked: boolean,
): FieldReportAttachment {
  if (a.previewUrl) return a
  if (serverBacked && !a.notPersisted) {
    return { ...a, previewUrl: brigadierAttachmentBlobUrl(siteId, reportId, a.id) }
  }
  return a
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

/**
 * Короткая «человеческая» отметка относительной даты для пилюли в карточке:
 * «Сегодня», «Вчера», «3 дн. назад», «2 нед. назад». Если запись далеко в
 * прошлом или будущем — возвращаем `null`, чтобы шапка не путала.
 */
function relativeDayLabelRu(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const dayMs = 86_400_000
  const startOfDay = (x: Date) => {
    const t = new Date(x)
    t.setHours(0, 0, 0, 0)
    return t.getTime()
  }
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / dayMs)
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  if (diffDays === -1) return 'Завтра'
  if (diffDays >= 2 && diffDays < 7) return `${diffDays} дн. назад`
  if (diffDays >= 7 && diffDays < 31) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} нед. назад`
  }
  return null
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/**
 * «сегодня в 14:30», «вчера в 21:06», «6 мая, 21:06» — короткий
 * человеческий вид свежести записи для одной строки лида.
 */
function formatLatestEntryRu(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const dayMs = 86_400_000
  const startOfDay = (x: Date) => {
    const t = new Date(x)
    t.setHours(0, 0, 0, 0)
    return t.getTime()
  }
  const days = Math.round((startOfDay(now) - startOfDay(d)) / dayMs)
  if (days === 0) return `сегодня в ${time}`
  if (days === 1) return `вчера в ${time}`
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${time}`
}

export function SiteBrigadierSubmittedReportsSection({
  siteId,
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
  const latestEntry = formatLatestEntryRu(latest?.reportedAtIso)
  const period = formatPeriod(sorted)
  const totalProblems = sorted.reduce((acc, r) => acc + (r.problems?.length ?? 0), 0)
  const totalAttachments = sorted.reduce(
    (acc, r) => acc + (r.attachments?.length ?? 0),
    0,
  )
  const responsibles = pickActiveResponsibles(sorted)

  const [sectionExpanded, setSectionExpanded] = useState(false)
  const canCollapse = total > 0

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
            {canCollapse ? (
              <CollapseToggle
                expanded={sectionExpanded}
                onToggle={() => setSectionExpanded((v) => !v)}
                ariaControls="brigadier-submitted-list"
                expandedLabel="Свернуть журнал"
                collapsedLabel="Открыть журнал"
                className={styles.headToggle}
              />
            ) : null}
          </div>

          <p className={styles.lead}>
            {total > 0
              ? latestEntry
                ? `Сменный журнал ведётся регулярно. Свежая запись — ${latestEntry}.`
                : 'Сменный журнал ведётся регулярно.'
              : 'Журнал смен пока пуст — добавьте первую запись кнопкой «Ввод отчёта» выше.'}
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
      ) : sectionExpanded ? (
        <div className={styles.list} id="brigadier-submitted-list">
          {sorted.map((r, idx) => {
            const photos = r.attachments.filter((a) => a.kind === 'photo').length
            const videos = r.attachments.filter((a) => a.kind === 'video').length
            const problems = r.problems.length

            const meta: FieldReportMetaChip[] = []
            if (photos > 0) {
              meta.push({
                id: 'photos',
                icon: 'photo',
                label: `${photos} ${pluralRu(photos, ['фото', 'фото', 'фото'])}`,
                tone: 'neutral',
              })
            }
            if (videos > 0) {
              meta.push({
                id: 'videos',
                icon: 'video',
                label: `${videos} ${pluralRu(videos, ['видео', 'видео', 'видео'])}`,
                tone: 'neutral',
              })
            }
            if (photos === 0 && videos === 0) {
              meta.push({
                id: 'no-media',
                icon: 'attach',
                label: 'Без вложений',
                tone: 'neutral',
              })
            }
            if (problems > 0) {
              meta.push({
                id: 'problems',
                icon: 'warn',
                label: `${problems} ${pluralRu(problems, ['проблема', 'проблемы', 'проблем'])}`,
                tone: 'warning',
              })
            }

            return (
              <FieldReportCard
                key={r.id}
                accent="brigadier"
                badgeKicker="Отчёт"
                badge="Бригадир"
                dateTimeIso={r.reportedAtIso}
                relativeTimeLabel={relativeDayLabelRu(r.reportedAtIso) ?? undefined}
                responsibleName={r.responsible}
                lines={r.lines}
                narrativeComment={r.comment}
                narrativeStructured={parseBrigadierComment(r.comment)}
                collapsible={total > 1}
                defaultExpanded={idx === 0}
                problems={r.problems.map((p) => ({
                  kindLabel: brigadierProblemKindLabel(p.kindId),
                  details: p.details,
                }))}
                attachments={r.attachments.map((a) =>
                  resolveAttachment(siteId, r.id, a, serverBacked),
                )}
                metaChips={meta}
                onRemove={() => onRemoveReport(r.id)}
                removeLabel="Скрыть на этом устройстве"
              />
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
