import type { BrigadierStoredAttachment, BrigadierStoredReport } from '../../domain/brigadierReport'
import type { StoredSiteMedia } from '../../lib/mediaRepository'

/** Локальный календарный день YYYY-MM-DD (как в галерее объекта). */
export function calendarDayKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mediaAsAttachment(
  m: StoredSiteMedia,
  previewUrl: string,
): BrigadierStoredAttachment {
  return {
    id: `objmedia:${m.id}`,
    kind: m.kind,
    name: m.name,
    previewUrl,
    registeredAtIso: m.uploadedAtIso,
    fileModifiedIso: m.capturedAtIso,
    mime: m.mime,
    sizeBytes: m.sizeBytes,
  }
}

/**
 * Подмешивает фото/видео с объекта только к отчёту того же календарного дня.
 * Медиа без отчёта за день остаются «сиротами» — см. `listOrphanObjectMediaDays`.
 */
export function enrichReportsWithObjectMedia(
  reports: readonly BrigadierStoredReport[],
  media: readonly StoredSiteMedia[],
  previewUrlFor: (mediaId: string) => string,
): BrigadierStoredReport[] {
  if (media.length === 0 || reports.length === 0) return [...reports]

  const reportsByDay = new Map<string, BrigadierStoredReport[]>()
  for (const r of reports) {
    const key = calendarDayKey(r.reportedAtIso)
    if (!key) continue
    const list = reportsByDay.get(key) ?? []
    list.push(r)
    reportsByDay.set(key, list)
  }

  const extraByReportId = new Map<string, BrigadierStoredAttachment[]>()

  for (const m of media) {
    const mediaDay = calendarDayKey(m.capturedAtIso)
    if (!mediaDay) continue
    const dayReports = reportsByDay.get(mediaDay)
    if (!dayReports?.length) continue
    const target = [...dayReports].sort((a, b) =>
      (b.reportedAtIso ?? '').localeCompare(a.reportedAtIso ?? ''),
    )[0]!
    const list = extraByReportId.get(target.id) ?? []
    list.push(mediaAsAttachment(m, previewUrlFor(m.id)))
    extraByReportId.set(target.id, list)
  }

  return reports.map((r) => {
    const extra = extraByReportId.get(r.id)
    if (!extra?.length) return r
    const existing = new Set(r.attachments.map((a) => a.id))
    return {
      ...r,
      attachments: [...r.attachments, ...extra.filter((a) => !existing.has(a.id))],
    }
  })
}

export type OrphanObjectMediaDay = {
  dayKey: string
  items: StoredSiteMedia[]
}

/** Дни с медиа, для которых нет отчёта бригадира. */
export function listOrphanObjectMediaDays(
  reports: readonly BrigadierStoredReport[],
  media: readonly StoredSiteMedia[],
): OrphanObjectMediaDay[] {
  const reportDays = new Set<string>()
  for (const r of reports) {
    const key = calendarDayKey(r.reportedAtIso)
    if (key) reportDays.add(key)
  }

  const byDay = new Map<string, StoredSiteMedia[]>()
  for (const m of media) {
    const key = calendarDayKey(m.capturedAtIso)
    if (!key || reportDays.has(key)) continue
    const list = byDay.get(key) ?? []
    list.push(m)
    byDay.set(key, list)
  }

  return [...byDay.entries()]
    .map(([dayKey, items]) => ({
      dayKey,
      items: [...items].sort((a, b) => b.capturedAtIso.localeCompare(a.capturedAtIso)),
    }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
}

/** Одна лента журнала: отчёты и дни только с фото — по дате, сверху новые. */
export type BrigadierJournalEntry =
  | {
      id: string
      sortKey: string
      kind: 'report'
      report: BrigadierStoredReport
    }
  | {
      id: string
      sortKey: string
      kind: 'media-day'
      dayKey: string
      items: StoredSiteMedia[]
    }

export function listBrigadierJournalEntries(
  enrichedReports: readonly BrigadierStoredReport[],
  orphanDays: readonly OrphanObjectMediaDay[],
): BrigadierJournalEntry[] {
  const entries: BrigadierJournalEntry[] = [
    ...enrichedReports.map((report) => ({
      id: `report:${report.id}`,
      sortKey: report.reportedAtIso || calendarDayKey(report.reportedAtIso) || report.id,
      kind: 'report' as const,
      report,
    })),
    ...orphanDays.map((day) => ({
      id: `media:${day.dayKey}`,
      sortKey: day.items[0]?.capturedAtIso ?? `${day.dayKey}T12:00:00`,
      kind: 'media-day' as const,
      dayKey: day.dayKey,
      items: day.items,
    })),
  ]
  return entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
}
