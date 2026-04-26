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

function isLegacyProcurementRow(x: unknown): boolean {
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

function normalizeProcurementRequest(row: unknown): ProcurementRequest {
  const r = row as ProcurementRequest & {
    status?: ProcurementRequestStatus
    urgent?: boolean
    neededByIso?: string | null
  }
  const status: ProcurementRequestStatus =
    r.status === 'accepted' || r.status === 'rejected' || r.status === 'pending'
      ? r.status
      : 'pending'
  const rawNeed = typeof r.neededByIso === 'string' ? r.neededByIso.trim() : ''
  const neededByIso =
    rawNeed && !Number.isNaN(new Date(rawNeed).getTime())
      ? new Date(rawNeed).toISOString()
      : null
  return {
    ...r,
    status,
    urgent: Boolean(r.urgent),
    neededByIso,
  }
}

export function loadProcurementRequests(siteId: string): ProcurementRequest[] {
  const ls = safeStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(KEY(siteId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLegacyProcurementRow).map(normalizeProcurementRequest)
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

