import { describe, expect, it } from 'vitest'
import {
  FLEET_PART_LABEL_RU,
  FLEET_PRESET_CATEGORY_IDS,
  isFleetUnitOnControl,
  isPresetCategoryId,
  type FleetVehicle,
} from './fleet'

function stubVehicle(patch: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: 'test',
    categoryId: 'excavators',
    name: 'Test',
    plate: 'A000AA',
    insurance: { validUntilIso: '2099-01-01' },
    maintenance: {},
    repairs: [],
    passes: [],
    technicalInspection: { validUntilIso: '2099-01-01' },
    ...patch,
  } as FleetVehicle
}

describe('fleet domain', () => {
  it('isPresetCategoryId распознаёт штатные классы', () => {
    expect(isPresetCategoryId('excavators')).toBe(true)
    expect(isPresetCategoryId('custom-cranes')).toBe(false)
  })

  it('FLEET_PRESET_CATEGORY_IDS не пустой и уникален', () => {
    expect(FLEET_PRESET_CATEGORY_IDS.length).toBeGreaterThan(5)
    expect(new Set(FLEET_PRESET_CATEGORY_IDS).size).toBe(FLEET_PRESET_CATEGORY_IDS.length)
  })

  it('FLEET_PART_LABEL_RU покрывает ключевые узлы', () => {
    expect(FLEET_PART_LABEL_RU.engine).toMatch(/двигател/i)
    expect(FLEET_PART_LABEL_RU.brakes).toBeTruthy()
  })

  it('isFleetUnitOnControl реагирует на ДК, страховку, ремонт и пропуск', () => {
    expect(isFleetUnitOnControl(stubVehicle())).toBe(false)
    expect(
      isFleetUnitOnControl(
        stubVehicle({ technicalInspection: { validUntilIso: '2020-01-01' } }),
      ),
    ).toBe(true)
    expect(
      isFleetUnitOnControl(
        stubVehicle({ insurance: { validUntilIso: '2020-01-01' } }),
      ),
    ).toBe(true)
    expect(
      isFleetUnitOnControl(
        stubVehicle({
          repairs: [
            {
              id: 'r1',
              dateIso: '2026-01-01',
              title: 'fix',
              open: true,
              affectedParts: [],
            },
          ],
        }),
      ),
    ).toBe(true)
    expect(
      isFleetUnitOnControl(
        stubVehicle({
          passes: [
            {
              id: 'p1',
              name: 'МКАД',
              required: true,
              validUntilIso: '2020-01-01',
            },
          ],
        }),
      ),
    ).toBe(true)
  })
})
