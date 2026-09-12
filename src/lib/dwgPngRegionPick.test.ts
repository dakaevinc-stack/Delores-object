import { describe, expect, it } from 'vitest'
import {
  collapseRasterStairs,
  colorsMatchFill,
  contourMatchesMaskPixels,
  findColorSeed,
  isYellowFillFamily,
  lastPickDebug,
  pickRegionFromImageData,
  scaleRegionMaskOverlay,
  simplifyContour,
  simplifyContourForEditing,
  structuralZoneContour,
  traceMaskContour,
  traceMaskOrthoHull,
  extractCornerVertices,
} from './dwgPngRegionPick'

function makeImage(
  w: number,
  h: number,
  paint: (set: (x: number, y: number, r: number, g: number, b: number) => void) => void,
) {
  const data = new Uint8ClampedArray(w * h * 4)
  data.fill(255)
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  paint(set)
  return { data, width: w, height: h } as ImageData
}

function makeRectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const mask = new Uint8Array(w * h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) mask[y * w + x] = 1
  }
  return mask
}

describe('dwgPngRegionPick', () => {
  it('collapseRasterStairs removes diagonal pixel staircase', () => {
    // диагональ как пиксельная лесенка: →↑→↑→↑
    const stair: { x: number; y: number }[] = []
    for (let i = 0; i < 12; i++) {
      stair.push({ x: i, y: i })
      stair.push({ x: i + 1, y: i })
    }
    // замкнуть грубым прямоугольником обратно
    const closed = [
      ...stair,
      { x: 12, y: 20 },
      { x: 0, y: 20 },
    ]
    const cleaned = collapseRasterStairs(closed)
    expect(cleaned.length).toBeLessThan(closed.length / 2)
    expect(cleaned.length).toBeGreaterThanOrEqual(3)
  })

  it('picks diagonal-ish fill without keeping every stair vertex', () => {
    const img = makeImage(80, 80, (set) => {
      for (let y = 10; y < 70; y++) {
        for (let x = 10; x < 70; x++) {
          // толстая «диагональная» полоса с пиксельной границей
          if (x + y > 55 && x + y < 95) set(x, y, 160, 60, 200)
        }
      }
    })
    const region = pickRegionFromImageData(img, 40, 40, 1)
    expect(region).not.toBeNull()
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
    expect(region!.pixels.length).toBeLessThan(80)
  })

  it('traces rectangle boundary without diving into interior', () => {
    const w = 40
    const h = 30
    const mask = makeRectMask(w, h, 5, 5, 25, 20)
    const contour = traceMaskContour(mask, w, h)
    expect(contour).not.toBeNull()
    expect(contour!.length).toBeGreaterThan(20)
    // все точки на границе bbox с допуском 1px
    for (const p of contour!) {
      const onLeft = Math.abs(p.x - 5.5) < 0.1
      const onRight = Math.abs(p.x - 24.5) < 0.1
      const onTop = Math.abs(p.y - 5.5) < 0.1
      const onBottom = Math.abs(p.y - 19.5) < 0.1
      expect(onLeft || onRight || onTop || onBottom).toBe(true)
    }
    const corners = simplifyContour(contour!, 0.6)
    expect(corners.length).toBeGreaterThanOrEqual(4)
    expect(corners.length).toBeLessThanOrEqual(8)
  })

  it('picks rectangular fill by color and measures area', () => {
    const img = makeImage(200, 100, (set) => {
      for (let y = 20; y < 80; y++) {
        for (let x = 30; x < 130; x++) set(x, y, 40, 160, 80)
      }
    })
    const region = pickRegionFromImageData(img, 80, 50, 2)
    expect(lastPickDebug.reason).toMatch(/^ok/)
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(1500, -1)
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
    expect(region!.pixels.length).toBeLessThan(40)
  })

  it('keeps magenta boundary stroke outside green fill mask', () => {
    const img = makeImage(80, 60, (set) => {
      for (let y = 15; y < 45; y++) {
        for (let x = 15; x < 55; x++) set(x, y, 0, 220, 0)
      }
      // розовая/пурпурная линия вдоль правого края заливки
      for (let y = 15; y < 45; y++) {
        set(55, y, 240, 40, 200)
        set(56, y, 240, 40, 200)
      }
    })
    const region = pickRegionFromImageData(img, 30, 30, 1)
    expect(region).not.toBeNull()
    // контур по маске заливки — без поглощения цветного штриха (площадь = только зелёное)
    const maxX = Math.max(...region!.pixels.map((p) => p.x))
    expect(maxX).toBeLessThan(55.5)
    expect(region!.area).toBeCloseTo(40 * 30, -1)
  })

  it('fills through same-hue pink stroke into full pink zone', () => {
    const img = makeImage(100, 60, (set) => {
      for (let y = 15; y < 45; y++) {
        for (let x = 10; x < 40; x++) set(x, y, 255, 180, 255)
        for (let x = 44; x < 80; x++) set(x, y, 255, 175, 250)
        set(40, y, 255, 0, 255)
        set(41, y, 255, 0, 255)
        set(42, y, 255, 0, 255)
        set(43, y, 255, 0, 255)
      }
    })
    const region = pickRegionFromImageData(img, 25, 30, 1)
    expect(region).not.toBeNull()
    const maxX = Math.max(...region!.pixels.map((p) => p.x))
    expect(maxX).toBeGreaterThan(65)
    expect(region!.area).toBeGreaterThan(1400)
  })

  it('covers ACI green fill across anti-aliased shades', () => {
    const img = makeImage(120, 80, (set) => {
      for (let y = 10; y < 70; y++) {
        for (let x = 10; x < 110; x++) {
          // градиент оттенков одного зелёного как после AA
          const t = (x - 10) / 100
          const g = 252
          const r = Math.round(t * 40)
          const b = Math.round(t * 40)
          set(x, y, r, g, b)
        }
      }
    })
    const region = pickRegionFromImageData(img, 20, 40, 1)
    expect(region).not.toBeNull()
    // почти весь прямоугольник 100×60
    expect(region!.area).toBeGreaterThan(100 * 60 * 0.85)
  })

  it('does not bleed from cyan fill into adjacent blue', () => {
    const img = makeImage(120, 60, (set) => {
      for (let y = 10; y < 50; y++) {
        for (let x = 10; x < 55; x++) set(x, y, 0, 240, 240)
        for (let x = 56; x < 100; x++) set(x, y, 0, 80, 255)
        set(55, y, 0, 180, 250)
      }
    })
    const region = pickRegionFromImageData(img, 30, 30, 1)
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(45 * 40, -1)
    expect(region!.area).toBeLessThan(45 * 40 + 120)
  })

  it('does not bleed from yellow fill into adjacent green', () => {
    const img = makeImage(120, 60, (set) => {
      for (let y = 10; y < 50; y++) {
        for (let x = 10; x < 55; x++) set(x, y, 255, 255, 80)
        for (let x = 56; x < 100; x++) set(x, y, 0, 220, 0)
        // антиалиас на стыке
        set(55, y, 210, 238, 45)
      }
    })
    const region = pickRegionFromImageData(img, 30, 30, 1)
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(45 * 40, -1)
    expect(region!.area).toBeLessThan(45 * 40 + 120)
  })

  it('does not bleed into a similar adjacent color', () => {
    const img = makeImage(120, 60, (set) => {
      for (let y = 10; y < 50; y++) {
        for (let x = 10; x < 55; x++) set(x, y, 40, 150, 70)
        for (let x = 55; x < 100; x++) set(x, y, 55, 165, 85)
      }
    })
    const region = pickRegionFromImageData(img, 30, 30, 1, { tolerance: 16, edgeTol: 9 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(1800, -1)
    expect(region!.area).toBeLessThan(2500)
  })

  it('stops at dark ink lines between fills', () => {
    const img = makeImage(100, 40, (set) => {
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 48; x++) set(x, y, 200, 80, 40)
        set(48, y, 20, 20, 20)
        for (let x = 49; x < 95; x++) set(x, y, 190, 90, 50)
      }
    })
    const region = pickRegionFromImageData(img, 20, 20, 1, { tolerance: 22 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeLessThan(43 * 30 + 50)
  })

  it('picks a small patch with corner-like vertices', () => {
    const img = makeImage(80, 80, (set) => {
      for (let y = 36; y < 44; y++) {
        for (let x = 36; x < 44; x++) set(x, y, 180, 60, 200)
      }
    })
    const region = pickRegionFromImageData(img, 40, 40, 1, { minPixels: 3 })
    expect(region).not.toBeNull()
    expect(region!.area).toBe(64)
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
    expect(region!.pixels.length).toBeLessThanOrEqual(16)
  })

  it('picks a tiny 3×3 patch', () => {
    const img = makeImage(40, 40, (set) => {
      for (let y = 18; y < 21; y++) {
        for (let x = 18; x < 21; x++) set(x, y, 90, 40, 200)
      }
    })
    const region = pickRegionFromImageData(img, 19, 19, 1, { minPixels: 3 })
    expect(region).not.toBeNull()
    expect(region!.area).toBe(9)
  })

  it('findColorSeed on yellow side ignores green fringe at boundary', () => {
    const img = makeImage(80, 40, (set) => {
      for (let y = 8; y < 32; y++) {
        for (let x = 8; x < 38; x++) set(x, y, 255, 255, 80)
        for (let x = 42; x < 72; x++) set(x, y, 0, 220, 0)
        set(38, y, 210, 238, 45)
        set(39, y, 205, 232, 42)
        set(40, y, 198, 228, 38)
        set(41, y, 190, 222, 35)
      }
    })
    const seed = findColorSeed(img.data, 80, 40, 20, 20, 8)
    expect(seed).not.toBeNull()
    expect(isYellowFillFamily(seed!.r, seed!.g, seed!.b)).toBe(true)
  })

  it('finds seed when tap lands on white fringe next to fill', () => {
    const img = makeImage(80, 80, (set) => {
      for (let y = 30; y < 50; y++) {
        for (let x = 30; x < 50; x++) set(x, y, 200, 40, 40)
      }
    })
    const seed = findColorSeed(img.data, 80, 80, 28, 40, 8)
    expect(seed).not.toBeNull()
    expect(seed!.r).toBe(200)
  })

  it('picks a narrow corridor (2px wide)', () => {
    const img = makeImage(100, 40, (set) => {
      for (let x = 5; x < 95; x++) {
        set(x, 18, 30, 120, 200)
        set(x, 19, 30, 120, 200)
      }
      for (let y = 10; y < 30; y++) {
        for (let x = 90; x < 98; x++) set(x, y, 30, 120, 200)
      }
    })
    const region = pickRegionFromImageData(img, 50, 18, 1, { minPixels: 3, tolerance: 18 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeGreaterThan(100)
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
  })

  it('rejects background seed', () => {
    const img = makeImage(80, 80, () => undefined)
    expect(pickRegionFromImageData(img, 40, 40, 1)).toBeNull()
  })

  it('rejects medium circular wells only', () => {
    const img = makeImage(120, 120, (set) => {
      const cx = 60
      const cy = 60
      const r = 12
      for (let y = 0; y < 120; y++) {
        for (let x = 0; x < 120; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, 200, 80, 40)
        }
      }
    })
    expect(pickRegionFromImageData(img, 60, 60, 1)).toBeNull()
  })

  it('does not merge adjacent pink zones through magenta dividers', () => {
    const img = makeImage(180, 60, (set) => {
      for (let y = 10; y < 50; y++) {
        for (let x = 5; x < 50; x++) set(x, y, 255, 190, 255)
        for (let x = 52; x < 97; x++) set(x, y, 255, 170, 245)
        for (let x = 99; x < 144; x++) set(x, y, 255, 150, 235)
        set(50, y, 255, 0, 255)
        set(51, y, 255, 0, 255)
        set(97, y, 255, 0, 255)
        set(98, y, 255, 0, 255)
      }
    })
    const region = pickRegionFromImageData(img, 25, 30, 1)
    expect(region).not.toBeNull()
    expect(region!.area).toBeLessThan(2200)
    expect(region!.area).toBeGreaterThan(1700)
  })

  it('colorsMatchFill is strict', () => {
    expect(colorsMatchFill(40, 150, 70, 40, 150, 70, 16)).toBe(true)
    expect(colorsMatchFill(48, 155, 75, 40, 150, 70, 16)).toBe(true)
    expect(colorsMatchFill(70, 180, 110, 40, 150, 70, 16)).toBe(false)
    expect(colorsMatchFill(20, 20, 20, 40, 150, 70, 16)).toBe(false)
  })

  it('simplifyContourForEditing caps vertex count for draggable contours', () => {
    const w = 120
    const h = 80
    const mask = makeRectMask(w, h, 10, 10, 110, 70)
    const dense = traceMaskContour(mask, w, h)
    expect(dense.length).toBeGreaterThan(28)
    const edited = simplifyContourForEditing(dense, 28)
    expect(edited.length).toBeLessThanOrEqual(28)
    expect(edited.length).toBeGreaterThanOrEqual(4)
  })

  it('traceMaskOrthoHull yields corner polygon without pixel staircase', () => {
    const w = 200
    const h = 120
    const mask = makeRectMask(w, h, 20, 15, 180, 95)
    const hull = traceMaskOrthoHull(mask, w, h, 20, 15, 179, 94)!
    expect(hull.length).toBeLessThanOrEqual(8)
    expect(hull.length).toBeGreaterThanOrEqual(4)
    const dense = traceMaskContour(mask, w, h)!
    expect(dense.length).toBeGreaterThan(hull.length * 3)
  })

  it('structuralZoneContour reduces rectangle mask to corner polygon', () => {
    const w = 200
    const h = 120
    const mask = makeRectMask(w, h, 20, 15, 180, 95)
    const dense = traceMaskContour(mask, w, h)!
    expect(dense.length).toBeGreaterThan(40)
    const structural = structuralZoneContour(dense, { bw: 160, bh: 80 }, 16)
    expect(structural.length).toBeLessThanOrEqual(6)
    expect(structural.length).toBeGreaterThanOrEqual(4)
  })

  it('structuralZoneContour removes pixel staircase on anti-aliased fill', () => {
    const img = makeImage(220, 140, (set) => {
      for (let y = 20; y < 120; y++) {
        for (let x = 30; x < 190; x++) {
          const edge =
            x === 30 ||
            x === 189 ||
            y === 20 ||
            y === 119 ||
            (x === 31 && (y === 21 || y === 118)) ||
            (x === 188 && (y === 21 || y === 118))
          const t = edge ? 0.55 : 1
          set(x, y, Math.round(160 * t), Math.round(60 * t), Math.round(200 * t))
        }
      }
    })
    const region = pickRegionFromImageData(img, 110, 70, 1, { tolerance: 22, edgeTol: 14 })
    expect(region).not.toBeNull()
    expect(region!.pixels.length).toBeLessThanOrEqual(12)
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
  })

  it('L-shaped green fill keeps concave outline, not bbox rectangle', () => {
    const img = makeImage(100, 100, (set) => {
      for (let y = 10; y < 70; y++) {
        for (let x = 10; x < 30; x++) set(x, y, 0, 220, 0)
      }
      for (let y = 50; y < 70; y++) {
        for (let x = 30; x < 70; x++) set(x, y, 0, 220, 0)
      }
    })
    const region = pickRegionFromImageData(img, 20, 40, 1)
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(2000, -1)
    expect(contourMatchesMaskPixels(region!.pixels, Math.round(region!.area))).toBe(true)
    expect(region!.pixels.length).toBeGreaterThanOrEqual(6)
    expect(region!.pixels.length).toBeLessThanOrEqual(16)
  })

  it('rejects oversized muted olive spill', () => {
    const img = makeImage(400, 400, (set) => {
      for (let y = 0; y < 400; y++) {
        for (let x = 0; x < 400; x++) set(x, y, 127, 127, 63)
      }
      for (let y = 40; y < 100; y++) {
        for (let x = 40; x < 120; x++) set(x, y, 255, 127, 223)
      }
    })
    expect(pickRegionFromImageData(img, 200, 200, 1)).toBeNull()
    const pink = pickRegionFromImageData(img, 60, 60, 1)
    expect(pink).not.toBeNull()
    expect(pink!.area).toBeLessThan(5000)
    expect(pink!.pixels.length).toBeLessThanOrEqual(24)
  })

  it('does not merge adjacent pastel pink lots without a hard divider', () => {
    const img = makeImage(160, 80, (set) => {
      for (let y = 10; y < 70; y++) {
        for (let x = 10; x < 70; x++) set(x, y, 255, 190, 230)
        for (let x = 78; x < 140; x++) set(x, y, 255, 150, 210)
        // soft AA fringe, no magenta divider
        set(70, y, 250, 170, 220)
        set(71, y, 248, 165, 218)
        set(72, y, 245, 160, 215)
        set(73, y, 242, 158, 214)
        set(74, y, 240, 155, 212)
        set(75, y, 238, 152, 210)
        set(76, y, 236, 151, 210)
        set(77, y, 255, 150, 210)
      }
    })
    const region = pickRegionFromImageData(img, 30, 40, 1)
    expect(region).not.toBeNull()
    expect(region!.area).toBeLessThan(4200)
    expect(region!.area).toBeGreaterThan(2500)
  })

  it('thin diagonal corridor keeps mask-matching outline, not a triangle wash', () => {
    const img = makeImage(200, 200, (set) => {
      for (let t = 10; t < 170; t++) {
        for (let w = -3; w <= 3; w++) {
          const x = t + w
          const y = t
          if (x >= 0 && x < 200 && y >= 0 && y < 200) set(x, y, 255, 127, 223)
        }
      }
    })
    const region = pickRegionFromImageData(img, 80, 80, 1)
    expect(region).not.toBeNull()
    expect(region!.pixels.length).toBeGreaterThanOrEqual(4)
    expect(region!.pixels.length).not.toBe(3)
    const poly = Math.abs(
      region!.pixels.reduce((acc, p, i, arr) => {
        const n = arr[(i + 1) % arr.length]!
        return acc + p.x * n.y - n.x * p.y
      }, 0) / 2,
    )
    // Треугольник «через концы» даёт площадь на порядок больше маски.
    expect(poly / region!.pixelCount!).toBeLessThan(2.5)
    expect(region!.maskOverlay).toBeTruthy()
    const bitW = region!.maskOverlay!.bitW ?? region!.maskOverlay!.width
    const bitH = region!.maskOverlay!.bitH ?? region!.maskOverlay!.height
    expect(region!.maskOverlay!.bits.length).toBe(bitW * bitH)
    const onBits = region!.maskOverlay!.bits.reduce((a, b) => a + b, 0)
    expect(onBits).toBe(region!.pixelCount)
  })

  it('scaleRegionMaskOverlay keeps bits when upsampling', () => {
    const bits = new Uint8Array(4)
    bits[0] = 1
    bits[3] = 1
    const scaled = scaleRegionMaskOverlay(
      { minX: 10, minY: 20, width: 2, height: 2, bits },
      100,
      200,
      0.5,
    )
    expect(scaled).toBeTruthy()
    expect(scaled!.width).toBe(4)
    expect(scaled!.height).toBe(4)
    expect(scaled!.minX).toBeCloseTo(120)
    expect(scaled!.minY).toBeCloseTo(240)
    expect(scaled!.bits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2)
  })

  it('extractCornerVertices skips stair corners with short edges', () => {
    const stair: { x: number; y: number }[] = []
    for (let i = 0; i < 20; i++) {
      stair.push({ x: 10 + i, y: 10 + i })
      stair.push({ x: 11 + i, y: 10 + i })
    }
    stair.push({ x: 40, y: 40 }, { x: 10, y: 40 })
    const corners = extractCornerVertices(stair, 8, 3)
    expect(corners.length).toBeLessThan(stair.length / 3)
  })
})
