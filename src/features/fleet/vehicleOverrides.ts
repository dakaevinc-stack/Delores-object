import type {
  FleetInsurance,
  FleetMaintenancePlan,
  FleetPass,
  FleetRepairRecord,
  FleetSpecs,
  FleetVehicle,
} from '../../domain/fleet'
import { emitFleetChange } from './fleetEvents'

/**
 * Локальные правки по единице парка, которые менеджер вносит в карточке.
 * Хранятся в `localStorage` до появления бэка — это позволяет фиксировать
 * реальные суммы (ТО, страховка, ремонты, пропуска) прямо сейчас и не терять
 * их между перезагрузками.
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

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
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

export function saveOverrides(id: string, ov: VehicleOverrides): void {
  const ls = safeStorage()
  try {
    if (ls) {
      if (
        (!ov.insurance || Object.keys(ov.insurance).length === 0) &&
        (!ov.maintenance || Object.keys(ov.maintenance).length === 0) &&
        (!ov.specs || Object.keys(ov.specs).length === 0) &&
        !ov.repairs &&
        !ov.passes
      ) {
        ls.removeItem(KEY(id))
      } else {
        ls.setItem(KEY(id), JSON.stringify(ov))
      }
    }
  } catch {
    /* storage недоступен — молча игнорируем, UI продолжает работать в памяти */
  }
  emitFleetChange()
}

export function clearOverrides(id: string): void {
  const ls = safeStorage()
  try {
    if (ls) ls.removeItem(KEY(id))
  } catch {
    /* noop */
  }
  emitFleetChange()
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
  const ins = ov.insurance && Object.keys(ov.insurance).length > 0
  const mnt = ov.maintenance && Object.keys(ov.maintenance).length > 0
  const spc = ov.specs && Object.keys(ov.specs).length > 0
  const rep = ov.repairs !== undefined
  const pas = ov.passes !== undefined
  return Boolean(ins || mnt || spc || rep || pas)
}
