import { normalizeDriverTrip, type DriverTrip } from '../domain/driverTrip'

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
    if (prev?.seenAtIso && !t.seenAtIso) {
      return { ...t, seenAtIso: prev.seenAtIso }
    }
    return t
  })
  // Локальные рейсы, которые ещё не дошли до сервера, оставляем.
  for (const t of local) {
    if (!remoteIds.has(t.id)) merged.push(t)
  }
  return merged
}

export function markDriverTripSeen(id: string, atIso: string = new Date().toISOString()): DriverTrip[] {
  const next = loadDriverTrips().map((t) =>
    t.id === id && !t.seenAtIso ? { ...t, seenAtIso: atIso } : t,
  )
  saveDriverTrips(next)
  return next
}

export function removeDriverTrip(id: string): DriverTrip[] {
  const next = loadDriverTrips().filter((t) => t.id !== id)
  saveDriverTrips(next)
  return next
}
