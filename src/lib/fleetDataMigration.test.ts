import { beforeEach, describe, expect, it } from 'vitest'

import { migrateLocalFleetData } from './fleetDataMigration'
import { loadRegistry, saveRegistry } from '../features/fleet/fleetRegistry'
import { loadAllOverrides, replaceAllOverrides } from '../features/fleet/vehicleOverrides'
import { FLEET_VEHICLES } from '../data/fleet.mock'
import type { FleetVehicle } from '../domain/fleet'

function vehicle(id: string, plate: string, model: string): FleetVehicle {
  return {
    id,
    categoryId: 'light-trucks',
    plate,
    model,
    vinOrFrame: 'X0000000000000000',
    repairs: [],
    maintenance: {},
    insurance: { validUntilIso: '2027-01-01' },
    passes: [],
    schematicVariant: 'truck',
  }
}

describe('чистка локальных данных парка', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('убирает тестовые машины аудита', () => {
    saveRegistry(
      {
        added: [
          vehicle('v-new-1', 'А999АА777', 'АУДИТ_20260908_НЕ_РАБОЧАЯ'),
          vehicle('v-new-2', 'В111ВВ777', 'ГАЗель настоящая'),
        ],
        removedIds: [],
        customCategories: [],
      },
      { syncRemote: false },
    )

    const result = migrateLocalFleetData()

    expect(result.removedAuditVehicles).toBe(1)
    expect(loadRegistry().added.map((v) => v.id)).toEqual(['v-new-2'])
  })

  it('убирает отметки об удалении по старой схеме id', () => {
    saveRegistry(
      { added: [], removedIds: ['dump-trucks-01', 'cars-c905cc99'], customCategories: [] },
      { syncRemote: false },
    )

    const result = migrateLocalFleetData()

    expect(result.removedLegacyRemovedIds).toBe(1)
    expect(loadRegistry().removedIds).toEqual(['cars-c905cc99'])
  })

  it('убирает правки, у которых больше нет машины', () => {
    const alive = FLEET_VEHICLES[0].id
    replaceAllOverrides(
      {
        [alive]: { specs: { color: 'белый' } },
        'light-trucks-07': { specs: { color: 'синий' } },
      },
      { syncRemote: false },
    )

    const result = migrateLocalFleetData()

    expect(result.removedOrphanOverrides).toBe(1)
    expect(Object.keys(loadAllOverrides())).toEqual([alive])
  })

  it('второй запуск ничего не меняет', () => {
    saveRegistry(
      {
        added: [vehicle('v-new-1', 'А999АА777', 'АУДИТ_20260908_НЕ_РАБОЧАЯ')],
        removedIds: ['dump-trucks-01'],
        customCategories: [],
      },
      { syncRemote: false },
    )

    migrateLocalFleetData()
    const second = migrateLocalFleetData()

    expect(second).toEqual({
      removedAuditVehicles: 0,
      removedLegacyRemovedIds: 0,
      removedOrphanOverrides: 0,
    })
  })
})
