import { toDateKey } from './workDayPlan'
import { normalizeDeliveryPoint, type SiteDeliveryPoint } from './siteDeliveryPoint'

/**
 * Рейс водителя на дату: диспетчер (или руководитель) указывает,
 * что забрать и куда везти. Бригадир рейсы не ставит — только точку выгрузки.
 */

export type DriverTripAssignerRole = 'brigadier' | 'dispatcher' | 'manager'

export const DRIVER_TRIP_ROLE_LABELS: Record<DriverTripAssignerRole, string> = {
  brigadier: 'Бригадир',
  dispatcher: 'Диспетчер',
  manager: 'Руководитель',
}

export type DriverTripCargo = {
  title: string
  quantity: number | null
  unitLabel: string
}

export type DriverTripPickup = {
  address: string
  hint: string
}

export type DriverTrip = {
  id: string
  dateKey: string
  driverName: string
  vehiclePlate: string
  siteId: string
  siteName: string
  point: SiteDeliveryPoint
  pickup: DriverTripPickup
  cargo: DriverTripCargo[]
  cargoNote: string
  assignedBy: string
  assignedByRole: DriverTripAssignerRole
  createdAtIso: string
  seenAtIso: string | null
}

const QTY = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })

export function formatTripCargoLine(item: DriverTripCargo): string {
  const title = item.title.trim()
  const qty =
    item.quantity != null && Number.isFinite(item.quantity) ? QTY.format(item.quantity) : ''
  const unit = item.unitLabel.trim()
  if (qty && unit) return `${title} — ${qty} ${unit}`
  if (qty) return `${title} — ${qty}`
  return title
}

export function tripCargoLines(trip: Pick<DriverTrip, 'cargo' | 'cargoNote'>): string[] {
  const lines = trip.cargo.map(formatTripCargoLine).filter(Boolean)
  const note = trip.cargoNote.trim()
  if (note) lines.push(note)
  return lines
}

export function tripCargoPreview(trip: Pick<DriverTrip, 'cargo' | 'cargoNote'>): string {
  return tripCargoLines(trip).join(', ')
}

/** Время назначения рейса (МСК), для списка в кабинете. */
export function formatTripAssignedTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(d)
}

export function tripPickupLabel(trip: Pick<DriverTrip, 'pickup'>): string {
  const a = trip.pickup.address.trim()
  return a || 'Уже в кузове'
}

export function tripUnloadLabel(trip: Pick<DriverTrip, 'point' | 'siteName'>): string {
  const a = trip.point.address.trim()
  if (a) return a
  return trip.siteName.trim() || 'Объект'
}

export function isTripUnread(trip: Pick<DriverTrip, 'seenAtIso'>): boolean {
  return !trip.seenAtIso
}

export function collectUnreadTrips(trips: readonly DriverTrip[]): DriverTrip[] {
  return trips.filter(isTripUnread)
}

function isRole(v: unknown): v is DriverTripAssignerRole {
  return v === 'brigadier' || v === 'dispatcher' || v === 'manager'
}

function normalizePickup(row: unknown): DriverTripPickup {
  if (!row || typeof row !== 'object') return { address: '', hint: '' }
  const r = row as Record<string, unknown>
  return {
    address: typeof r.address === 'string' ? r.address.trim() : '',
    hint: typeof r.hint === 'string' ? r.hint.trim() : '',
  }
}

function normalizeCargo(row: unknown): DriverTripCargo[] {
  if (!Array.isArray(row)) return []
  const out: DriverTripCargo[] = []
  for (const x of row) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    if (!title) continue
    const rawQty = r.quantity
    const quantity =
      typeof rawQty === 'number' && Number.isFinite(rawQty)
        ? rawQty
        : typeof rawQty === 'string' && rawQty.trim() && Number.isFinite(Number(rawQty.replace(',', '.')))
          ? Number(rawQty.replace(',', '.'))
          : null
    out.push({
      title,
      quantity,
      unitLabel: typeof r.unitLabel === 'string' ? r.unitLabel.trim() : '',
    })
  }
  return out
}

export function normalizeDriverName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

export function namesMatchDriver(tripName: string, driverName: string): boolean {
  const a = normalizeDriverName(tripName)
  const b = normalizeDriverName(driverName)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * Поиск водителя в списке парка: «Васильев», «василь», «Васильева»
 * находят «Васильев Р. Т.».
 */
export function driverNameMatchesQuery(fullName: string, query: string): boolean {
  const n = normalizeDriverName(fullName)
  const q = normalizeDriverName(query)
  if (!q) return true
  if (!n) return false
  if (n.includes(q) || q.includes(n)) return true
  const nSur = n.split(' ')[0] ?? ''
  const qSur = q.split(' ')[0] ?? ''
  if (!nSur || !qSur) return false
  if (nSur.startsWith(qSur) || qSur.startsWith(nSur)) return true
  const prefix = Math.min(nSur.length, qSur.length)
  return prefix >= 4 && nSur.slice(0, prefix) === qSur.slice(0, prefix)
}

export function normalizeDriverTrip(row: unknown): DriverTrip | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateKey)) return null
  if (typeof r.driverName !== 'string' || !r.driverName.trim()) return null
  if (typeof r.siteId !== 'string' || typeof r.siteName !== 'string') return null
  const point = normalizeDeliveryPoint(r.point)
  if (!point) return null
  if (!isRole(r.assignedByRole)) return null
  const created =
    typeof r.createdAtIso === 'string' && !Number.isNaN(new Date(r.createdAtIso).getTime())
      ? new Date(r.createdAtIso).toISOString()
      : new Date().toISOString()
  const seenRaw = typeof r.seenAtIso === 'string' ? r.seenAtIso.trim() : ''
  const seenAtIso =
    seenRaw && !Number.isNaN(new Date(seenRaw).getTime()) ? new Date(seenRaw).toISOString() : null
  return {
    id: r.id,
    dateKey: r.dateKey,
    driverName: r.driverName.trim(),
    vehiclePlate: typeof r.vehiclePlate === 'string' ? r.vehiclePlate.trim() : '',
    siteId: r.siteId,
    siteName: r.siteName.trim(),
    point,
    pickup: normalizePickup(r.pickup),
    cargo: normalizeCargo(r.cargo),
    cargoNote: typeof r.cargoNote === 'string' ? r.cargoNote.trim() : '',
    assignedBy: typeof r.assignedBy === 'string' ? r.assignedBy.trim() : '',
    assignedByRole: r.assignedByRole,
    createdAtIso: created,
    seenAtIso,
  }
}

export function collectTodayTripsForDriver(
  trips: readonly DriverTrip[],
  driverName: string,
  todayKey: string = toDateKey(new Date()),
): DriverTrip[] {
  return trips
    .filter((t) => t.dateKey === todayKey)
    .filter((t) => namesMatchDriver(t.driverName, driverName))
    .slice()
    .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso))
}
