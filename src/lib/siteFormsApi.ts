import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import { parseBrigadierReportsJson } from './brigadierReportsRepository'
import type { StoredSiteMedia } from './mediaRepository'
import { parseProcurementRequestsJson } from './procurementRequestsRepository'

function apiBase(): string {
  const raw = import.meta.env.VITE_SITE_FORMS_API_BASE
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t) return t.replace(/\/+$/, '')
  }
  return ''
}

function writeHeaders(withJsonBody: boolean): HeadersInit {
  const h: Record<string, string> = {}
  if (withJsonBody) h['Content-Type'] = 'application/json'
  const secret = import.meta.env.VITE_SITE_FORMS_WRITE_SECRET
  if (typeof secret === 'string' && secret.trim()) {
    h['X-Deloresh-Write-Secret'] = secret.trim()
  }
  return h
}

function siteUrl(siteId: string, tail: string): string {
  const b = apiBase()
  return `${b}/api/sites/${encodeURIComponent(siteId)}${tail}`
}

function isObjectMediaRecord(x: unknown): x is StoredSiteMedia {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    (r.kind === 'photo' || r.kind === 'video') &&
    typeof r.name === 'string' &&
    typeof r.mime === 'string' &&
    typeof r.sizeBytes === 'number' &&
    typeof r.capturedAtIso === 'string' &&
    typeof r.uploadedAtIso === 'string' &&
    typeof r.authorCaption === 'string'
  )
}

function parseObjectMediaManifestJson(data: unknown): StoredSiteMedia[] {
  if (!Array.isArray(data)) return []
  return data.filter(isObjectMediaRecord)
}

async function readBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : '')
    }
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(blob)
  })
}

/** GET заявок и отчётов успешен — API доступно; манифест медиа подгружается отдельным GET (старые серверы без маршрута просто отключают синхронизацию медиа). */
export async function fetchSiteFormsFromServer(siteId: string): Promise<{
  procurement: ProcurementRequest[]
  brigadier: BrigadierStoredReport[]
  objectMediaRemoteAvailable: boolean
  objectMediaManifest: StoredSiteMedia[]
} | null> {
  try {
    const [procRes, brigRes, mediaRes] = await Promise.all([
      fetch(siteUrl(siteId, '/procurement-requests')),
      fetch(siteUrl(siteId, '/brigadier-reports')),
      fetch(siteUrl(siteId, '/object-media')),
    ])
    if (!procRes.ok || !brigRes.ok) return null
    const procJson: unknown = await procRes.json()
    const brigJson: unknown = await brigRes.json()
    const objectMediaRemoteAvailable = mediaRes.ok
    let objectMediaManifest: StoredSiteMedia[] = []
    if (mediaRes.ok) {
      try {
        const mediaJson: unknown = await mediaRes.json()
        objectMediaManifest = parseObjectMediaManifestJson(mediaJson)
      } catch {
        objectMediaManifest = []
      }
    }
    return {
      procurement: parseProcurementRequestsJson(procJson),
      brigadier: parseBrigadierReportsJson(brigJson),
      objectMediaRemoteAvailable,
      objectMediaManifest,
    }
  } catch {
    return null
  }
}

export async function fetchObjectMediaBlob(
  siteId: string,
  mediaId: string,
): Promise<Blob | null> {
  try {
    const res = await fetch(
      siteUrl(siteId, `/object-media/${encodeURIComponent(mediaId)}/blob`),
    )
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

export async function createObjectMediaRemote(
  siteId: string,
  record: StoredSiteMedia,
  file: Blob,
): Promise<boolean> {
  try {
    const dataBase64 = await readBlobAsBase64(file)
    const res = await fetch(siteUrl(siteId, '/object-media'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify({ record, dataBase64 }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteObjectMediaRemote(siteId: string, mediaId: string): Promise<boolean> {
  try {
    const res = await fetch(
      siteUrl(siteId, `/object-media/${encodeURIComponent(mediaId)}`),
      {
        method: 'DELETE',
        headers: writeHeaders(false),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function createProcurementRequestRemote(
  siteId: string,
  req: ProcurementRequest,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/procurement-requests'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(req),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function patchProcurementRequestRemote(
  siteId: string,
  id: string,
  patch: Partial<ProcurementRequest>,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/procurement-requests/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: writeHeaders(true),
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteProcurementRequestRemote(siteId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/procurement-requests/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function createBrigadierReportRemote(
  siteId: string,
  report: BrigadierStoredReport,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/brigadier-reports'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(report),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteBrigadierReportRemote(siteId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/brigadier-reports/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Отправляет blob вложения отчёта на сервер. Хранится отдельно от
 * JSON, чтобы основной payload отчёта оставался лёгким и читался
 * быстро всеми клиентами.
 */
export async function uploadBrigadierAttachmentRemote(
  siteId: string,
  reportId: string,
  attachmentId: string,
  blob: Blob,
): Promise<boolean> {
  try {
    const dataBase64 = await readBlobAsBase64(blob)
    if (!dataBase64) return false
    const res = await fetch(
      siteUrl(siteId, `/brigadier-reports/${encodeURIComponent(reportId)}/attachments`),
      {
        method: 'POST',
        headers: writeHeaders(true),
        body: JSON.stringify({ id: attachmentId, dataBase64 }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

/**
 * Полный URL для прямой подстановки в `<img src>` / `<video src>`.
 * Никаких загрузок в JS — браузер сам тянет ресурс с правильным
 * Content-Type и кэшированием.
 */
export function brigadierAttachmentBlobUrl(
  siteId: string,
  reportId: string,
  attachmentId: string,
): string {
  const b = apiBase()
  return `${b}/api/sites/${encodeURIComponent(siteId)}/brigadier-reports/${encodeURIComponent(
    reportId,
  )}/attachments/${encodeURIComponent(attachmentId)}/blob`
}
