import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  FleetInsurance,
  FleetMaintenancePlan,
  FleetPass,
  FleetRepairRecord,
  FleetSpecs,
  FleetVehicle,
} from '../../domain/fleet'
import {
  clearOverrides,
  hasOverrides,
  loadOverrides,
  mergeOverrides,
  saveOverrides,
  type VehicleOverrides,
} from './vehicleOverrides'

export type FleetVehicleState = {
  /** Итоговая единица с применёнными правками. */
  vehicle: FleetVehicle
  isEditing: boolean
  setEditing: (v: boolean) => void
  isEdited: boolean
  reset: () => void
  patchInsurance: (patch: Partial<FleetInsurance>) => void
  patchMaintenance: (patch: Partial<FleetMaintenancePlan>) => void
  patchSpecs: (patch: Partial<FleetSpecs>) => void
  setRepairs: (updater: (prev: FleetRepairRecord[]) => FleetRepairRecord[]) => void
  setPasses: (updater: (prev: FleetPass[]) => FleetPass[]) => void
}

export function useFleetVehicleState(base: FleetVehicle): FleetVehicleState {
  const [overrides, setOverrides] = useState<VehicleOverrides>(() => loadOverrides(base.id))
  const [isEditing, setEditing] = useState(false)

  /* Пересобираем состояние, если пользователь ушёл и вернулся к другой единице. */
  useEffect(() => {
    setOverrides(loadOverrides(base.id))
    setEditing(false)
  }, [base.id])

  const vehicle = useMemo(() => mergeOverrides(base, overrides), [base, overrides])

  const persist = useCallback(
    (next: VehicleOverrides) => {
      setOverrides(next)
      saveOverrides(base.id, next)
    },
    [base.id],
  )

  const patchInsurance = useCallback(
    (patch: Partial<FleetInsurance>) => {
      persist({
        ...overrides,
        insurance: { ...(overrides.insurance ?? {}), ...patch },
      })
    },
    [overrides, persist],
  )

  const patchMaintenance = useCallback(
    (patch: Partial<FleetMaintenancePlan>) => {
      persist({
        ...overrides,
        maintenance: { ...(overrides.maintenance ?? {}), ...patch },
      })
    },
    [overrides, persist],
  )

  const patchSpecs = useCallback(
    (patch: Partial<FleetSpecs>) => {
      /* Пустые строки и undefined — возвращаем к значению «как в базе»,
         иначе ключ навсегда останется в override. */
      const next = { ...(overrides.specs ?? {}) }
      for (const [k, v] of Object.entries(patch) as [keyof FleetSpecs, unknown][]) {
        if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
          delete (next as Record<string, unknown>)[k as string]
        } else {
          ;(next as Record<string, unknown>)[k as string] = v
        }
      }
      const specsOverride = Object.keys(next).length > 0 ? next : undefined
      persist({ ...overrides, specs: specsOverride })
    },
    [overrides, persist],
  )

  const setRepairs = useCallback(
    (updater: (prev: FleetRepairRecord[]) => FleetRepairRecord[]) => {
      const prev = overrides.repairs ?? base.repairs
      const next = updater(prev)
      persist({ ...overrides, repairs: next })
    },
    [overrides, persist, base.repairs],
  )

  const setPasses = useCallback(
    (updater: (prev: FleetPass[]) => FleetPass[]) => {
      const prev = overrides.passes ?? base.passes
      const next = updater(prev)
      persist({ ...overrides, passes: next })
    },
    [overrides, persist, base.passes],
  )

  const reset = useCallback(() => {
    clearOverrides(base.id)
    setOverrides({})
  }, [base.id])

  return {
    vehicle,
    isEditing,
    setEditing,
    isEdited: hasOverrides(overrides),
    reset,
    patchInsurance,
    patchMaintenance,
    patchSpecs,
    setRepairs,
    setPasses,
  }
}
