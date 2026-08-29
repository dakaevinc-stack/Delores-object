import { describe, expect, it } from 'vitest'
import {
  colorsMatchFill,
  findColorSeed,
  lastPickDebug,
  pickRegionFromImageData,
  simplifyContour,
  traceMaskContour,
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

  it('colorsMatchFill is strict', () => {
    expect(colorsMatchFill(40, 150, 70, 40, 150, 70, 16)).toBe(true)
    expect(colorsMatchFill(48, 155, 75, 40, 150, 70, 16)).toBe(true)
    expect(colorsMatchFill(70, 180, 110, 40, 150, 70, 16)).toBe(false)
    expect(colorsMatchFill(20, 20, 20, 40, 150, 70, 16)).toBe(false)
  })
})
