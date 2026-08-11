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
 * Подмешивает фото/видео с объекта к отчёту за тот же календарный день.
 * Медиа без отчёта в этот день — к ближайшему отчёту по дате.
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

  const sortedReportDays = [...reportsByDay.keys()].sort()

  const nearestReportDay = (mediaDay: string): string | null => {
    if (reportsByDay.has(mediaDay)) return mediaDay
    if (sortedReportDays.length === 0) return null
    let best = sortedReportDays[0]!
    let bestDiff = Math.abs(Date.parse(mediaDay) - Date.parse(best))
    for (const day of sortedReportDays) {
      const diff = Math.abs(Date.parse(mediaDay) - Date.parse(day))
      if (diff < bestDiff) {
        best = day
        bestDiff = diff
      }
    }
    return best
  }

  const extraByReportId = new Map<string, BrigadierStoredAttachment[]>()

  for (const m of media) {
    const mediaDay = calendarDayKey(m.capturedAtIso)
    if (!mediaDay) continue
    const targetDay = nearestReportDay(mediaDay)
    if (!targetDay) continue
    const dayReports = reportsByDay.get(targetDay)
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
