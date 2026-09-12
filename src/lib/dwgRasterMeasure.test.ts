import { describe, expect, it } from 'vitest'
import {
  clampRasterPan,
  computePngWorldMapping,
  rasterPlanScreenToWorld,
  rasterPlanWorldToScreen,
  rasterScreenToWorld,
  rasterWorldToScreen,
  zoomRasterViewAt,
  type RasterViewState,
  type WorldBounds,
} from './dwgRasterMeasure'
import { polygonArea, polygonPerimeter } from './dwgMeasureFormat'
import { pngMetaToMapping } from './dwgPngBounds'

const bounds: WorldBounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 }

function fittedState(imgW = 1000, imgH = 500): RasterViewState {
  const stageW = 800
  const stageH = 600
  const scale = Math.min((stageW - 64) / imgW, (stageH - 64) / imgH)
  return { scale, x: 0, y: 0, stageW, stageH, imgW, imgH }
}

describe('dwgRasterMeasure', () => {
  it('round-trips world ↔ screen at view center', () => {
    const state = fittedState()
    const mapping = computePngWorldMapping(state.imgW, state.imgH, bounds)
    const center = rasterScreenToWorld(state, mapping, state.stageW / 2, state.stageH / 2)
    const [sx, sy] = rasterWorldToScreen(state, mapping, center.x, center.y)
    expect(sx).toBeCloseTo(state.stageW / 2, 0)
    expect(sy).toBeCloseTo(state.stageH / 2, 0)
  })

  it('zoom keeps cursor anchor fixed', () => {
    const state = fittedState()
    const mx = 420
    const my = 310
    const mapping = computePngWorldMapping(state.imgW, state.imgH, bounds)
    const before = rasterPlanScreenToWorld(state, mapping, mx, my)
    const next = zoomRasterViewAt(state, mx, my, 1.2)
    const after = rasterPlanScreenToWorld({ ...state, ...next }, mapping, mx, my)
    expect(after.x).toBeCloseTo(before.x, 3)
    expect(after.y).toBeCloseTo(before.y, 3)
  })

  it('unclamped zoom keeps anchor even near screen edge', () => {
    const state = fittedState()
    const mx = 40
    const my = 40
    const mapping = computePngWorldMapping(state.imgW, state.imgH, bounds)
    const before = rasterPlanScreenToWorld(state, mapping, mx, my)
    let v = state
    for (let i = 0; i < 12; i++) {
      const next = zoomRasterViewAt(v, mx, my, 1.18, 64, 0.02, { clamp: false })
      v = { ...v, ...next }
    }
    const after = rasterPlanScreenToWorld(v, mapping, mx, my)
    expect(after.x).toBeCloseTo(before.x, 2)
    expect(after.y).toBeCloseTo(before.y, 2)
  })

  it('hard pan clamp keeps most of the plan on screen', () => {
    const state = fittedState()
    const far = clampRasterPan({ ...state, scale: state.scale * 8 }, 50_000, -50_000)
    const halfW = (state.imgW * state.scale * 8) / 2
    // Не даём уехать так, чтобы на экране осталась крошечная полоска плана.
    expect(Math.abs(far.x)).toBeLessThan(halfW + state.stageW)
    expect(Math.abs(far.y)).toBeLessThan((state.imgH * state.scale * 8) / 2 + state.stageH)
  })

  it('clamps extreme zoom factors to avoid jumps', () => {
    const state = fittedState()
    const next = zoomRasterViewAt(state, 400, 300, 8)
    expect(next.scale).toBeLessThanOrEqual(state.scale * 1.35 + 1e-9)
  })

  it('respects min scale floor', () => {
    const state = fittedState()
    const next = zoomRasterViewAt(state, 400, 300, 0.01, 64, state.scale * 0.8)
    expect(next.scale).toBeCloseTo(state.scale * 0.8, 6)
  })

  it('keeps pan within soft screen bounds', () => {
    const state = fittedState()
    const far = clampRasterPan(state, 50_000, -50_000)
    expect(Math.abs(far.x)).toBeLessThan(20_000)
    expect(Math.abs(far.y)).toBeLessThan(20_000)
  })

  it('preserves rectangle area and perimeter through plan clicks', () => {
    const state = fittedState()
    const mapping = computePngWorldMapping(state.imgW, state.imgH, bounds)
    const corners = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 15 },
      { x: 10, y: 15 },
    ]
    const clicked = corners.map((c) => {
      const [sx, sy] = rasterPlanWorldToScreen(state, mapping, c.x, c.y)
      return rasterPlanScreenToWorld(state, mapping, sx, sy)
    })
    expect(polygonArea(clicked)).toBeCloseTo(50, 1)
    expect(polygonPerimeter(clicked, true)).toBeCloseTo(30, 1)
  })

  it('preserves brusilova png meta rectangle area and perimeter', () => {
    const meta = {
      minX: 4562.651317160568,
      minY: -18860.424107002116,
      maxX: 6750.587862496497,
      maxY: -18191.39790825431,
      imgW: 12288,
      imgH: 3757,
      maxDimension: 12288,
      pixelsPerUnit: 4.8809447,
      offsetX: 804.4016,
      offsetY: 245.76012,
    }
    const stageW = 1380
    const stageH = 807
    const scale = Math.min((stageW - 64) / meta.imgW, (stageH - 64) / meta.imgH)
    const state: RasterViewState = {
      scale,
      x: 0,
      y: 0,
      stageW,
      stageH,
      imgW: meta.imgW,
      imgH: meta.imgH,
    }
    const mapping = pngMetaToMapping({ ...meta, insUnits: 6 }, state)!
    const corners = [
      { x: 5625, y: -18535 },
      { x: 5675, y: -18535 },
      { x: 5675, y: -18515 },
      { x: 5625, y: -18515 },
    ]
    const clicked = corners.map((c) => {
      const [sx, sy] = rasterPlanWorldToScreen(state, mapping, c.x, c.y)
      return rasterScreenToWorld(state, mapping, sx, sy)
    })
    expect(polygonArea(clicked)).toBeCloseTo(1000, 0)
    expect(polygonPerimeter(clicked, true)).toBeCloseTo(140, 0)
  })
})
