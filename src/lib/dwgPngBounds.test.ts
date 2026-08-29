import { describe, expect, it } from 'vitest'
import { pngMetaToMapping } from './dwgPngBounds'
import {
  computePngWorldMapping,
  rasterPlanScreenToWorld,
  rasterPlanWorldToScreen,
  type RasterViewState,
} from './dwgRasterMeasure'

describe('pngMetaToMapping', () => {
  it('uses exact server mapping instead of recomputing', () => {
    const meta = {
      minX: 1000,
      minY: 2000,
      maxX: 1100,
      maxY: 2100,
      imgW: 8192,
      imgH: 2505,
      maxDimension: 8192,
      pixelsPerUnit: 12.345,
      offsetX: 163.84,
      offsetY: 88.5,
    }
    const mapping = pngMetaToMapping(meta)
    expect(mapping).not.toBeNull()
    const recomputed = computePngWorldMapping(meta.imgW, meta.imgH, meta, meta.maxDimension)
    expect(mapping!.pixelsPerUnit).toBe(12.345)
    expect(mapping!.pixelsPerUnit).not.toBeCloseTo(recomputed.pixelsPerUnit, 6)
  })

  it('round-trips with stored mapping', () => {
    const meta = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
      imgW: 1000,
      imgH: 500,
      maxDimension: 1000,
      pixelsPerUnit: 8.5,
      offsetX: 20,
      offsetY: 15,
    }
    const state: RasterViewState = {
      scale: 0.5,
      x: 10,
      y: -5,
      stageW: 800,
      stageH: 600,
      imgW: 1000,
      imgH: 500,
    }
    const mapping = pngMetaToMapping(meta, state)!
    const sx = 420
    const sy = 310
    const world = rasterPlanScreenToWorld(state, mapping, sx, sy)
    const [rx, ry] = rasterPlanWorldToScreen(state, mapping, world.x, world.y)
    expect(rx).toBeCloseTo(sx, 1)
    expect(ry).toBeCloseTo(sy, 1)
  })
})
