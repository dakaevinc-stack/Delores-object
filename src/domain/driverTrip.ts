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
  /** Водитель открыл рейс в кабинете. */
  seenAtIso: string | null
  /** Рейс закрыт как исполненный (водитель или диспетчер). */
  completedAtIso: string | null
}

/**
 * Жизненный цикл рейса:
 *   Ожидает  — отправлен, водитель ещё не открыл
 *   В работе — открыл / принял
 *   Исполнен — отмечен выполненным (терминальный)
 *
 * Переходы: waiting → accepted → done.
 * Из waiting можно сразу в done (диспетчер закрыл без открытия водителем).
 * Назад нельзя.
 */
export type DriverTripStatus = 'waiting' | 'accepted' | 'done'

export const DRIVER_TRIP_STATUS_LABELS: Record<DriverTripStatus, string> = {
  waiting: 'Ожидает',
  accepted: 'В работе',
  done: 'Исполнен',
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

/** Дата назначения рейса (МСК), коротко: «25.08». */
export function formatTripAssignedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(d)
}

/** Дата + время для подписи / Excel. */
export function formatTripAssignedDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

export function isTripUnread(trip: Pick<DriverTrip, 'seenAtIso' | 'completedAtIso'>): boolean {
  return resolveTripStatus(trip) === 'waiting'
}

export function resolveTripStatus(
  trip: Pick<DriverTrip, 'seenAtIso' | 'completedAtIso'>,
): DriverTripStatus {
  if (trip.completedAtIso) return 'done'
  if (trip.seenAtIso) return 'accepted'
  return 'waiting'
}

export function isTripDone(trip: Pick<DriverTrip, 'completedAtIso'>): boolean {
  return Boolean(trip.completedAtIso)
}

export function isTripActive(trip: Pick<DriverTrip, 'completedAtIso'>): boolean {
  return !trip.completedAtIso
}

/** Открыл рейс → «В работе». Если уже исполнен — без изменений. */
export function withTripSeen(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso || trip.seenAtIso) return trip
  return { ...trip, seenAtIso: atIso }
}

/**
 * Закрыть рейс как исполненный.
 * Если водитель не открывал — всё равно ставим seen (принят задним числом).
 */
export function withTripDone(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso) return trip
  return {
    ...trip,
    seenAtIso: trip.seenAtIso ?? atIso,
    completedAtIso: atIso,
  }
}

export function collectUnreadTrips(trips: readonly DriverTrip[]): DriverTrip[] {
  return trips.filter(isTripUnread)
}

export function collectActiveTrips(trips: readonly DriverTrip[]): DriverTrip[] {
  return trips.filter(isTripActive)
}

export function collectDoneTrips(trips: readonly DriverTrip[]): DriverTrip[] {
  return trips.filter(isTripDone)
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
  const doneRaw = typeof r.completedAtIso === 'string' ? r.completedAtIso.trim() : ''
  const completedAtIso =
    doneRaw && !Number.isNaN(new Date(doneRaw).getTime())
      ? new Date(doneRaw).toISOString()
      : null
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
    seenAtIso: completedAtIso ? seenAtIso ?? completedAtIso : seenAtIso,
    completedAtIso,
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

/** Рейсы объекта на дату — для панели диспетчера (новые сверху). */
export function collectTripsForSite(
  trips: readonly DriverTrip[],
  siteId: string,
  dateKey: string = toDateKey(new Date()),
): DriverTrip[] {
  return trips
    .filter((t) => t.siteId === siteId && t.dateKey === dateKey)
    .slice()
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
}

export function collectTripsForDate(
  trips: readonly DriverTrip[],
  dateKey: string = toDateKey(new Date()),
): DriverTrip[] {
  return trips.filter((t) => t.dateKey === dateKey)
}

/** Рейсы за период включительно (по dateKey YYYY-MM-DD). */
export function collectTripsInRange(
  trips: readonly DriverTrip[],
  fromKey: string,
  toKey: string,
): DriverTrip[] {
  const from = fromKey.trim()
  const to = toKey.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return []
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  return trips
    .filter((t) => t.dateKey >= lo && t.dateKey <= hi)
    .slice()
    .sort((a, b) => {
      const byDate = a.dateKey.localeCompare(b.dateKey)
      if (byDate !== 0) return byDate
      return a.createdAtIso.localeCompare(b.createdAtIso)
    })
}

export type DriverTripExportRow = {
  Дата: string
  Время: string
  Статус: string
  Объект: string
  Водитель: string
  Техника: string
  Задача: string
  Откуда: string
  Куда: string
  Назначен: string
  'Открыт в': string
  'Исполнен в': string
}

export function buildDriverTripExportRows(
  trips: readonly DriverTrip[],
): DriverTripExportRow[] {
  return trips.map((t) => {
    const status = resolveTripStatus(t)
    return {
      Дата: t.dateKey,
      Время: formatTripAssignedTime(t.createdAtIso),
      Статус: DRIVER_TRIP_STATUS_LABELS[status],
      Объект: t.siteName,
      Водитель: t.driverName,
      Техника: t.vehiclePlate,
      Задача: tripCargoPreview(t),
      Откуда: tripPickupLabel(t),
      Куда: tripUnloadLabel(t),
      Назначен: formatTripAssignedDateTime(t.createdAtIso),
      'Открыт в': t.seenAtIso ? formatTripAssignedDateTime(t.seenAtIso) : '',
      'Исполнен в': t.completedAtIso ? formatTripAssignedDateTime(t.completedAtIso) : '',
    }
  })
}

export type DispatcherStatusTone = 'ok' | 'transit' | 'wait' | 'bad'

export type DispatcherStatusRow = {
  tone: DispatcherStatusTone
  label: string
  count: number
}

export type DispatcherLineStats = {
  total: number
  onLine: number
  /** Подпись под дробью. */
  hint: string
  /** Сигнал, если данные неполные (рейс без ТС и т.п.). */
  alert: string | null
  rows: readonly DispatcherStatusRow[]
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

function normalizePlate(plate: string): string {
  return plate.trim().toLocaleUpperCase('ru-RU')
}

/**
 * Сводка «Техника сейчас».
 * На линии = уникальные госномера на активных рейсах сегодня.
 * Рейсы без ТС — отдельная строка-сигнал (раньше из-за пустого номера всё было «0»).
 */
export function buildFleetLineStats(
  vehicles: readonly { plate: string }[],
  todayTrips: readonly DriverTrip[],
): DispatcherLineStats {
  const total = vehicles.length
  const plateSet = new Set(vehicles.map((v) => normalizePlate(v.plate)).filter(Boolean))
  const active = todayTrips.filter(isTripActive)
  const withPlate = active.filter((t) => {
    const p = normalizePlate(t.vehiclePlate)
    return p && plateSet.has(p)
  })
  const noPlate = active.filter((t) => !normalizePlate(t.vehiclePlate)).length
  const onLine = uniqueBy(withPlate, (t) => normalizePlate(t.vehiclePlate)).length
  const working = uniqueBy(
    withPlate.filter((t) => resolveTripStatus(t) === 'accepted'),
    (t) => normalizePlate(t.vehiclePlate),
  ).length
  const waiting = uniqueBy(
    withPlate.filter((t) => resolveTripStatus(t) === 'waiting'),
    (t) => normalizePlate(t.vehiclePlate),
  ).length
  const free = Math.max(0, total - onLine)
  const rows: DispatcherStatusRow[] = [
    { tone: 'ok', label: 'В работе', count: working },
    { tone: 'wait', label: 'Ожидают', count: waiting },
    { tone: 'bad', label: 'Свободны', count: free },
  ]

  return {
    total,
    onLine,
    hint: 'на рейсах сегодня',
    alert: noPlate > 0 ? `${noPlate} без ТС` : null,
    rows,
  }
}

/**
 * Сводка «Водители».
 * На линии = штатный водитель с активным рейсом сегодня.
 */
export function buildDriverLineStats(
  staffDriverNames: readonly string[],
  todayTrips: readonly DriverTrip[],
): DispatcherLineStats {
  const total = staffDriverNames.length
  const active = todayTrips.filter(isTripActive)

  const matchStaff = (tripName: string) =>
    staffDriverNames.find((n) => namesMatchDriver(tripName, n)) ?? null

  const activeStaff = uniqueBy(
    active
      .map((t) => matchStaff(t.driverName))
      .filter((n): n is string => Boolean(n)),
    (n) => normalizeDriverName(n),
  )
  const onLine = activeStaff.length

  const working = uniqueBy(
    active
      .filter((t) => resolveTripStatus(t) === 'accepted')
      .map((t) => matchStaff(t.driverName))
      .filter((n): n is string => Boolean(n)),
    (n) => normalizeDriverName(n),
  ).length

  const waiting = uniqueBy(
    active
      .filter((t) => resolveTripStatus(t) === 'waiting')
      .map((t) => matchStaff(t.driverName))
      .filter((n): n is string => Boolean(n)),
    (n) => normalizeDriverName(n),
  ).length

  const free = Math.max(0, total - onLine)

  return {
    total,
    onLine,
    hint: 'на рейсах сегодня',
    alert: null,
    rows: [
      { tone: 'ok', label: 'В работе', count: working },
      { tone: 'wait', label: 'Ожидают', count: waiting },
      { tone: 'bad', label: 'Свободны', count: free },
    ],
  }
}
