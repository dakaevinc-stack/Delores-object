import { toDateKey } from './workDayPlan'
import type { MeasurementUnitId } from './brigadierReport'
import type { ProcurementRequest, ProcurementRequestStatus } from './procurementRequest'

/**
 * Поставки, которые бригадир должен ждать сегодня.
 * Дата поставки — «нужно к» из заявки, если срока нет — день создания заявки.
 */

export type TodayDeliveryCard = {
  readonly requestId: string
  readonly shortCode: string
  readonly siteId: string
  readonly siteName: string
  readonly status: Exclude<ProcurementRequestStatus, 'rejected'>
  readonly urgent: boolean
  readonly items: readonly {
    readonly title: string
    readonly quantity: number
    readonly unitId: MeasurementUnitId
  }[]
}

export function requestDeliveryDateKey(req: ProcurementRequest): string {
  const iso = req.neededByIso || req.createdAtIso
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? toDateKey(d) : toDateKey(new Date())
}

export function collectTodayDeliveries(
  requests: readonly ProcurementRequest[],
  todayKey: string,
): TodayDeliveryCard[] {
  return requests
    .filter((req) => req.status !== 'rejected')
    .filter((req) => requestDeliveryDateKey(req) === todayKey)
    .filter((req) => req.items.length > 0)
    .map((req) => ({
      requestId: req.id,
      shortCode: req.shortCode,
      siteId: req.siteId,
      siteName: req.siteName,
      status: req.status === 'accepted' ? 'accepted' : 'pending',
      urgent: req.urgent,
      items: req.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        unitId: it.unitId,
      })),
    }))
}

export function collectOverdueDeliveries(
  requests: readonly ProcurementRequest[],
  todayKey: string,
): TodayDeliveryCard[] {
  return requests
    .filter((req) => req.status === 'pending')
    .filter((req) => requestDeliveryDateKey(req) < todayKey)
    .filter((req) => req.items.length > 0)
    .map((req) => ({
      requestId: req.id,
      shortCode: req.shortCode,
      siteId: req.siteId,
      siteName: req.siteName,
      status: 'pending',
      urgent: req.urgent,
      items: req.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        unitId: it.unitId,
      })),
    }))
}
