import { useEffect, useMemo, useState } from 'react'
import {
  brigadierProblemKindLabel,
  type BrigadierStoredReport,
} from '../../domain/brigadierReport'
import {
  brigadierAttachmentBlobUrl,
  objectMediaBlobUrl,
} from '../../lib/siteFormsApi'
import {
  getMediaBlob,
  listMediaBySite,
  type StoredSiteMedia,
} from '../../lib/mediaRepository'
import { CollapseToggle } from './CollapseToggle'
import { useAnchoredExpand } from './useAnchoredExpand'
import {
  calendarDayKey,
  enrichReportsWithObjectMedia,
  listOrphanObjectMediaDays,
} from './enrichReportsWithObjectMedia'
import {
  FieldReportCard,
  type FieldReportAttachment,
  type FieldReportMetaChip,
} from './FieldReportCard'
import { parseBrigadierComment } from './brigadierCommentSections'
import { JournalMediaDayCard } from './JournalMediaDayCard'
import { SiteObjectMediaDropSection } from './SiteObjectMediaDropSection'
import styles from './SiteBrigadierSubmittedSection.module.css'

type Props = {
  siteId: string
  siteName: string
  reports: readonly BrigadierStoredReport[]
  serverBacked?: boolean
  objectMediaManifest?: StoredSiteMedia[]
  objectMediaServerBacked?: boolean
  onObjectMediaSyncError?: (message: string) => void
  onRemoveReport: (id: string) => void | Promise<void>
}

function resolveAttachment(
  siteId: string,
  reportId: string,
  a: BrigadierStoredReport['attachments'][number],
  serverBacked: boolean,
  objectMediaServerBacked: boolean,
): FieldReportAttachment {
  if (a.previewUrl) return a
  if (a.id.startsWith('objmedia:')) {
    const mediaId = a.id.slice('objmedia:'.length)
    if (objectMediaServerBacked) {
      return { ...a, previewUrl: objectMediaBlobUrl(siteId, mediaId) }
    }
    return a
  }
  if (serverBacked && !a.notPersisted) {
    return { ...a, previewUrl: brigadierAttachmentBlobUrl(siteId, reportId, a.id) }
  }
  return a
}

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
  return null
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function formatDayBadgeRu(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`)
  if (!Number.isFinite(d.getTime())) return dayKey
  const rel = relativeDayLabelRu(d.toISOString())
  if (rel === 'Сегодня' || rel === 'Вчера') return rel
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

/** Короткая дата для списка кадров: 27.04.2026 */
function formatDayShortRu(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`)
  if (!Number.isFinite(d.getTime())) return dayKey
  const rel = relativeDayLabelRu(d.toISOString())
  if (rel === 'Сегодня' || rel === 'Вчера') return rel
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function attachmentMetaChips(
  attachments: readonly { kind: string }[],
): FieldReportMetaChip[] {
  const photos = attachments.filter((a) => a.kind === 'photo').length
  const videos = attachments.filter((a) => a.kind === 'video').length
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
  return meta
}

export function SiteBrigadierSubmittedReportsSection({
  siteId,
  siteName,
  reports,
  serverBacked = false,
  objectMediaManifest = [],
  objectMediaServerBacked = false,
  onObjectMediaSyncError,
  onRemoveReport,
}: Props) {
  const [localMedia, setLocalMedia] = useState<StoredSiteMedia[]>([])
  const [localPreviewById, setLocalPreviewById] = useState<Record<string, string>>({})
  const [mediaTick, setMediaTick] = useState(0)
  const {
    expanded: sectionExpanded,
    toggle: toggleSection,
    anchorRef: sectionAnchorRef,
  } = useAnchoredExpand(false)
  const {
    expanded: photosExpanded,
    toggle: togglePhotos,
    anchorRef: photosAnchorRef,
  } = useAnchoredExpand<HTMLDivElement>(false)
  const {
    expanded: reportsExpanded,
    toggle: toggleReports,
    anchorRef: reportsAnchorRef,
  } = useAnchoredExpand<HTMLDivElement>(false)

  const refreshLocalMedia = () => setMediaTick((n) => n + 1)

  useEffect(() => {
    let cancelled = false
    void listMediaBySite(siteId)
      .then((rows) => {
        if (!cancelled) setLocalMedia(rows)
      })
      .catch(() => {
        if (!cancelled) setLocalMedia([])
      })
    return () => {
      cancelled = true
    }
  }, [siteId, objectMediaManifest, mediaTick])

  const mediaPool = useMemo(() => {
    const map = new Map<string, StoredSiteMedia>()
    for (const m of objectMediaManifest) map.set(m.id, m)
    for (const m of localMedia) map.set(m.id, m)
    return [...map.values()]
  }, [objectMediaManifest, localMedia])

  useEffect(() => {
    if (objectMediaServerBacked) {
      setLocalPreviewById({})
      return
    }
    let cancelled = false
    const created: string[] = []
    void (async () => {
      const next: Record<string, string> = {}
      for (const m of mediaPool) {
        const blob = await getMediaBlob(m.id)
        if (!blob || cancelled) continue
        const url = URL.createObjectURL(blob)
        created.push(url)
        next[m.id] = url
      }
      if (!cancelled) setLocalPreviewById(next)
    })()
    return () => {
      cancelled = true
      for (const u of created) URL.revokeObjectURL(u)
    }
  }, [mediaPool, objectMediaServerBacked])

  const previewUrlFor = (mediaId: string) =>
    objectMediaServerBacked
      ? objectMediaBlobUrl(siteId, mediaId)
      : (localPreviewById[mediaId] ?? '')

  const enriched = useMemo(
    () => enrichReportsWithObjectMedia(reports, mediaPool, previewUrlFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, mediaPool, objectMediaServerBacked, siteId, localPreviewById],
  )

  const orphanDays = useMemo(
    () => listOrphanObjectMediaDays(reports, mediaPool),
    [reports, mediaPool],
  )

  const sortedReports = useMemo(
    () =>
      [...enriched].sort((a, b) =>
        (b.reportedAtIso ?? '').localeCompare(a.reportedAtIso ?? ''),
      ),
    [enriched],
  )

  const photoOnlyDays = useMemo(
    () =>
      orphanDays.map((day) => ({
        dayKey: day.dayKey,
        dayLabel: formatDayShortRu(day.dayKey),
        items: day.items,
      })),
    [orphanDays],
  )

  const photoCount = orphanDays.reduce((n, d) => n + d.items.length, 0)
  const reportCount = sortedReports.length
  const canCollapse = reportCount > 0 || mediaPool.length > 0
  const showBody = !canCollapse || sectionExpanded || (reportCount === 0 && mediaPool.length === 0)

  const metaBits: string[] = []
  if (reportCount > 0) {
    metaBits.push(
      `${reportCount} ${pluralRu(reportCount, ['отчёт', 'отчёта', 'отчётов'])}`,
    )
  }
  if (photoCount > 0) {
    metaBits.push(
      `${photoCount} ${pluralRu(photoCount, ['фото', 'фото', 'фото'])}`,
    )
  }

  return (
    <section
      ref={sectionAnchorRef}
      className={`${styles.shell}${showBody ? ` ${styles.shellOpen}` : ''}`}
      aria-labelledby="brigadier-submitted-heading"
      data-collapsed={canCollapse && !sectionExpanded ? 'true' : undefined}
    >
      <div className={styles.shellRail} aria-hidden />

      <header className={styles.shellHead}>
        <div className={styles.shellHeadCopy}>
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden
            />
            Журнал
          </p>
          <h2 className={styles.title} id="brigadier-submitted-heading">
            Фото / Отчёты
          </h2>
          <p className={styles.lead}>
            {metaBits.length > 0
              ? metaBits.join(' · ')
              : `Объект «${siteName}» — пока пусто`}
            {'. '}
            {canCollapse && !sectionExpanded
              ? 'Откройте журнал.'
              : 'Загрузка сверху, списки — по строке ниже.'}
          </p>
        </div>
        {canCollapse ? (
          <CollapseToggle
            expanded={sectionExpanded}
            onToggle={toggleSection}
            ariaControls="brigadier-submitted-list"
            className={styles.headToggle}
          />
        ) : null}
      </header>

      {showBody ? (
        <div className={styles.shellBody} id="brigadier-submitted-list">
          <div
            ref={photosAnchorRef}
            className={`${styles.block} ${styles.blockPhotos}`}
            data-collapsed={photoOnlyDays.length > 0 && !photosExpanded ? 'true' : undefined}
          >
            {photoOnlyDays.length > 0 ? (
              <button
                type="button"
                className={`${styles.rail}${photosExpanded ? ` ${styles.railOpen}` : ''}`}
                aria-expanded={photosExpanded}
                aria-controls="journal-photos-list"
                onClick={togglePhotos}
              >
                <span className={styles.railAccent} aria-hidden />
                <span className={styles.railGlow} aria-hidden />
                <span className={styles.railIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                    <path
                      d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 10.95 3.5h2.1c.5 0 .97.25 1.25.67L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v7A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                </span>
                <span className={styles.railCopy}>
                  <span className={styles.railKicker}>Медиа</span>
                  <span className={styles.railTitle}>Фото / Видео объекта</span>
                </span>
                <span className={styles.railMeta}>
                  <span className={styles.railPill}>
                    {photoCount}{' '}
                    {pluralRu(photoCount, ['фото', 'фото', 'фото'])}
                  </span>
                  <span className={styles.railPill}>
                    {photoOnlyDays.length}{' '}
                    {pluralRu(photoOnlyDays.length, ['день', 'дня', 'дней'])}
                  </span>
                </span>
                <span className={styles.railAction} aria-hidden>
                  <span className={styles.railActionLabel}>
                    {photosExpanded ? 'Свернуть' : 'Открыть'}
                  </span>
                  <span
                    className={`${styles.railChevron}${photosExpanded ? ` ${styles.railChevronOpen}` : ''}`}
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                      <path
                        d="M5 7.5 10 12.5 15 7.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
              </button>
            ) : (
              <div className={styles.railStatic}>
                <span className={styles.railAccent} aria-hidden />
                <span className={styles.railIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                    <path
                      d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 10.95 3.5h2.1c.5 0 .97.25 1.25.67L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v7A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                </span>
                <span className={styles.railCopy}>
                  <span className={styles.railKicker}>Медиа</span>
                  <span className={styles.railTitle}>Фото / Видео объекта</span>
                </span>
              </div>
            )}

            <div className={styles.blockBody}>
              <SiteObjectMediaDropSection
                embedded
                mode="upload"
                siteId={siteId}
                serverBacked={objectMediaServerBacked}
                serverManifest={objectMediaManifest}
                onRemoteSyncError={onObjectMediaSyncError}
                onLibraryChange={refreshLocalMedia}
              />

              {photoOnlyDays.length > 0 && photosExpanded ? (
                <div
                  className={styles.dayList}
                  id="journal-photos-list"
                  aria-label="Уже загружено"
                >
                  {photoOnlyDays.map((day) => (
                    <JournalMediaDayCard
                      key={day.dayKey}
                      dayKey={day.dayKey}
                      dayLabel={day.dayLabel}
                      items={day.items}
                      previewUrlFor={previewUrlFor}
                    />
                  ))}
                </div>
              ) : photoOnlyDays.length > 0 ? (
                <div id="journal-photos-list" hidden />
              ) : null}
            </div>
          </div>

          {sortedReports.length > 0 ? (
            <div
              ref={reportsAnchorRef}
              className={`${styles.block} ${styles.blockReports}`}
              data-collapsed={!reportsExpanded ? 'true' : undefined}
            >
              <button
                type="button"
                className={`${styles.rail}${reportsExpanded ? ` ${styles.railOpen}` : ''}`}
                aria-expanded={reportsExpanded}
                aria-controls="journal-reports-list"
                onClick={toggleReports}
              >
                <span className={styles.railAccent} aria-hidden />
                <span className={styles.railGlow} aria-hidden />
                <span className={`${styles.railIcon} ${styles.railIconReports}`} aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                    <path
                      d="M7 3.75h7.5L19 8.25V20a.75.75 0 0 1-.75.75H7A.75.75 0 0 1 6.25 20V4.5A.75.75 0 0 1 7 3.75Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14.25 3.75V8h4.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 12.5h6M9 15.5h4"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className={styles.railCopy}>
                  <span className={styles.railKicker}>Журнал</span>
                  <span className={styles.railTitle}>Отчёты объекта</span>
                </span>
                <span className={styles.railMeta}>
                  <span className={styles.railPill}>
                    {reportCount}{' '}
                    {pluralRu(reportCount, ['отчёт', 'отчёта', 'отчётов'])}
                  </span>
                </span>
                <span className={styles.railAction} aria-hidden>
                  <span className={styles.railActionLabel}>
                    {reportsExpanded ? 'Свернуть' : 'Открыть'}
                  </span>
                  <span
                    className={`${styles.railChevron}${reportsExpanded ? ` ${styles.railChevronOpen}` : ''}`}
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                      <path
                        d="M5 7.5 10 12.5 15 7.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </span>
              </button>
              {reportsExpanded ? (
                <div className={styles.blockBody}>
                  <div className={styles.reportList} id="journal-reports-list">
                    {sortedReports.map((r) => {
                      const problems = r.problems.length
                      const attachments = r.attachments.map((a) =>
                        resolveAttachment(
                          siteId,
                          r.id,
                          a,
                          serverBacked,
                          objectMediaServerBacked,
                        ),
                      )
                      const meta = attachmentMetaChips(attachments)
                      if (problems > 0) {
                        meta.push({
                          id: 'problems',
                          icon: 'warn',
                          label: `${problems} ${pluralRu(problems, ['проблема', 'проблемы', 'проблем'])}`,
                          tone: 'warning',
                        })
                      }
                      if (meta.length === 0) {
                        meta.push({
                          id: 'no-media',
                          icon: 'attach',
                          label: 'Без фото',
                          tone: 'neutral',
                        })
                      }
                      const dayKey = calendarDayKey(r.reportedAtIso)
                      const dayBadge = dayKey ? formatDayBadgeRu(dayKey) : 'Смена'

                      return (
                        <FieldReportCard
                          key={r.id}
                          accent="brigadier"
                          badgeKicker="День"
                          badge={dayBadge}
                          dateTimeIso={r.reportedAtIso}
                          responsibleName={r.responsible}
                          lines={r.lines}
                          narrativeComment={r.comment}
                          narrativeStructured={parseBrigadierComment(r.comment)}
                          collapsible
                          defaultExpanded={false}
                          problems={r.problems.map((p) => ({
                            kindLabel: brigadierProblemKindLabel(p.kindId),
                            details: p.details,
                          }))}
                          attachments={attachments}
                          metaChips={meta}
                          onRemove={() => onRemoveReport(r.id)}
                          removeLabel="Скрыть на этом устройстве"
                        />
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div id="journal-reports-list" hidden />
              )}
            </div>
          ) : null}

          {sortedReports.length === 0 && photoOnlyDays.length === 0 ? (
            <p className={styles.emptyHint}>
              Добавьте фото выше или заполните «Ввод отчёта» — всё появится здесь.
            </p>
          ) : null}
        </div>
      ) : (
        <div id="brigadier-submitted-list" hidden />
      )}
    </section>
  )
}
