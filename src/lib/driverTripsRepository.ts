import {
  normalizeDriverTrip,
  reassignDriverTrip,
  withTripAccepted,
  withTripCancelled,
  withTripDone,
  withTripSeen,
  withTripStarted,
  type DriverTrip,
} from '../domain/driverTrip'

const KEY = 'deloresh-driver-trips:v1'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadDriverTrips(): DriverTrip[] {
  const ls = safeStorage()
  if (!ls) return []
  try {
    const raw = ls.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeDriverTrip).filter((x): x is DriverTrip => x !== null)
  } catch {
    return []
  }
}

export function saveDriverTrips(trips: readonly DriverTrip[]): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    ls.setItem(KEY, JSON.stringify(trips))
  } catch {
    /* quota */
  }
}

export function upsertDriverTrip(trip: DriverTrip): DriverTrip[] {
  const prev = loadDriverTrips().filter((t) => t.id !== trip.id)
  const next = [trip, ...prev]
  saveDriverTrips(next)
  return next
}

export function mergeDriverTrips(local: readonly DriverTrip[], remote: readonly DriverTrip[]): DriverTrip[] {
  const localById = new Map(local.map((t) => [t.id, t]))
  const remoteIds = new Set(remote.map((t) => t.id))
  const merged = remote.map((t) => {
    const prev = localById.get(t.id)
    if (!prev) return t
    const remoteReassigned =
      (t.assignmentHistory?.length ?? 0) > (prev.assignmentHistory?.length ?? 0)
    if (remoteReassigned) {
      return {
        ...t,
        completedAtIso: t.completedAtIso ?? prev.completedAtIso,
        cancelledAtIso: t.cancelledAtIso ?? prev.cancelledAtIso,
        cancelReason: t.cancelReason || prev.cancelReason,
        cancelledBy: t.cancelledBy || prev.cancelledBy,
      }
    }
    return {
      ...t,
      seenAtIso: t.seenAtIso ?? prev.seenAtIso,
      acceptedAtIso: t.acceptedAtIso ?? prev.acceptedAtIso,
      startedAtIso: t.startedAtIso ?? prev.startedAtIso,
      completedAtIso: t.completedAtIso ?? prev.completedAtIso,
      cancelledAtIso: t.cancelledAtIso ?? prev.cancelledAtIso,
      cancelReason: t.cancelReason || prev.cancelReason,
      cancelledBy: t.cancelledBy || prev.cancelledBy,
      assignmentHistory:
        (t.assignmentHistory?.length ?? 0) >= (prev.assignmentHistory?.length ?? 0)
          ? t.assignmentHistory
          : prev.assignmentHistory,
    }
  })
  for (const t of local) {
    if (!remoteIds.has(t.id)) merged.push(t)
  }
  return merged
}

function mapTrip(id: string, next: (trip: DriverTrip) => DriverTrip): DriverTrip[] {
  const list = loadDriverTrips().map((t) => (t.id === id ? next(t) : t))
  saveDriverTrips(list)
  return list
}

export function markDriverTripSeen(id: string, atIso: string = new Date().toISOString()): DriverTrip[] {
  return mapTrip(id, (t) => withTripSeen(t, atIso))
}

export function markDriverTripAccepted(id: string, atIso: string = new Date().toISOString()): DriverTrip[] {
  return mapTrip(id, (t) => withTripAccepted(t, atIso))
}

export function markDriverTripStarted(id: string, atIso: string = new Date().toISOString()): DriverTrip[] {
  return mapTrip(id, (t) => withTripStarted(t, atIso))
}

export function markDriverTripDone(id: string, atIso: string = new Date().toISOString()): DriverTrip[] {
  return mapTrip(id, (t) => withTripDone(t, atIso))
}

export function cancelDriverTripLocal(
  id: string,
  input: { reason: string; actor: string; atIso?: string },
): { ok: true; trips: DriverTrip[] } | { ok: false; reason: string } {
  const current = loadDriverTrips().find((t) => t.id === id)
  if (!current) return { ok: false, reason: 'Рейс не найден' }
  const result = withTripCancelled(current, input)
  if (!result.ok) return result
  return { ok: true, trips: upsertDriverTrip(result.trip) }
}

export function reassignDriverTripLocal(
  id: string,
  input: {
    driverName: string
    vehiclePlate: string
    reason: string
    actor: string
    atIso?: string
  },
): { ok: true; trips: DriverTrip[] } | { ok: false; reason: string } {
  const current = loadDriverTrips().find((t) => t.id === id)
  if (!current) return { ok: false, reason: 'Рейс не найден' }
  const result = reassignDriverTrip(current, input)
  if (!result.ok) return result
  return { ok: true, trips: upsertDriverTrip(result.trip) }
}

export function removeDriverTrip(id: string): DriverTrip[] {
  const next = loadDriverTrips().filter((t) => t.id !== id)
  saveDriverTrips(next)
  return next
}
