import { describe, expect, it } from 'vitest'
import { FLEET_PART_LABEL_RU, FLEET_PRESET_CATEGORY_IDS, isPresetCategoryId } from './fleet'

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
})
