import type {
  FleetInsurance,
  FleetMaintenancePlan,
  FleetPass,
  FleetRepairRecord,
  FleetSpecs,
  FleetVehicle,
} from '../../domain/fleet'
import { emitFleetChange } from './fleetEvents'
import { putFleetOverridesRemote } from '../../lib/siteFormsApi'

/**
 * Локальные правки по единице парка, которые менеджер вносит в карточке.
 * Кэш — localStorage; карта целиком уходит на сервер (`/api/fleet/overrides`).
 */
export type VehicleOverrides = {
  insurance?: Partial<FleetInsurance>
  maintenance?: Partial<FleetMaintenancePlan>
  /** Если задано — полный журнал ремонтов заменяется правкой. */
  repairs?: FleetRepairRecord[]
  /** Если задано — полный список пропусков заменяется правкой. */
  passes?: FleetPass[]
  /** Правки «паспортных» данных: пробег, СТС, ПТС, владение и т.д. */
  specs?: Partial<FleetSpecs>
}

const KEY = (id: string) => `fleet:overrides:${id}`
const KEY_PREFIX = 'fleet:overrides:'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function isEmptyOverrides(ov: VehicleOverrides): boolean {
  return (
    (!ov.insurance || Object.keys(ov.insurance).length === 0) &&
    (!ov.maintenance || Object.keys(ov.maintenance).length === 0) &&
    (!ov.specs || Object.keys(ov.specs).length === 0) &&
    !ov.repairs &&
    !ov.passes
  )
}

export function loadOverrides(id: string): VehicleOverrides {
  const ls = safeStorage()
  if (!ls) return {}
  try {
    const raw = ls.getItem(KEY(id))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as VehicleOverrides
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadAllOverrides(): Record<string, VehicleOverrides> {
  const ls = safeStorage()
  if (!ls) return {}
  const out: Record<string, VehicleOverrides> = {}
  try {
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i)
      if (!k || !k.startsWith(KEY_PREFIX)) continue
      const id = k.slice(KEY_PREFIX.length)
      if (!id) continue
      const ov = loadOverrides(id)
      if (!isEmptyOverrides(ov)) out[id] = ov
    }
  } catch {
    return out
  }
  return out
}

function persistMapLocal(map: Record<string, VehicleOverrides>): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i)
      if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k)
    }
    for (const k of toRemove) ls.removeItem(k)
    for (const [id, ov] of Object.entries(map)) {
      if (isEmptyOverrides(ov)) continue
      ls.setItem(KEY(id), JSON.stringify(ov))
    }
  } catch {
    /* storage недоступен */
  }
}

export function replaceAllOverrides(
  map: Record<string, VehicleOverrides>,
  opts?: { syncRemote?: boolean },
): void {
  persistMapLocal(map)
  emitFleetChange()
  if (opts?.syncRemote !== false) {
    void putFleetOverridesRemote(map)
  }
}

export function saveOverrides(
  id: string,
  ov: VehicleOverrides,
  opts?: { syncRemote?: boolean },
): void {
  const ls = safeStorage()
  try {
    if (ls) {
      if (isEmptyOverrides(ov)) {
        ls.removeItem(KEY(id))
      } else {
        ls.setItem(KEY(id), JSON.stringify(ov))
      }
    }
  } catch {
    /* storage недоступен — молча игнорируем, UI продолжает работать в памяти */
  }
  emitFleetChange()
  if (opts?.syncRemote !== false) {
    void putFleetOverridesRemote(loadAllOverrides())
  }
}

export function clearOverrides(id: string, opts?: { syncRemote?: boolean }): void {
  const ls = safeStorage()
  try {
    if (ls) ls.removeItem(KEY(id))
  } catch {
    /* noop */
  }
  emitFleetChange()
  if (opts?.syncRemote !== false) {
    void putFleetOverridesRemote(loadAllOverrides())
  }
}

/** Накладываем правки на базовую запись из mock/бэка. */
export function mergeOverrides(base: FleetVehicle, ov: VehicleOverrides): FleetVehicle {
  const baseSpecs: FleetSpecs = base.specs ?? {}
  const mergedSpecs = ov.specs ? { ...baseSpecs, ...ov.specs } : baseSpecs
  return {
    ...base,
    insurance: { ...base.insurance, ...(ov.insurance ?? {}) },
    maintenance: { ...base.maintenance, ...(ov.maintenance ?? {}) },
    repairs: ov.repairs ?? base.repairs,
    passes: ov.passes ?? base.passes,
    specs: mergedSpecs,
  }
}

export function hasOverrides(ov: VehicleOverrides): boolean {
  return !isEmptyOverrides(ov)
}
