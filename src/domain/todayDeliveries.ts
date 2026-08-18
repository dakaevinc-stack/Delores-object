import { toDateKey } from './workDayPlan'
import type { MeasurementUnitId } from './brigadierReport'
import type { SiteDeliveryPoint } from './siteDeliveryPoint'
import type { CargoReceipt } from './cargoReceipt'
import { isVisibleToMaterialReceiver, type ProcurementRequest } from './procurementRequest'

/**
 * Поставки, которые бригадир должен ждать сегодня.
 * Дата поставки — «нужно к» из заявки, если срока нет — день создания заявки.
 */

export type TodayDeliveryCardStatus = 'pending' | 'accepted' | 'refused'

export type TodayDeliveryCard = {
  readonly requestId: string
  readonly shortCode: string
  readonly siteId: string
  readonly siteName: string
  readonly status: TodayDeliveryCardStatus
  readonly urgent: boolean
  readonly receipt: CargoReceipt | null
  readonly unloadPoint: SiteDeliveryPoint | null
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

function cardStatus(req: ProcurementRequest): TodayDeliveryCardStatus {
  if (req.receipt?.decision === 'refused' || req.status === 'refused') return 'refused'
  if (req.receipt?.decision === 'accepted' || req.status === 'accepted') return 'accepted'
  return 'pending'
}

function toCard(req: ProcurementRequest): TodayDeliveryCard {
  return {
    requestId: req.id,
    shortCode: req.shortCode,
    siteId: req.siteId,
    siteName: req.siteName,
    status: cardStatus(req),
    urgent: req.urgent,
    receipt: req.receipt,
    unloadPoint: req.unloadPoint,
    items: req.items.map((it) => ({
      title: it.title,
      quantity: it.quantity,
      unitId: it.unitId,
    })),
  }
}

export function collectTodayDeliveries(
  requests: readonly ProcurementRequest[],
  todayKey: string,
): TodayDeliveryCard[] {
  return requests
    .filter(isVisibleToMaterialReceiver)
    .filter((req) => requestDeliveryDateKey(req) === todayKey)
    .filter((req) => req.items.length > 0)
    .map(toCard)
}

export function collectOverdueDeliveries(
  requests: readonly ProcurementRequest[],
  todayKey: string,
): TodayDeliveryCard[] {
  return requests
    .filter((req) => req.status === 'approved')
    .filter((req) => requestDeliveryDateKey(req) < todayKey)
    .filter((req) => req.items.length > 0)
    .map(toCard)
}
