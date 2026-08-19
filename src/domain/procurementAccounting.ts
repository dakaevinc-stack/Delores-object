import type { MeasurementUnitId } from './brigadierReport'
import { findProcurementPreset } from './procurementCatalog'
import type { ProcurementLine, ProcurementRequest, ProcurementRequestStatus } from './procurementRequest'

/** Строка заявки в разрезе учёта — для трассировки «кто и когда». */
export type ProcurementLineRef = {
  readonly requestId: string
  readonly shortCode: string
  readonly createdBy: string
  readonly createdAtIso: string
  readonly status: ProcurementRequestStatus
  readonly quantity: number
}

export type ProcurementMaterialTotal = {
  readonly presetId: string | null
  readonly title: string
  readonly unitId: MeasurementUnitId
  /** Сумма по активным заявкам (не сняты и не отклонены снабжением). */
  readonly requestedQty: number
  /** Сумма только по принятым на объекте. */
  readonly acceptedQty: number
  readonly refs: readonly ProcurementLineRef[]
}

export type ProcurementAuthorTotal = {
  readonly name: string
  readonly requestCount: number
  readonly materials: readonly ProcurementMaterialTotal[]
}

export type ProcurementAccountingSummary = {
  readonly totalRequests: number
  readonly byStatus: Readonly<Record<ProcurementRequestStatus, number>>
  readonly authors: readonly ProcurementAuthorTotal[]
  readonly materials: readonly ProcurementMaterialTotal[]
}

function normalizeTitle(s: string): string {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function materialKey(line: ProcurementLine): string {
  const presetId = findProcurementPreset(line.presetId)?.id ?? line.presetId ?? ''
  return `${presetId}::${normalizeTitle(line.title)}::${line.unitId}`
}

function countsByStatus(requests: readonly ProcurementRequest[]): Record<ProcurementRequestStatus, number> {
  const base: Record<ProcurementRequestStatus, number> = {
    pending: 0,
    approved: 0,
    accepted: 0,
    rejected: 0,
    refused: 0,
    cancelled: 0,
  }
  for (const req of requests) base[req.status] += 1
  return base
}

function isActiveForRequestQty(status: ProcurementRequestStatus): boolean {
  return status !== 'cancelled' && status !== 'rejected'
}

function pushMaterial(
  map: Map<string, ProcurementMaterialTotal & { refs: ProcurementLineRef[] }>,
  line: ProcurementLine,
  ref: ProcurementLineRef,
  active: boolean,
  accepted: boolean,
) {
  const key = materialKey(line)
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0
  if (!(qty > 0)) return

  const prev = map.get(key)
  if (prev) {
    map.set(key, {
      ...prev,
      requestedQty: prev.requestedQty + (active ? qty : 0),
      acceptedQty: prev.acceptedQty + (accepted ? qty : 0),
      refs: [...prev.refs, ref],
    })
    return
  }

  map.set(key, {
    presetId: findProcurementPreset(line.presetId)?.id ?? line.presetId,
    title: line.title.trim() || 'Материал',
    unitId: line.unitId,
    requestedQty: active ? qty : 0,
    acceptedQty: accepted ? qty : 0,
    refs: [ref],
  })
}

function sortMaterials(rows: ProcurementMaterialTotal[]): ProcurementMaterialTotal[] {
  return [...rows].sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, 'ru')
    if (byTitle !== 0) return byTitle
    return a.unitId.localeCompare(b.unitId)
  })
}

function sortAuthors(rows: ProcurementAuthorTotal[]): ProcurementAuthorTotal[] {
  return [...rows].sort((a, b) => {
    if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount
    return a.name.localeCompare(b.name, 'ru')
  })
}

/** Сводка заявок по объекту: кто заказал, что и сколько. */
export function summarizeProcurementAccounting(
  requests: readonly ProcurementRequest[],
): ProcurementAccountingSummary {
  const siteWide = new Map<string, ProcurementMaterialTotal & { refs: ProcurementLineRef[] }>()
  const byAuthor = new Map<string, Map<string, ProcurementMaterialTotal & { refs: ProcurementLineRef[] }>>()

  for (const req of requests) {
    const author = req.createdBy.trim() || 'Не указан'
    const active = isActiveForRequestQty(req.status)
    const accepted = req.status === 'accepted'

    if (!byAuthor.has(author)) byAuthor.set(author, new Map())
    const authorMap = byAuthor.get(author)!

    for (const line of req.items) {
      const ref: ProcurementLineRef = {
        requestId: req.id,
        shortCode: req.shortCode,
        createdBy: author,
        createdAtIso: req.createdAtIso,
        status: req.status,
        quantity: line.quantity,
      }
      pushMaterial(siteWide, line, ref, active, accepted)
      pushMaterial(authorMap, line, ref, active, accepted)
    }
  }

  const authors: ProcurementAuthorTotal[] = [...byAuthor.entries()].map(([name, map]) => ({
    name,
    requestCount: requests.filter((r) => (r.createdBy.trim() || 'Не указан') === name).length,
    materials: sortMaterials([...map.values()]),
  }))

  return {
    totalRequests: requests.length,
    byStatus: countsByStatus(requests),
    authors: sortAuthors(authors),
    materials: sortMaterials([...siteWide.values()]),
  }
}
