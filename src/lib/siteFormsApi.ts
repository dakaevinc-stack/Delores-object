import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import type { StoredSiteProjectFile } from './siteProjectFilesRepository'
import {
  parseNominatimReverse,
  parseNominatimSearch,
  type AddressHit,
} from '../domain/addressSearch'
import { normalizeDriverTrip, type DriverTrip } from '../domain/driverTrip'
import {
  normalizeDeliveryPoint,
  type SiteDeliveryPoint,
} from '../domain/siteDeliveryPoint'
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

/** Есть ли ключ записи в текущей сборке (нужен для POST/PUT на сервер). */
export function hasWriteSecret(): boolean {
  const secret = import.meta.env.VITE_SITE_FORMS_WRITE_SECRET
  return typeof secret === 'string' && secret.trim().length > 0
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

function isProjectFileRecord(x: unknown): x is StoredSiteProjectFile {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    (r.kind === 'pdf' || r.kind === 'dwg') &&
    typeof r.name === 'string' &&
    typeof r.mime === 'string' &&
    typeof r.sizeBytes === 'number' &&
    typeof r.uploadedAtIso === 'string'
  )
}

function parseProjectFilesJson(data: unknown): StoredSiteProjectFile[] {
  if (!Array.isArray(data)) return []
  return data.filter(isProjectFileRecord)
}

/**
 * Результат write-запроса. Возвращаем не голый boolean, а статус,
 * чтобы интерфейс мог отличать «сервер требует ключ» (403) от
 * «сервер недоступен» (network) и от «слишком большой файл» (413) —
 * иначе пользователю показывается одно и то же неинформативное «не сохранилось».
 */
export type RemoteWriteResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'too_large' | 'server' | 'network'; status: number | null }

/**
 * Маркер «ошибка пришла из write-API» — модалки ловят её
 * по `instanceof` и показывают `message` как есть, без обёрток.
 */
export class RemoteWriteFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteWriteFailure'
  }
}

function classifyResponse(status: number): RemoteWriteResult {
  if (status === 401 || status === 403) {
    return { ok: false, reason: 'forbidden', status }
  }
  if (status === 413) {
    return { ok: false, reason: 'too_large', status }
  }
  return { ok: false, reason: 'server', status }
}

/**
 * Человекочитаемое описание причины — единое для всех модалок,
 * чтобы юзер видел один и тот же стиль сообщений.
 */
export function describeRemoteWriteError(
  result: Extract<RemoteWriteResult, { ok: false }>,
  what: 'отчёт' | 'заявку' | 'изменения' | 'удаление' | 'файл',
): string {
  if (result.reason === 'forbidden') {
    if (import.meta.env.DEV && !hasWriteSecret()) {
      return `Сервер отклонил ${what}: в .env не задан VITE_SITE_FORMS_WRITE_SECRET (тот же, что на сервере). Перезапустите npm run dev или загрузите файл на http://94.242.58.24.`
    }
    return `Сервер отклонил ${what}: нет ключа записи. Обновите страницу (Ctrl+Shift+R) или сообщите администратору.`
  }
  if (result.reason === 'too_large') {
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} не приняли — слишком большой объём. Уменьшите видео или количество фото и повторите.`
  }
  if (result.reason === 'network') {
    return `Сервер недоступен — проверьте интернет и повторите попытку. ${what} осталась на устройстве.`
  }
  return `Сервер вернул ошибку ${result.status ?? '?'} при сохранении (${what}). Попробуйте ещё раз или сообщите администратору.`
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

/** GET заявок и отчётов успешен — API доступно; манифест медиа и точка разгрузки подгружаются отдельно (старые серверы без маршрута просто отключают синхронизацию). */
export async function fetchProcurementRequestsRemote(
  siteId: string,
): Promise<ProcurementRequest[] | null> {
  try {
    const res = await fetch(siteUrl(siteId, '/procurement-requests'))
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseProcurementRequestsJson(json)
  } catch {
    return null
  }
}

/** GET заявок и отчётов успешен — API доступно; манифест медиа и точка разгрузки подгружаются отдельно (старые серверы без маршрута просто отключают синхронизацию). */
export async function fetchSiteFormsFromServer(siteId: string): Promise<{
  procurement: ProcurementRequest[]
  brigadier: BrigadierStoredReport[]
  objectMediaRemoteAvailable: boolean
  objectMediaManifest: StoredSiteMedia[]
  deliveryPointRemoteAvailable: boolean
  deliveryPoint: SiteDeliveryPoint | null
} | null> {
  try {
    const [procRes, brigRes, mediaRes, pointRes] = await Promise.all([
      fetch(siteUrl(siteId, '/procurement-requests')),
      fetch(siteUrl(siteId, '/brigadier-reports')),
      fetch(siteUrl(siteId, '/object-media')),
      fetch(siteUrl(siteId, '/delivery-point')),
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
    let deliveryPointRemoteAvailable = false
    let deliveryPoint: SiteDeliveryPoint | null = null
    if (pointRes.ok) {
      try {
        const pointJson: unknown = await pointRes.json()
        if (pointJson && typeof pointJson === 'object' && 'point' in pointJson) {
          deliveryPointRemoteAvailable = true
          deliveryPoint = normalizeDeliveryPoint(
            (pointJson as { point: unknown }).point,
          )
        }
      } catch {
        deliveryPoint = null
      }
    }
    return {
      procurement: parseProcurementRequestsJson(procJson),
      brigadier: parseBrigadierReportsJson(brigJson),
      objectMediaRemoteAvailable,
      objectMediaManifest,
      deliveryPointRemoteAvailable,
      deliveryPoint,
    }
  } catch {
    return null
  }
}

export async function putSiteDeliveryPointRemote(
  siteId: string,
  point: SiteDeliveryPoint,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/delivery-point'), {
      method: 'PUT',
      headers: writeHeaders(true),
      body: JSON.stringify(point),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteSiteDeliveryPointRemote(siteId: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/delivery-point'), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

async function nominatimDirect(kind: 'search' | 'reverse', params: URLSearchParams): Promise<unknown> {
  const url = new URL(`https://nominatim.openstreetmap.org/${kind}`)
  url.search = params.toString()
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  return res.json()
}

export async function searchAddressRemote(query: string): Promise<AddressHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({
    format: 'jsonv2',
    q,
    limit: '6',
    'accept-language': 'ru',
    countrycodes: 'ru',
    addressdetails: '1',
  })
  try {
    const proxied = await fetch(`${apiBase()}/api/geocode?q=${encodeURIComponent(q)}`)
    if (proxied.ok) {
      const json: unknown = await proxied.json()
      if (json && typeof json === 'object' && 'data' in json) {
        return parseNominatimSearch((json as { data: unknown }).data)
      }
    }
  } catch {
    /* прямой Nominatim */
  }
  try {
    return parseNominatimSearch(await nominatimDirect('search', params))
  } catch {
    return []
  }
}

export async function reverseGeocodeRemote(lat: number, lng: number): Promise<string | null> {
  try {
    const proxied = await fetch(
      `${apiBase()}/api/geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
    )
    if (proxied.ok) {
      const json: unknown = await proxied.json()
      if (json && typeof json === 'object' && 'data' in json) {
        return parseNominatimReverse((json as { data: unknown }).data)
      }
    }
  } catch {
    /* прямой Nominatim */
  }
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      'accept-language': 'ru',
      addressdetails: '1',
    })
    return parseNominatimReverse(await nominatimDirect('reverse', params))
  } catch {
    return null
  }
}

export async function fetchDriverTripsRemote(): Promise<DriverTrip[] | null> {
  try {
    const res = await fetch(`${apiBase()}/api/driver-trips`)
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!Array.isArray(json)) return []
    return json.map(normalizeDriverTrip).filter((x): x is DriverTrip => x !== null)
  } catch {
    return null
  }
}

export type DriverTripPutResult = {
  ok: boolean
  telegramNotified: boolean
}

export async function putDriverTripRemote(trip: DriverTrip): Promise<DriverTripPutResult> {
  try {
    const res = await fetch(`${apiBase()}/api/driver-trips`, {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(trip),
    })
    if (!res.ok) return { ok: false, telegramNotified: false }
    const json: unknown = await res.json().catch(() => null)
    const telegramCount =
      json &&
      typeof json === 'object' &&
      json !== null &&
      'notified' in json &&
      typeof (json as { notified?: { telegram?: unknown } }).notified?.telegram === 'number'
        ? (json as { notified: { telegram: number } }).notified.telegram
        : 0
    return { ok: true, telegramNotified: telegramCount > 0 }
  } catch {
    return { ok: false, telegramNotified: false }
  }
}

export async function markDriverTripSeenRemote(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/api/driver-trips/${encodeURIComponent(id)}/seen`, {
      method: 'POST',
    })
    if (!res.ok) return null
    const json: unknown = await res.json().catch(() => null)
    if (json && typeof json === 'object' && typeof (json as { seenAtIso?: unknown }).seenAtIso === 'string') {
      return (json as { seenAtIso: string }).seenAtIso
    }
    return new Date().toISOString()
  } catch {
    return null
  }
}

export async function fetchDriverNotifyConfig(): Promise<{
  telegramEnabled: boolean
  botUsername: string
} | null> {
  try {
    const res = await fetch(`${apiBase()}/api/driver-notify/config`)
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== 'object') return null
    const row = json as { telegramEnabled?: unknown; botUsername?: unknown }
    return {
      telegramEnabled: row.telegramEnabled === true,
      botUsername: typeof row.botUsername === 'string' ? row.botUsername : '',
    }
  } catch {
    return null
  }
}

export async function fetchDriverNotifyStatus(name: string): Promise<boolean | null> {
  const q = name.trim()
  if (!q) return false
  try {
    const res = await fetch(
      `${apiBase()}/api/driver-notify/status?name=${encodeURIComponent(q)}`,
    )
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== 'object' || !('bound' in json)) return null
    return (json as { bound: unknown }).bound === true
  } catch {
    return null
  }
}

export async function deleteDriverTripRemote(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/driver-trips/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
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

export async function fetchProjectFilesRemote(siteId: string): Promise<StoredSiteProjectFile[] | null> {
  try {
    const res = await fetch(siteUrl(siteId, '/project-files'))
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseProjectFilesJson(json)
  } catch {
    return null
  }
}

export async function fetchProjectFileBlobRemote(
  siteId: string,
  fileId: string,
): Promise<Blob | null> {
  try {
    const res = await fetch(siteUrl(siteId, `/project-files/${encodeURIComponent(fileId)}/blob`))
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

export async function createProjectFileRemote(
  siteId: string,
  record: StoredSiteProjectFile,
  file: Blob,
): Promise<RemoteWriteResult> {
  try {
    const metaRes = await fetch(siteUrl(siteId, '/project-files'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify({ record }),
    })
    if (!metaRes.ok) return classifyResponse(metaRes.status)

    const blobRes = await fetch(
      siteUrl(siteId, `/project-files/${encodeURIComponent(record.id)}/blob`),
      {
        method: 'PUT',
        headers: writeHeaders(false),
        body: file,
      },
    )
    if (blobRes.ok) return { ok: true }
    return classifyResponse(blobRes.status)
  } catch {
    return { ok: false, reason: 'network', status: null }
  }
}

export async function deleteProjectFileRemote(siteId: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/project-files/${encodeURIComponent(fileId)}`), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

export function projectFileBlobUrl(siteId: string, fileId: string): string {
  const b = apiBase()
  return `${b}/api/sites/${encodeURIComponent(siteId)}/project-files/${encodeURIComponent(fileId)}/blob`
}

export async function createProcurementRequestRemote(
  siteId: string,
  req: ProcurementRequest,
): Promise<RemoteWriteResult> {
  try {
    const res = await fetch(siteUrl(siteId, '/procurement-requests'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(req),
    })
    if (res.ok) return { ok: true }
    return classifyResponse(res.status)
  } catch {
    return { ok: false, reason: 'network', status: null }
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
): Promise<RemoteWriteResult> {
  try {
    const res = await fetch(siteUrl(siteId, '/brigadier-reports'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(report),
    })
    if (res.ok) return { ok: true }
    return classifyResponse(res.status)
  } catch {
    return { ok: false, reason: 'network', status: null }
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

/** Прямой URL blob фото/видео с объекта (галерея). */
export function objectMediaBlobUrl(siteId: string, mediaId: string): string {
  const b = apiBase()
  return `${b}/api/sites/${encodeURIComponent(siteId)}/object-media/${encodeURIComponent(mediaId)}/blob`
}
