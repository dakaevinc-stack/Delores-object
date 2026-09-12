import { describe, expect, it } from 'vitest'
import {
  ASPHALT_MIXES,
  CRUSHED_STONE_FRACTIONS,
  DEFAULT_ASPHALT_WEARING_MIX,
  DEFAULT_CRUSHED_STONE_FRACTION,
  DEFAULT_LAYER_THICKNESS_CM,
  calcAsphaltOrder,
  calcCrushedStoneOrder,
  calcSandOrder,
  calcSoilOrder,
  clampLayerThicknessCm,
  formatTons,
  formatVolumeM3,
} from './dwgMaterialOrder'

describe('material order scenarios for zone sheet', () => {
  const area = 1632.48

  it('asphalt order grows with thickness', () => {
    const thin = calcAsphaltOrder(area, {
      binderCm: 4,
      wearingCm: 3,
      wearingMixId: DEFAULT_ASPHALT_WEARING_MIX,
    })
    const thick = calcAsphaltOrder(area, {
      binderCm: 8,
      wearingCm: 5,
      wearingMixId: DEFAULT_ASPHALT_WEARING_MIX,
    })
    expect(thick.totalTons).toBeGreaterThan(thin.totalTons)
    expect(formatTons(thick.totalTons)).toMatch(/т/)
  })

  it('soil / crushed / sand volumes are positive for area', () => {
    expect(calcSoilOrder(area, 10).volumeM3).toBeGreaterThan(0)
    expect(calcCrushedStoneOrder(area, DEFAULT_LAYER_THICKNESS_CM).volumeM3).toBeGreaterThan(0)
    expect(calcSandOrder(area, DEFAULT_LAYER_THICKNESS_CM).volumeM3).toBeGreaterThan(0)
    expect(formatVolumeM3(1.234)).toMatch(/м/)
  })

  it('thickness clamp keeps crushed/sand in range', () => {
    expect(clampLayerThicknessCm(-5)).toBeGreaterThanOrEqual(0)
    expect(clampLayerThicknessCm(999)).toBeLessThanOrEqual(100)
  })

  it('catalogs are non-empty', () => {
    expect(ASPHALT_MIXES.length).toBeGreaterThan(0)
    expect(CRUSHED_STONE_FRACTIONS.length).toBeGreaterThan(0)
    expect(CRUSHED_STONE_FRACTIONS).toContain(DEFAULT_CRUSHED_STONE_FRACTION)
  })

  it('zero area yields zero order', () => {
    expect(
      calcAsphaltOrder(0, {
        binderCm: 6,
        wearingCm: 4,
        wearingMixId: DEFAULT_ASPHALT_WEARING_MIX,
      }).totalTons,
    ).toBe(0)
    expect(calcSoilOrder(0, 10).volumeM3).toBe(0)
  })
})
