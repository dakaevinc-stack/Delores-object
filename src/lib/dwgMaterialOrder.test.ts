import { describe, expect, it } from 'vitest'
import {
  calcAsphaltOrder,
  calcCrushedStoneOrder,
  calcCurbConcreteOrder,
  calcSandOrder,
  calcSoilOrder,
} from './dwgMaterialOrder'

describe('dwgMaterialOrder', () => {
  it('calculates asphalt tons using mix densities', () => {
    // 100 м², 6 см coarse 2.41 + 4 см fine 2.39
    const r = calcAsphaltOrder(100, {
      binderCm: 6,
      wearingCm: 4,
      binderMixId: 'coarse',
      wearingMixId: 'fine',
    })
    expect(r.totalCm).toBe(10)
    expect(r.binderVolumeM3).toBeCloseTo(6, 6)
    expect(r.wearingVolumeM3).toBeCloseTo(4, 6)
    expect(r.binderTons).toBeCloseTo(6 * 2.41, 6)
    expect(r.wearingTons).toBeCloseTo(4 * 2.39, 6)
    expect(r.totalTons).toBeCloseTo(6 * 2.41 + 4 * 2.39, 6)
    expect(r.binderMixLabel).toBe('Крупнозернистый')
    expect(r.wearingMixLabel).toBe('Мелкозернистый')
  })

  it('uses SMA density for wearing layer', () => {
    const r = calcAsphaltOrder(50, {
      binderCm: 0,
      wearingCm: 4,
      wearingMixId: 'sma20',
    })
    expect(r.wearingTons).toBeCloseTo(2 * 2.52, 6)
    expect(r.wearingMixLabel).toBe('ЩМА-20')
  })

  it('calculates soil cubic meters for lawn', () => {
    const r = calcSoilOrder(50, 10)
    expect(r.volumeM3).toBeCloseTo(5, 6)
  })

  it('calculates B15 P3 concrete for curb lock from perimeter', () => {
    const r = calcCurbConcreteOrder(100, 10, 'B15')
    expect(r.volumeM3Min).toBeCloseTo(6, 6)
    expect(r.volumeM3Max).toBeCloseTo(6.5, 6)
    expect(r.volumeM3Mid).toBeCloseTo(6.25, 6)
    expect(r.grade).toBe('B15')
  })

  it('keeps selected concrete grade on order result', () => {
    expect(calcCurbConcreteOrder(10, 10, 'B30').grade).toBe('B30')
  })

  it('calculates crushed stone volume by area and thickness', () => {
    const r = calcCrushedStoneOrder(100, 20, '5/20')
    expect(r.volumeM3).toBeCloseTo(20, 6)
    expect(r.fraction).toBe('5/20')
  })

  it('clamps crushed stone thickness to 5–100 cm', () => {
    expect(calcCrushedStoneOrder(10, 2, '20/40').thicknessCm).toBe(5)
    expect(calcCrushedStoneOrder(10, 200, '40/70').thicknessCm).toBe(100)
  })

  it('calculates sand volume by area and thickness', () => {
    expect(calcSandOrder(80, 10).volumeM3).toBeCloseTo(8, 6)
  })
})
