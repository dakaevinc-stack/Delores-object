/**
 * Подтягивает на устройство данные, которые раньше жили только в localStorage
 * (техника, объекты, правки карточек), и при необходимости заливает локальный
 * черновик на сервер один раз.
 */
import {
  loadRegistry,
  saveRegistry,
  type FleetRegistry,
} from '../features/fleet/fleetRegistry'
import {
  loadAllOverrides,
  replaceAllOverrides,
  type VehicleOverrides,
} from '../features/fleet/vehicleOverrides'
import {
  fetchFleetOverridesRemote,
  fetchFleetRegistryRemote,
  fetchUserSitesRemote,
  putFleetOverridesRemote,
  putFleetRegistryRemote,
  putUserSitesRemote,
} from './siteFormsApi'
import { listUserSites, replaceUserSites } from './sitesRepository'
import type { ConstructionSite } from '../types/constructionSite'
import type { FleetCategory, FleetVehicle } from '../domain/fleet'

function isFleetVehicle(x: unknown): x is FleetVehicle {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.name === 'string'
}

function isFleetCategory(x: unknown): x is FleetCategory {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.title === 'string'
}

function parseRegistry(raw: {
  added: unknown[]
  removedIds: string[]
  customCategories: unknown[]
}): FleetRegistry {
  return {
    added: raw.added.filter(isFleetVehicle),
    removedIds: raw.removedIds,
    customCategories: raw.customCategories.filter(isFleetCategory),
  }
}

function registryEmpty(reg: FleetRegistry): boolean {
  return (
    reg.added.length === 0 &&
    reg.removedIds.length === 0 &&
    reg.customCategories.length === 0
  )
}

function isUserSite(x: unknown): x is ConstructionSite {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.status === 'string' &&
    r.executive != null &&
    typeof r.executive === 'object'
  )
}

function parseOverridesMap(raw: Record<string, unknown>): Record<string, VehicleOverrides> {
  const out: Record<string, VehicleOverrides> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    out[id] = value as VehicleOverrides
  }
  return out
}

let started = false
let visibilityBound = false

export async function bootstrapCrossDeviceSync(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!visibilityBound) {
    visibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        started = false
        void bootstrapCrossDeviceSync()
      }
    })
  }
  if (started) return
  started = true

  const remoteReg = await fetchFleetRegistryRemote()
  if (remoteReg) {
    const parsed = parseRegistry(remoteReg)
    const local = loadRegistry()
    if (registryEmpty(parsed) && !registryEmpty(local)) {
      await putFleetRegistryRemote(local)
    } else if (!registryEmpty(parsed)) {
      saveRegistry(parsed, { syncRemote: false })
    }
  }

  const remoteOv = await fetchFleetOverridesRemote()
  if (remoteOv) {
    const parsed = parseOverridesMap(remoteOv)
    const local = loadAllOverrides()
    const remoteEmpty = Object.keys(parsed).length === 0
    const localEmpty = Object.keys(local).length === 0
    if (remoteEmpty && !localEmpty) {
      await putFleetOverridesRemote(local)
    } else if (!remoteEmpty) {
      replaceAllOverrides(parsed, { syncRemote: false })
    }
  }

  const remoteSites = await fetchUserSitesRemote()
  if (remoteSites) {
    const parsed = remoteSites.filter(isUserSite)
    const local = [...listUserSites()]
    if (parsed.length === 0 && local.length > 0) {
      await putUserSitesRemote(local)
    } else if (parsed.length > 0) {
      replaceUserSites(parsed, { syncRemote: false })
    }
  }
}
