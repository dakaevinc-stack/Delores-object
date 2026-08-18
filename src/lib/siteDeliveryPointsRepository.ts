import {
  normalizeDeliveryPoint,
  type SiteDeliveryPoint,
} from '../domain/siteDeliveryPoint'

const KEY = (siteId: string) => `deloresh-site-delivery-point:${siteId}:v1`

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadSiteDeliveryPoint(siteId: string): SiteDeliveryPoint | null {
  const ls = safeStorage()
  if (!ls) return null
  try {
    const raw = ls.getItem(KEY(siteId))
    if (!raw) return null
    return normalizeDeliveryPoint(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveSiteDeliveryPoint(siteId: string, point: SiteDeliveryPoint | null): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    if (!point) {
      ls.removeItem(KEY(siteId))
      return
    }
    ls.setItem(KEY(siteId), JSON.stringify(point))
  } catch {
    /* quota / private mode */
  }
}

export function loadSiteDeliveryPointsForSites(
  siteIds: readonly string[],
): ReadonlyMap<string, SiteDeliveryPoint> {
  const map = new Map<string, SiteDeliveryPoint>()
  for (const id of siteIds) {
    const point = loadSiteDeliveryPoint(id)
    if (point) map.set(id, point)
  }
  return map
}
