import { describe, expect, it } from 'vitest'
import { pngMetaToMapping } from './dwgPngBounds'
import {
  imagePixelToScreen,
  planClickToImagePixel,
  planPixelArea,
  planPixelDistance,
  planPixelPerimeter,
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
    expect(clicked.x).toBeCloseTo(pixels[0].x, 1)
    expect(clicked.y).toBeCloseTo(pixels[0].y, 1)

    const roundTrip = rasterScreenToImagePixel(state, sx, sy)
    expect(roundTrip.x).toBeCloseTo(pixels[0].x, 1)
    expect(roundTrip.y).toBeCloseTo(pixels[0].y, 1)
  })
})
