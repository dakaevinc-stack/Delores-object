import { describe, expect, it } from 'vitest'
import { PinchTracker } from './touchPinchZoom'
import {
  clampRasterPan,
  zoomRasterViewAt,
  type RasterViewState,
} from './dwgRasterMeasure'
import { pointerOnStage } from './dwgPlanMeasure'

function baseView(over: Partial<RasterViewState> = {}): RasterViewState {
  return {
    scale: 1,
    x: 0,
    y: 0,
    stageW: 400,
    stageH: 700,
    imgW: 2000,
    imgH: 1400,
    ...over,
  }
}

/** Сценарии жестов чертежа без DOM — математика + PinchTracker. */
describe('DWG viewer gesture scenarios', () => {
  it('pinch-out then remaining finger: no second pinch until 2 fingers', () => {
    const t = new PinchTracker()
    t.down(1, { x: 100, y: 200 })
    t.down(2, { x: 220, y: 200 })
    const zoomOut = t.move(2, { x: 160, y: 200 })
    expect(zoomOut).not.toBeNull()
    expect(zoomOut!.factor).toBeLessThan(1)
    t.up(2)
    expect(t.remaining()?.id).toBe(1)
    expect(t.move(1, { x: 110, y: 210 })).toBeNull()
  })

  it('rapid pinch-in then pinch-out keeps factor clamped', () => {
    const t = new PinchTracker()
    t.down(1, { x: 100, y: 100 })
    t.down(2, { x: 140, y: 100 })
    const a = t.move(2, { x: 300, y: 100 })
    const b = t.move(2, { x: 120, y: 100 })
    expect(a!.factor).toBeLessThanOrEqual(1.28)
    expect(b!.factor).toBeGreaterThanOrEqual(1 / 1.28)
  })

  it('two-finger pan reports center drift', () => {
    const t = new PinchTracker()
    t.down(1, { x: 100, y: 100 })
    t.down(2, { x: 200, y: 100 })
    const g = t.move(1, { x: 120, y: 130 })
    expect(g).not.toBeNull()
    expect(g!.panX).not.toBe(0)
    expect(g!.panY).not.toBe(0)
  })

  it('zoom in then out around same anchor returns near original world point', () => {
    const state = baseView({ scale: 0.4 })
    const mx = 200
    const my = 350
    const zoomed = zoomRasterViewAt(state, mx, my, 1.25)
    const back = zoomRasterViewAt({ ...state, ...zoomed }, mx, my, 1 / 1.25)
    expect(back.scale).toBeCloseTo(state.scale, 5)
    expect(back.x).toBeCloseTo(state.x, 2)
    expect(back.y).toBeCloseTo(state.y, 2)
  })

  it('many small zoom steps stay finite and within min/max', () => {
    let v = baseView({ scale: 0.5 })
    for (let i = 0; i < 40; i++) {
      const next = zoomRasterViewAt(v, 180, 300, i % 2 === 0 ? 1.12 : 1 / 1.12, 8, 0.05)
      v = { ...v, ...next }
      expect(Number.isFinite(v.scale)).toBe(true)
      expect(v.scale).toBeGreaterThanOrEqual(0.05)
      expect(v.scale).toBeLessThanOrEqual(8)
    }
  })

  it('pinch-in sequence with pan keeps view within tighter pan limits', () => {
    let v = baseView({ scale: 0.35 })
    const t = new PinchTracker()
    t.down(1, { x: 120, y: 280 })
    t.down(2, { x: 200, y: 280 })
    for (let i = 0; i < 18; i++) {
      const g = t.move(2, { x: 200 + i * 14, y: 280 + (i % 3) - 1 })
      if (!g) continue
      let next = zoomRasterViewAt(
        { ...v, ...{ scale: v.scale, x: v.x, y: v.y } },
        g.center.x,
        g.center.y,
        g.factor,
        12,
        0.05,
        { clamp: false },
      )
      next = { ...next, x: next.x + g.panX, y: next.y + g.panY }
      const pan = clampRasterPan({ ...v, ...next }, next.x, next.y)
      v = { ...v, scale: next.scale, x: pan.x, y: pan.y }
    }
    const limits = clampRasterPan(v, v.x, v.y)
    expect(limits.x).toBeCloseTo(v.x, 5)
    expect(limits.y).toBeCloseTo(v.y, 5)
    // После серии приближений план не должен «улететь» в огромный offset.
    expect(Math.abs(v.x)).toBeLessThan(v.stageW * 2.5)
    expect(Math.abs(v.y)).toBeLessThan(v.stageH * 2.5)
  })

  it('extreme pan is soft-clamped', () => {
    const state = baseView()
    const pan = clampRasterPan(state, 50_000, -50_000, { rubber: 80 })
    expect(Math.abs(pan.x)).toBeLessThan(50_000)
    expect(Math.abs(pan.y)).toBeLessThan(50_000)
  })

  it('pointerOnStage maps visual rect to layout coords', () => {
    const stage = document.createElement('div')
    Object.defineProperty(stage, 'clientWidth', { value: 390 })
    Object.defineProperty(stage, 'clientHeight', { value: 700 })
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 100,
        width: 390,
        height: 700,
        right: 390,
        bottom: 800,
        x: 0,
        y: 100,
        toJSON() {
          return {}
        },
      }) as DOMRect
    const p = pointerOnStage(stage, 195, 450)
    expect(p.x).toBeCloseTo(195, 0)
    expect(p.y).toBeCloseTo(350, 0)
  })

  it('pointerOnStage returns 0 on empty stage', () => {
    const stage = document.createElement('div')
    Object.defineProperty(stage, 'clientWidth', { value: 0 })
    Object.defineProperty(stage, 'clientHeight', { value: 0 })
    stage.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }) as DOMRect
    expect(pointerOnStage(stage, 10, 10)).toEqual({ x: 0, y: 0 })
  })

  it('pinch sequence: down-down-move-up-up clears tracker', () => {
    const t = new PinchTracker()
    t.down(10, { x: 0, y: 0 })
    t.down(11, { x: 100, y: 0 })
    t.move(11, { x: 140, y: 0 })
    t.up(10)
    t.up(11)
    t.clear()
    expect(t.pointerCount()).toBe(0)
    expect(t.isPinching()).toBe(false)
    expect(t.remaining()).toBeNull()
  })

  it('ignores tiny pinch noise below threshold', () => {
    const t = new PinchTracker()
    t.down(1, { x: 100, y: 100 })
    t.down(2, { x: 200, y: 100 })
    expect(t.move(2, { x: 200.1, y: 100 })).toBeNull()
  })
})
