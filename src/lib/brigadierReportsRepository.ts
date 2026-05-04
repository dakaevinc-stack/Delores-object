import {
  MEASUREMENT_UNITS,
  type BrigadierStoredAttachment,
  type BrigadierStoredReport,
  type BrigadierWorkEntry,
  type MeasurementUnitId,
} from '../domain/brigadierReport'

const KEY = (siteId: string) => `deloresh-brigadier-reports:${siteId}:v1`
const MAX_VIDEO_BYTES = 5.5 * 1024 * 1024

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(blob)
  })
}

async function compressImageBlobToJpegDataUrl(
  blob: Blob,
  maxEdge: number,
  quality: number,
): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return blobToDataUrl(blob)
    }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return blobToDataUrl(blob)
  }
}

function isAttachmentLike(x: unknown): x is BrigadierStoredAttachment {
  if (!x || typeof x !== 'object') return false
  const a = x as BrigadierStoredAttachment
  return (
    typeof a.id === 'string' &&
    typeof a.kind === 'string' &&
    (a.kind === 'photo' || a.kind === 'video') &&
    typeof a.name === 'string' &&
    typeof a.previewUrl === 'string' &&
    typeof a.registeredAtIso === 'string' &&
    typeof a.fileModifiedIso === 'string'
  )
}

export function isReportRow(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    typeof r.reportedAtIso === 'string' &&
    Array.isArray(r.lines) &&
    Array.isArray(r.problems) &&
    typeof r.responsible === 'string' &&
    Array.isArray(r.attachments)
  )
}

function isWorkEntryLike(x: unknown): x is BrigadierWorkEntry {
  if (!x || typeof x !== 'object') return false
  const w = x as Record<string, unknown>
  if (typeof w.id !== 'string' || w.id.length === 0) return false
  if (typeof w.planNumber !== 'string' || w.planNumber.length === 0) return false
  if (typeof w.planTitle !== 'string') return false
  if (typeof w.qty !== 'number' || !Number.isFinite(w.qty)) return false
  if (typeof w.unit !== 'string') return false
  return MEASUREMENT_UNITS.some((u) => u.id === (w.unit as MeasurementUnitId))
}

export function coerceReport(x: unknown): BrigadierStoredReport {
  const r = x as BrigadierStoredReport & {
    comment?: string
    workEntries?: readonly BrigadierWorkEntry[]
  }
  const attachments = (r.attachments ?? []).filter(isAttachmentLike)
  const workEntriesRaw = Array.isArray(r.workEntries) ? r.workEntries : []
  const workEntries = workEntriesRaw.filter(isWorkEntryLike)
  return {
    ...r,
    comment: typeof r.comment === 'string' ? r.comment : '',
    attachments: attachments.map((a) => ({
      ...a,
      notPersisted: Boolean(a.notPersisted),
    })),
    workEntries: workEntries.length > 0 ? workEntries : undefined,
  }
}

/** Перед сохранением в localStorage: сжимает фото, видео — в base64 если помещается. */
export async function materializeBrigadierReportForLocalStorage(
  report: BrigadierStoredReport,
): Promise<BrigadierStoredReport> {
  const attachments: BrigadierStoredAttachment[] = []

  for (const a of report.attachments) {
    try {
      const res = await fetch(a.previewUrl)
      const blob = await res.blob()
      if (a.kind === 'photo') {
        const dataUrl = await compressImageBlobToJpegDataUrl(blob, 1600, 0.82)
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
        attachments.push({
          ...a,
          previewUrl: dataUrl,
          notPersisted: false,
        })
      } else if (blob.size > MAX_VIDEO_BYTES) {
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
        attachments.push({
          ...a,
          previewUrl: '',
          notPersisted: true,
        })
      } else {
        const dataUrl = await blobToDataUrl(blob)
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
        attachments.push({
          ...a,
          previewUrl: dataUrl,
          notPersisted: false,
        })
      }
    } catch {
      if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
      attachments.push({
        ...a,
        previewUrl: '',
        notPersisted: true,
      })
    }
  }

  return { ...report, attachments }
}

export function parseBrigadierReportsJson(parsed: unknown): BrigadierStoredReport[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isReportRow).map(coerceReport)
}

export function loadBrigadierReports(siteId: string): BrigadierStoredReport[] {
  const ls = safeStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(KEY(siteId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return parseBrigadierReportsJson(parsed)
  } catch {
    return []
  }
}

export function saveBrigadierReports(siteId: string, reports: BrigadierStoredReport[]): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    if (reports.length === 0) {
      ls.removeItem(KEY(siteId))
      return
    }
    ls.setItem(KEY(siteId), JSON.stringify(reports))
  } catch {
    /* quota */
  }
}
