import type { CargoReceipt, CargoReceiptMedia } from '../domain/cargoReceipt'
import type {
  ProcurementRequest,
  ProcurementRequestStatus,
} from '../domain/procurementRequest'

/**
 * Локальное хранилище заявок снабженцу по объектам.
 * Нужны «прямо сейчас» до появления сервера: чтобы заявки не терялись после F5
 * и их можно было пересылать снабженцу из раздела объекта.
 */

const KEY = (siteId: string) => `deloresh-procurement-requests:${siteId}:v1`

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function isLegacyProcurementRow(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.shortCode === 'string' &&
    typeof r.siteId === 'string' &&
    typeof r.siteName === 'string' &&
    typeof r.createdAtIso === 'string' &&
    typeof r.createdBy === 'string' &&
    typeof r.note === 'string' &&
    Array.isArray(r.items)
  )
}

function normalizeReceiptMedia(row: unknown): CargoReceiptMedia | null {
  if (!row || typeof row !== 'object') return null
  const m = row as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.name !== 'string') return null
  if (m.kind !== 'photo' && m.kind !== 'video') return null
  if (typeof m.previewUrl !== 'string') return null
  return {
    id: m.id,
    kind: m.kind,
    name: m.name,
    previewUrl: m.previewUrl,
  }
}

export function normalizeCargoReceipt(row: unknown): CargoReceipt | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const decision = r.decision === 'accepted' || r.decision === 'refused' ? r.decision : null
  const rawAt = typeof r.atIso === 'string' ? r.atIso.trim() : ''
  const atIso =
    rawAt && !Number.isNaN(new Date(rawAt).getTime()) ? new Date(rawAt).toISOString() : null
  if (!decision || !atIso) return null
  const media = Array.isArray(r.media)
    ? r.media.map(normalizeReceiptMedia).filter((x): x is CargoReceiptMedia => x !== null)
    : []
  return {
    decision,
    atIso,
    reason: typeof r.reason === 'string' ? r.reason : '',
    media,
  }
}

export function normalizeProcurementRequest(row: unknown): ProcurementRequest {
  const r = row as ProcurementRequest & {
    status?: ProcurementRequestStatus
    urgent?: boolean
    neededByIso?: string | null
    receipt?: unknown
  }
  let status: ProcurementRequestStatus =
    r.status === 'accepted' ||
    r.status === 'rejected' ||
    r.status === 'pending' ||
    r.status === 'refused' ||
    r.status === 'approved' ||
    r.status === 'cancelled'
      ? r.status
      : 'pending'
  const rawNeed = typeof r.neededByIso === 'string' ? r.neededByIso.trim() : ''
  const neededByIso =
    rawNeed && !Number.isNaN(new Date(rawNeed).getTime())
      ? new Date(rawNeed).toISOString()
      : null
  const receipt = normalizeCargoReceipt(r.receipt)
  if (receipt?.decision === 'accepted') status = 'accepted'
  if (receipt?.decision === 'refused') status = 'refused'
  return {
    ...r,
    status,
    urgent: Boolean(r.urgent),
    neededByIso,
    receipt,
  }
}

/** Разбор массива заявок из JSON (localStorage или ответ API). */
export function parseProcurementRequestsJson(parsed: unknown): ProcurementRequest[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isLegacyProcurementRow).map(normalizeProcurementRequest)
}

export function loadProcurementRequests(siteId: string): ProcurementRequest[] {
  const ls = safeStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(KEY(siteId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return parseProcurementRequestsJson(parsed)
  } catch {
    return []
  }
}

export function saveProcurementRequests(siteId: string, requests: ProcurementRequest[]): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    if (requests.length === 0) {
      ls.removeItem(KEY(siteId))
      return
    }
    ls.setItem(KEY(siteId), JSON.stringify(requests))
  } catch {
    /* quota / private mode — не ломаем UI */
  }
}

/** Все заявки по списку объектов — для кабинета бригадира на главной. */
export function loadProcurementRequestsForSites(
  siteIds: readonly string[],
): ProcurementRequest[] {
  return siteIds.flatMap((id) => loadProcurementRequests(id))
}

