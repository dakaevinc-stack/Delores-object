import { describe, expect, it } from 'vitest'
import { pngMetaToMapping } from './dwgPngBounds'
import {
  findClosestEdgeInsertScreen,
  imagePixelToScreen,
  orthoSnapPlanPixel,
  planClickToImagePixel,
  planPixelArea,
  planPixelDistance,
  planPixelPerimeter,
  simplifyPolylinePoints,
} from './dwgPlanMeasure'
import { rasterScreenToImagePixel, type RasterViewState } from './dwgRasterMeasure'

describe('dwgPlanMeasure', () => {
  it('measures 50×20 m via png pixels on brusilova meta', () => {
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
      insUnits: 6,
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
    const mapping = pngMetaToMapping(meta, state)!
    const ppu = mapping.pixelsPerUnit
    const cx = 5650
    const cy = -18525
    const halfW = 25 * ppu
    const halfH = 10 * ppu
    const centerPx = {
      x: mapping.offsetX + (cx - mapping.originX) * ppu,
      y: mapping.imgH - mapping.offsetY - (cy - mapping.originY) * ppu,
    }
    const pixels = [
      { x: centerPx.x - halfW, y: centerPx.y - halfH },
      { x: centerPx.x + halfW, y: centerPx.y - halfH },
      { x: centerPx.x + halfW, y: centerPx.y + halfH },
      { x: centerPx.x - halfW, y: centerPx.y + halfH },
    ]

    expect(planPixelArea(pixels, ppu)).toBeCloseTo(1000, 0)
    expect(planPixelPerimeter(pixels, ppu, true)).toBeCloseTo(140, 0)
    expect(planPixelDistance(pixels[0], pixels[1], ppu)).toBeCloseTo(50, 1)

    const [sx, sy] = imagePixelToScreen(state, pixels[0].x, pixels[0].y)
    const clicked = planClickToImagePixel(sx, sy, state, mapping, [])
    expect(clicked.x).toBeCloseTo(pixels[0].x, 0)
    expect(clicked.y).toBeCloseTo(pixels[0].y, 0)

    const roundTrip = rasterScreenToImagePixel(state, sx, sy)
    expect(roundTrip.x).toBeCloseTo(pixels[0].x, 1)
    expect(roundTrip.y).toBeCloseTo(pixels[0].y, 1)
  })

  it('orthoSnapPlanPixel locks second point to horizontal or vertical', () => {
    const prev = { x: 100, y: 200 }
    const horiz = orthoSnapPlanPixel({ x: 150, y: 203 }, prev)
    expect(horiz.y).toBe(prev.y)
    const vert = orthoSnapPlanPixel({ x: 103, y: 260 }, prev)
    expect(vert.x).toBe(prev.x)
  })

  it('planClickToImagePixel matches cursor after pan offset', () => {
    const meta = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      imgW: 1000,
      imgH: 1000,
      maxDimension: 1000,
      pixelsPerUnit: 10,
      offsetX: 0,
      offsetY: 0,
      insUnits: 6,
    }
    const stageW = 800
    const stageH = 600
    const scale = 0.5
    const state: RasterViewState = {
      scale,
      x: 120,
      y: -40,
      stageW,
      stageH,
      imgW: meta.imgW,
      imgH: meta.imgH,
    }
    const mapping = pngMetaToMapping(meta, state)!
    const target = { x: 420.5, y: 310.5 }
    const [sx, sy] = imagePixelToScreen(state, target.x, target.y)
    const clicked = planClickToImagePixel(sx, sy, state, mapping, [])
    expect(clicked.x).toBeCloseTo(target.x, 2)
    expect(clicked.y).toBeCloseTo(target.y, 2)
  })

  it('planClickToImagePixel keeps sub-pixel precision without snap', () => {
    const meta = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      imgW: 1000,
      imgH: 1000,
      maxDimension: 1000,
      pixelsPerUnit: 10,
      offsetX: 0,
      offsetY: 0,
      insUnits: 6,
    }
    const state: RasterViewState = {
      scale: 2.5,
      x: 0,
      y: 0,
      stageW: 800,
      stageH: 600,
      imgW: meta.imgW,
      imgH: meta.imgH,
    }
    const mapping = pngMetaToMapping(meta, state)!
    const target = { x: 417.375, y: 512.625 }
    const [sx, sy] = imagePixelToScreen(state, target.x, target.y)
    const clicked = planClickToImagePixel(sx, sy, state, mapping, [])
    expect(clicked.x).toBeCloseTo(target.x, 4)
    expect(clicked.y).toBeCloseTo(target.y, 4)
  })

  it('findClosestEdgeInsertScreen picks edge under cursor', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ]
    const toScreen = (p: { x: number; y: number }) => [p.x, p.y] as [number, number]
    const hit = findClosestEdgeInsertScreen(outline, 50, 4, toScreen, 8)!
    expect(hit).not.toBeNull()
    expect(hit.edgeIndex).toBe(0)
    expect(hit.insertIndex).toBe(1)
    expect(hit.point.x).toBeCloseTo(50, 0)
    expect(hit.point.y).toBeCloseTo(0, 0)
  })

  it('simplifyPolylinePoints keeps ends and thins middle', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.2, y: Math.sin(i) * 0.1 }))
    const out = simplifyPolylinePoints(pts, 1, 20)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
    expect(out.length).toBeLessThan(pts.length)
    expect(out.length).toBeLessThanOrEqual(20)
  })
})
