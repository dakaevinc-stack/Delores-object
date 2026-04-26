import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FleetCategory, FleetCategoryId, FleetVehicle } from '../../domain/fleet'
import { FLEET_CATEGORIES, FLEET_VEHICLES } from '../../data/fleet.mock'
import {
  loadRegistry,
  saveRegistry,
  shortenCategoryTitle,
  slugifyCategory,
  type FleetRegistry,
} from './fleetRegistry'

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
 *   базовый mock без удалённых + добавленные пользователем + кастомные классы.
 *
 * Подписан на `storage`-событие, чтобы изменения реестра, сделанные
 * в другой вкладке, сразу подхватывались в текущей.
 */
export function useFleetRegistry(): UseFleetRegistry {
  const [reg, setReg] = useState<FleetRegistry>(() => loadRegistry())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'fleet:registry') {
        setReg(loadRegistry())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const vehicles = useMemo<FleetVehicle[]>(() => {
    const removed = new Set(reg.removedIds)
    const base = FLEET_VEHICLES.filter((v) => !removed.has(v.id))
    /* Добавленные — в конец списка, чтобы их было легко найти и не путать порядок. */
    return [...base, ...reg.added]
  }, [reg])

  const categories = useMemo<FleetCategory[]>(() => {
    /* Кастомные категории — только те, у которых есть хотя бы одна техника
       (или они были явно сохранены). Чтобы случайные дубли не замусоривали UI. */
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

      /* Подчищаем кастомную категорию, если после удаления в ней не осталось техники
         (ни в mock, ни среди пользовательских — кастомных в mock нет). */
      const allRemaining = [
        ...FLEET_VEHICLES.filter((v) => !nextRemovedIds.includes(v.id)),
        ...nextAdded,
      ]
      const usedCustomIds = new Set(allRemaining.map((v) => v.categoryId))
      const nextCustomCategories = reg.customCategories.filter((c) => usedCustomIds.has(c.id))

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
      /* Если такой уже есть среди preset — вернём preset, иначе ищем в кастомных
         по нормализованному названию. */
      const norm = cleaned.toLowerCase()
      const preset = FLEET_CATEGORIES.find((c) => c.title.toLowerCase() === norm)
      if (preset) return preset
      const existing = reg.customCategories.find(
        (c) => c.title.toLowerCase() === norm,
      )
      if (existing) return existing
      const id = slugifyCategory(cleaned)
      /* Если слаг уже занят (коллизия), добавим числовой суффикс. */
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
