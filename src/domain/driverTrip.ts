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
  /** Водитель открыл карточку. Это не приём и не старт работы. */
  seenAtIso: string | null
  /** Водитель нажал «Принять». */
  acceptedAtIso: string | null
  /** Водитель нажал «Начать». Только с этого момента рейс «в работе». */
  startedAtIso: string | null
  /** Рейс закрыт как исполненный (водитель или диспетчер). */
  completedAtIso: string | null
  cancelledAtIso: string | null
  cancelReason: string
  cancelledBy: string
  reassignReason: string
  assignmentHistory: DriverTripAssignment[]
}

export type DriverTripAssignment = {
  driverName: string
  vehiclePlate: string
  assignedAtIso: string
  assignedBy: string
  replacedAtIso: string
  replacedBy: string
  reason: string
}

export type TripMutationResult =
  | { ok: true; trip: DriverTrip }
  | { ok: false; reason: string }

/**
 * Жизненный цикл рейса:
 *   Ожидает  — назначен; открытие карточки статус не меняет
 *   Принят   — водитель нажал «Принять»
 *   В работе — водитель нажал «Начать»
 *   Исполнен / Отменён — терминальные
 *
 * Переходы: waiting → accepted → started → done.
 * Из waiting/accepted/started можно в done (диспетчер закрыл) или в cancelled.
 * Назад нельзя.
 */
export type DriverTripStatus = 'waiting' | 'accepted' | 'started' | 'done' | 'cancelled'

export const DRIVER_TRIP_STATUS_LABELS: Record<DriverTripStatus, string> = {
  waiting: 'Ожидает',
  accepted: 'Принят',
  started: 'В работе',
  done: 'Исполнен',
  cancelled: 'Отменён',
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

export function isTripUnread(
  trip: Pick<DriverTrip, 'seenAtIso' | 'completedAtIso' | 'cancelledAtIso'>,
): boolean {
  return !trip.seenAtIso && !trip.completedAtIso && !trip.cancelledAtIso
}

export function resolveTripStatus(
  trip: Pick<
    DriverTrip,
    'seenAtIso' | 'acceptedAtIso' | 'startedAtIso' | 'completedAtIso' | 'cancelledAtIso'
  >,
): DriverTripStatus {
  if (trip.cancelledAtIso) return 'cancelled'
  if (trip.completedAtIso) return 'done'
  if (trip.startedAtIso) return 'started'
  if (trip.acceptedAtIso) return 'accepted'
  return 'waiting'
}

export function isTripDone(trip: Pick<DriverTrip, 'completedAtIso'>): boolean {
  return Boolean(trip.completedAtIso)
}

export function isTripCancelled(trip: Pick<DriverTrip, 'cancelledAtIso'>): boolean {
  return Boolean(trip.cancelledAtIso)
}

export function isTripActive(
  trip: Pick<DriverTrip, 'completedAtIso' | 'cancelledAtIso'>,
): boolean {
  return !trip.completedAtIso && !trip.cancelledAtIso
}

/** Открыл карточку. Статус не меняется — это не «в работе». */
export function withTripSeen(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso || trip.cancelledAtIso || trip.seenAtIso) return trip
  return { ...trip, seenAtIso: atIso }
}

export function withTripAccepted(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso || trip.cancelledAtIso || trip.acceptedAtIso) return trip
  return {
    ...trip,
    seenAtIso: trip.seenAtIso ?? atIso,
    acceptedAtIso: atIso,
  }
}

export function withTripStarted(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso || trip.cancelledAtIso || trip.startedAtIso) return trip
  return {
    ...trip,
    seenAtIso: trip.seenAtIso ?? atIso,
    acceptedAtIso: trip.acceptedAtIso ?? atIso,
    startedAtIso: atIso,
  }
}

/**
 * Закрыть рейс как исполненный.
 * Если водитель не принимал и не начинал — отмечаем задним числом, но не выдумываем факты.
 */
export function withTripDone(
  trip: DriverTrip,
  atIso: string = new Date().toISOString(),
): DriverTrip {
  if (trip.completedAtIso || trip.cancelledAtIso) return trip
  return {
    ...trip,
    seenAtIso: trip.seenAtIso ?? atIso,
    acceptedAtIso: trip.acceptedAtIso ?? atIso,
    startedAtIso: trip.startedAtIso ?? atIso,
    completedAtIso: atIso,
  }
}

export function withTripCancelled(
  trip: DriverTrip,
  input: { reason: string; actor: string; atIso?: string },
): TripMutationResult {
  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, reason: 'Укажите причину отмены' }
  if (trip.completedAtIso) return { ok: false, reason: 'Исполненный рейс нельзя отменить' }
  if (trip.cancelledAtIso) return { ok: false, reason: 'Рейс уже отменён' }
  const atIso = input.atIso ?? new Date().toISOString()
  return {
    ok: true,
    trip: {
      ...trip,
      cancelledAtIso: atIso,
      cancelReason: reason,
      cancelledBy: input.actor.trim(),
    },
  }
}

export function reassignDriverTrip(
  trip: DriverTrip,
  input: {
    driverName: string
    vehiclePlate: string
    reason: string
    actor: string
    atIso?: string
  },
): TripMutationResult {
  if (trip.completedAtIso) return { ok: false, reason: 'Исполненный рейс нельзя переназначить' }
  if (trip.cancelledAtIso) return { ok: false, reason: 'Отменённый рейс нельзя переназначить' }
  const driverName = input.driverName.trim()
  if (!driverName) return { ok: false, reason: 'Укажите водителя' }
  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, reason: 'Укажите причину переназначения' }
  const vehiclePlate = input.vehiclePlate.trim()
  const sameDriver = namesMatchDriver(trip.driverName, driverName)
  const samePlate = trip.vehiclePlate === vehiclePlate
  if (sameDriver && samePlate) return { ok: false, reason: 'Водитель и техника те же' }
  const atIso = input.atIso ?? new Date().toISOString()
  const actor = input.actor.trim()
  const previousAssignedAt =
    trip.assignmentHistory.at(-1)?.replacedAtIso ?? trip.createdAtIso
  return {
    ok: true,
    trip: {
      ...trip,
      driverName,
      vehiclePlate,
      assignedBy: actor || trip.assignedBy,
      reassignReason: reason,
      assignmentHistory: [
        ...trip.assignmentHistory,
        {
          driverName: trip.driverName,
          vehiclePlate: trip.vehiclePlate,
          assignedAtIso: previousAssignedAt,
          assignedBy: trip.assignedBy,
          replacedAtIso: atIso,
          replacedBy: actor,
          reason,
        },
      ],
      seenAtIso: null,
      acceptedAtIso: null,
      startedAtIso: null,
    },
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

export function collectCancelledTrips(trips: readonly DriverTrip[]): DriverTrip[] {
  return trips.filter(isTripCancelled)
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
  const seenAtIso = parseIso(r.seenAtIso)
  const acceptedAtIso = parseIso(r.acceptedAtIso)
  const startedAtIso = parseIso(r.startedAtIso)
  const completedAtIso = parseIso(r.completedAtIso)
  const cancelledAtIso = parseIso(r.cancelledAtIso)
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
    acceptedAtIso: completedAtIso ? acceptedAtIso ?? completedAtIso : acceptedAtIso,
    startedAtIso: completedAtIso ? startedAtIso ?? completedAtIso : startedAtIso,
    completedAtIso,
    cancelledAtIso,
    cancelReason: typeof r.cancelReason === 'string' ? r.cancelReason.trim() : '',
    cancelledBy: typeof r.cancelledBy === 'string' ? r.cancelledBy.trim() : '',
    reassignReason: typeof r.reassignReason === 'string' ? r.reassignReason.trim() : '',
    assignmentHistory: normalizeAssignmentHistory(r.assignmentHistory),
  }
}

function parseIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function normalizeAssignmentHistory(row: unknown): DriverTripAssignment[] {
  if (!Array.isArray(row)) return []
  const out: DriverTripAssignment[] = []
  for (const x of row) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const driverName = typeof r.driverName === 'string' ? r.driverName.trim() : ''
    if (!driverName) continue
    const replacedAtIso = parseIso(r.replacedAtIso)
    if (!replacedAtIso) continue
    out.push({
      driverName,
      vehiclePlate: typeof r.vehiclePlate === 'string' ? r.vehiclePlate.trim() : '',
      assignedAtIso: parseIso(r.assignedAtIso) ?? replacedAtIso,
      assignedBy: typeof r.assignedBy === 'string' ? r.assignedBy.trim() : '',
      replacedAtIso,
      replacedBy: typeof r.replacedBy === 'string' ? r.replacedBy.trim() : '',
      reason: typeof r.reason === 'string' ? r.reason.trim() : '',
    })
  }
  return out
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

/** Все рейсы объекта, без фильтра по дате — для Excel с объекта. */
export function collectAllTripsForSite(
  trips: readonly DriverTrip[],
  siteId: string,
): DriverTrip[] {
  const id = siteId.trim()
  if (!id) return []
  return trips.filter((t) => t.siteId === id)
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
  'Принят в': string
  'Начат в': string
  'Исполнен в': string
  'Отменён в': string
  'Причина отмены': string
  'Бывшие водители': string
}

export function buildDriverTripExportRows(
  trips: readonly DriverTrip[],
): DriverTripExportRow[] {
  return trips.map((t) => {
    const status = resolveTripStatus(t)
    const previous = t.assignmentHistory
      .map((a) => [a.driverName, a.vehiclePlate, a.reason].filter(Boolean).join(' / '))
      .filter(Boolean)
      .join('; ')
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
      'Принят в': t.acceptedAtIso ? formatTripAssignedDateTime(t.acceptedAtIso) : '',
      'Начат в': t.startedAtIso ? formatTripAssignedDateTime(t.startedAtIso) : '',
      'Исполнен в': t.completedAtIso ? formatTripAssignedDateTime(t.completedAtIso) : '',
      'Отменён в': t.cancelledAtIso ? formatTripAssignedDateTime(t.cancelledAtIso) : '',
      'Причина отмены': t.cancelReason,
      'Бывшие водители': previous,
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
    withPlate.filter((t) => resolveTripStatus(t) === 'started'),
    (t) => normalizePlate(t.vehiclePlate),
  ).length
  const waiting = uniqueBy(
    withPlate.filter((t) => {
      const status = resolveTripStatus(t)
      return status === 'waiting' || status === 'accepted'
    }),
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
      .filter((t) => resolveTripStatus(t) === 'started')
      .map((t) => matchStaff(t.driverName))
      .filter((n): n is string => Boolean(n)),
    (n) => normalizeDriverName(n),
  ).length

  const waiting = uniqueBy(
    active
      .filter((t) => {
        const status = resolveTripStatus(t)
        return status === 'waiting' || status === 'accepted'
      })
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
