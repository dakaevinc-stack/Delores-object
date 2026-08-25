import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FleetCategory, FleetCategoryId, FleetVehicle } from '../../domain/fleet'
import { FLEET_CATEGORIES, FLEET_VEHICLES } from '../../data/fleet.mock'
import { FLEET_CHANGE_EVENT } from './fleetEvents'
import {
  loadRegistry,
  saveRegistry,
  shortenCategoryTitle,
  slugifyCategory,
  type FleetRegistry,
} from './fleetRegistry'
import { loadOverrides, mergeOverrides } from './vehicleOverrides'

export type UseFleetRegistry = {
  vehicles: FleetVehicle[]
  categories: FleetCategory[]
  getCategory: (id: FleetCategoryId) => FleetCategory | undefined
  /**
   * Находит существующую кастомную категорию по имени или создаёт новую.
   * Возвращает FleetCategory, которую можно сразу указать в vehicle.categoryId.
   */
  ensureCustomCategory: (title: string) => FleetCategory
  add: (vehicle: FleetVehicle) => void
  remove: (id: string) => void
  getById: (id: string) => FleetVehicle | undefined
  countByCategory: (id: FleetCategoryId) => number
  vehiclesByCategory: (id: FleetCategoryId) => FleetVehicle[]
}

/**
 * Хук даёт «эффективный» список единиц парка и классов:
 *   базовый mock без удалённых + добавленные пользователем + кастомные классы,
 *   с локальными правками карточки (страховка, ремонты, пропуска…).
 *
 * Подписан на `storage` и `deloresh-fleet-change`, чтобы цифры на главной
 * и в хабах обновлялись сразу после добавления/удаления/правок.
 */
export function useFleetRegistry(): UseFleetRegistry {
  const [reg, setReg] = useState<FleetRegistry>(() => loadRegistry())
  /** Бамп при любом изменении парка — перечитываем overrides. */
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const refresh = () => {
      setReg(loadRegistry())
      setEpoch((n) => n + 1)
    }
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === 'fleet:registry' ||
        (typeof e.key === 'string' && e.key.startsWith('fleet:overrides:'))
      ) {
        refresh()
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(FLEET_CHANGE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(FLEET_CHANGE_EVENT, refresh)
    }
  }, [])

  const vehicles = useMemo<FleetVehicle[]>(() => {
    const removed = new Set(reg.removedIds)
    const base = FLEET_VEHICLES.filter((v) => !removed.has(v.id))
    const list = [...base, ...reg.added]
    return list.map((v) => mergeOverrides(v, loadOverrides(v.id)))
    // epoch — явная зависимость на правки overrides
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, epoch])

  const categories = useMemo<FleetCategory[]>(() => {
    return [...FLEET_CATEGORIES, ...reg.customCategories]
  }, [reg])

  const persist = useCallback((next: FleetRegistry) => {
    setReg(next)
    saveRegistry(next)
  }, [])

  const add = useCallback(
    (vehicle: FleetVehicle) => {
      persist({ ...reg, added: [...reg.added, vehicle] })
    },
    [reg, persist],
  )

  const remove = useCallback(
    (id: string) => {
      const isAdded = reg.added.some((v) => v.id === id)
      const nextAdded = isAdded ? reg.added.filter((v) => v.id !== id) : reg.added
      const nextRemovedIds =
        isAdded || reg.removedIds.includes(id)
          ? reg.removedIds
          : [...reg.removedIds, id]

      const allRemaining = [
        ...FLEET_VEHICLES.filter((v) => !nextRemovedIds.includes(v.id)),
        ...nextAdded,
      ]
      const usedCustomIds = new Set(allRemaining.map((v) => v.categoryId))
      const nextCustomCategories = reg.customCategories.filter((c) =>
        usedCustomIds.has(c.id),
      )

      persist({
        added: nextAdded,
        removedIds: nextRemovedIds,
        customCategories: nextCustomCategories,
      })
    },
    [reg, persist],
  )

  const getById = useCallback(
    (id: string) => vehicles.find((v) => v.id === id),
    [vehicles],
  )

  const countByCategory = useCallback(
    (id: FleetCategoryId) => vehicles.filter((v) => v.categoryId === id).length,
    [vehicles],
  )

  const vehiclesByCategory = useCallback(
    (id: FleetCategoryId) => vehicles.filter((v) => v.categoryId === id),
    [vehicles],
  )

  const getCategory = useCallback(
    (id: FleetCategoryId) => categories.find((c) => c.id === id),
    [categories],
  )

  const ensureCustomCategory = useCallback(
    (title: string): FleetCategory => {
      const cleaned = title.trim()
      const norm = cleaned.toLowerCase()
      const preset = FLEET_CATEGORIES.find((c) => c.title.toLowerCase() === norm)
      if (preset) return preset
      const existing = reg.customCategories.find(
        (c) => c.title.toLowerCase() === norm,
      )
      if (existing) return existing
      const id = slugifyCategory(cleaned)
      const usedIds = new Set([
        ...FLEET_CATEGORIES.map((c) => c.id),
        ...reg.customCategories.map((c) => c.id),
      ])
      let uniqueId = id
      let i = 2
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}-${i++}`
      }
      const cat: FleetCategory = {
        id: uniqueId,
        title: cleaned,
        shortTitle: shortenCategoryTitle(cleaned),
        custom: true,
      }
      persist({ ...reg, customCategories: [...reg.customCategories, cat] })
      return cat
    },
    [reg, persist],
  )

  return {
    vehicles,
    categories,
    getCategory,
    ensureCustomCategory,
    add,
    remove,
    getById,
    countByCategory,
    vehiclesByCategory,
  }
}
