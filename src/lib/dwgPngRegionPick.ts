import type { DxfDocument, Point2D } from '@cadview/core'
import { polygonArea, polygonPerimeter } from './dwgMeasureFormat'
import { isCircleLikeRegion } from './dwgRegionPick'
import {
  rasterScreenToImagePixel,
  type PngWorldMapping,
  type RasterViewState,
} from './dwgRasterMeasure'

const BG_WHITE = { r: 255, g: 255, b: 255 }
const BG_DARK = { r: 43, g: 43, b: 43 }

export type PngPickedRegion = {
  pixels: Point2D[]
  holes: Point2D[][]
  area: number
  perimeter: number
  /** Bbox маски заливки. */
  maskBBox?: { minX: number; minY: number; maxX: number; maxY: number }
  /** Число пикселей маски — эталон площади для расчётов. */
  pixelCount?: number
  /**
   * Кроп маски для пиксель-точного оверлея (не упрощённый полигон).
   * Координаты — в пикселях полного PNG.
   */
  maskOverlay?: RegionMaskOverlay
}

/** Кроп бинарной маски flood fill для отрисовки 1:1 с растром. */
export type RegionMaskOverlay = {
  minX: number
  minY: number
  /** Размер кропа в пикселях полного PNG (куда растягиваем при paint). */
  width: number
  height: number
  /** 0/1; length = (bitW ?? width) * (bitH ?? height) */
  bits: Uint8Array
  /** Если заданы — bits даунскейл, при отрисовке stretch на width×height. */
  bitW?: number
  bitH?: number
}

export function maskOverlayBitSize(mask: RegionMaskOverlay): { bitW: number; bitH: number } {
  const bitW = mask.bitW ?? mask.width
  const bitH = mask.bitH ?? mask.height
  return { bitW, bitH }
}

export function extractRegionMaskOverlay(
  mask: Uint8Array,
  w: number,
  h: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): RegionMaskOverlay | undefined {
  if (maxX < minX || maxY < minY) return undefined
  const fullW = maxX - minX + 1
  const fullH = maxY - minY + 1
  if (fullW < 1 || fullH < 1) return undefined

  const MAX_BITS = 2_500_000
  let step = 1
  if (fullW * fullH > MAX_BITS) {
    step = Math.ceil(Math.sqrt((fullW * fullH) / MAX_BITS))
  }
  const bitW = Math.max(1, Math.ceil(fullW / step))
  const bitH = Math.max(1, Math.ceil(fullH / step))
  if (bitW * bitH > MAX_BITS) return undefined

  const bits = new Uint8Array(bitW * bitH)
  for (let y = 0; y < bitH; y++) {
    const srcY0 = minY + y * step
    const srcY1 = Math.min(maxY, srcY0 + step - 1)
    for (let x = 0; x < bitW; x++) {
      const srcX0 = minX + x * step
      const srcX1 = Math.min(maxX, srcX0 + step - 1)
      let on = 0
      for (let sy = srcY0; sy <= srcY1 && !on; sy++) {
        if (sy < 0 || sy >= h) continue
        const row = sy * w
        for (let sx = srcX0; sx <= srcX1; sx++) {
          if (sx < 0 || sx >= w) continue
          if (mask[row + sx]) {
            on = 1
            break
          }
        }
      }
      bits[y * bitW + x] = on
    }
  }
  return step === 1
    ? { minX, minY, width: fullW, height: fullH, bits }
    : { minX, minY, width: fullW, height: fullH, bits, bitW, bitH }
}

/** Rasterize polygon (+holes) into a mask crop for hatch-fallback overlays. */
export function rasterizeOutlineMaskOverlay(
  outline: Point2D[],
  holes: Point2D[][],
): RegionMaskOverlay | undefined {
  if (outline.length < 3 || typeof document === 'undefined') return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const scan = (pts: Point2D[]) => {
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  scan(outline)
  for (const hole of holes) scan(hole)
  if (!Number.isFinite(minX)) return undefined
  const pad = 2
  const x0 = Math.floor(minX) - pad
  const y0 = Math.floor(minY) - pad
  const x1 = Math.ceil(maxX) + pad
  const y1 = Math.ceil(maxY) + pad
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  if (width < 2 || height < 2 || width * height > 2_500_000) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  const ring = (pts: Point2D[]) => {
    ctx.moveTo(pts[0]!.x - x0, pts[0]!.y - y0)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x - x0, pts[i]!.y - y0)
    ctx.closePath()
  }
  ring(outline)
  for (const hole of holes) {
    if (hole.length >= 3) ring(hole)
  }
  ctx.fill('evenodd')
  const data = ctx.getImageData(0, 0, width, height).data
  const bits = new Uint8Array(width * height)
  let count = 0
  for (let i = 0, p = 0; i < bits.length; i++, p += 4) {
    if (data[p]! > 128) {
      bits[i] = 1
      count += 1
    }
  }
  if (count < 3) return undefined
  return { minX: x0, minY: y0, width, height, bits }
}

function colorDistCheb(r: number, g: number, b: number, sr: number, sg: number, sb: number): number {
  return Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb))
}

function colorDistSq(r: number, g: number, b: number, sr: number, sg: number, sb: number): number {
  const dr = r - sr
  const dg = g - sg
  const db = b - sb
  return dr * dr + dg * dg + db * db
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Тёмные линии чертежа — жёсткая граница, через них не заливаем. */
export function isInkBarrier(r: number, g: number, b: number): boolean {
  const y = luminance(r, g, b)
  if (y <= 58) return true
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  // почти чёрный/серый штрих
  if (maxC <= 70 && maxC - minC <= 18) return true
  return false
}

/**
 * Цветной штрих CAD (пурпур / розовый / красный / синий / голубой / жёлтый),
 * не заливка того же тона что семя. Такие линии — бордюр/граница участка:
 * их нужно включать в контур и периметр.
 */
export function isBoundaryStrokeColor(
  r: number,
  g: number,
  b: number,
  seedDominant: 0 | 1 | 2,
): boolean {
  if (isBackgroundSeed(r, g, b)) return false
  if (isInkBarrier(r, g, b)) return false
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  const chroma = maxC - minC
  if (chroma < 55) return false
  const dom = dominantChannel(r, g, b)
  if (dom === seedDominant) return false
  return true
}

/**
 * Расширяет маску заливки на соседние цветные/тёмные линии чертежа (бордюр, контур),
 * чтобы площадь и периметр учитывали розовые/пурпурные и прочие ACI-штрихи.
 */
export function absorbBoundaryStrokes(
  mask: Uint8Array,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sr: number,
  sg: number,
  sb: number,
  rounds = 3,
): { mask: Uint8Array; count: number; minX: number; minY: number; maxX: number; maxY: number } {
  const seedDom = dominantChannel(sr, sg, sb)
  let cur = mask
  let count = 0
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let i = 0; i < cur.length; i++) {
    if (!cur[i]) continue
    count += 1
    const x = i % w
    const y = (i / w) | 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (let round = 0; round < rounds; round++) {
    const next = new Uint8Array(cur)
    let added = 0
    const x0 = Math.max(0, minX - 1)
    const y0 = Math.max(0, minY - 1)
    const x1 = Math.min(w - 1, maxX + 1)
    const y1 = Math.min(h - 1, maxY + 1)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (cur[i]) continue
        const pi = i * 4
        const r = data[pi]
        const g = data[pi + 1]
        const b = data[pi + 2]
        if (
          !isBoundaryStrokeColor(r, g, b, seedDom) &&
          !isSameHueBoundaryStroke(r, g, b, sr, sg, sb)
        ) {
          continue
        }
        let touch = false
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (cur[ny * w + nx]) {
              touch = true
              break
            }
          }
        }
        if (!touch) continue
        next[i] = 1
        added += 1
        count += 1
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    cur = next
    if (added === 0) break
  }

  if (count === 0) {
    return { mask: cur, count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  return { mask: cur, count, minX, minY, maxX, maxY }
}

export function isBackgroundSeed(r: number, g: number, b: number): boolean {
  if (colorDistCheb(r, g, b, BG_WHITE.r, BG_WHITE.g, BG_WHITE.b) <= 18) return true
  if (colorDistCheb(r, g, b, BG_DARK.r, BG_DARK.g, BG_DARK.b) <= 18) return true
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  if (maxC >= 245 && maxC - minC <= 12) return true
  return false
}

/** Совпадение с семенем: строго, без «похожих» соседних заливок. */
export function colorsMatchFill(
  r: number,
  g: number,
  b: number,
  sr: number,
  sg: number,
  sb: number,
  tol: number,
): boolean {
  if (isInkBarrier(r, g, b)) return false
  if (isBackgroundSeed(r, g, b)) return false
  if (
    (isChromaticFill(sr, sg, sb) || isChromaticFill(r, g, b)) &&
    !sameFillFamily(r, g, b, sr, sg, sb)
  ) {
    return false
  }
  if (colorDistCheb(r, g, b, sr, sg, sb) > tol) return false
  // Евклид уже chebyshev — режет «похожие» соседние палитры
  if (colorDistSq(r, g, b, sr, sg, sb) > tol * tol * 1.55) return false
  return true
}

function dominantChannel(r: number, g: number, b: number): 0 | 1 | 2 {
  if (r >= g && r >= b) return 0
  if (g >= r && g >= b) return 1
  return 2
}

/** Насыщенность пикселя (размах RGB). */
export function fillChroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** Оттенок 0…360°; null — нейтральный/фон/штрих. */
export function fillHueDegrees(r: number, g: number, b: number): number | null {
  if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) return null
  const chroma = fillChroma(r, g, b)
  if (chroma < 32) return null
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  const d = maxC - minC
  if (d < 1) return null
  let h = 0
  if (maxC === r) h = 60 * (((g - b) / d) % 6)
  else if (maxC === g) h = 60 * ((b - r) / d + 2)
  else h = 60 * ((r - g) / d + 4)
  if (h < 0) h += 360
  return h
}

export function hueDistanceDegrees(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Насыщенная цветная заливка ACI (не фон и не чёрный штрих). */
export function isChromaticFill(r: number, g: number, b: number): boolean {
  if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) return false
  return fillChroma(r, g, b) >= 38
}

/** Допуск оттенка внутри одной заливки (AA, лёгкий градиент экспорта). */
const FILL_HUE_TOLERANCE_DEG = 16

type LabColor = { L: number; a: number; b: number }

export type SeedColorProfile = {
  sr: number
  sg: number
  sb: number
  lab: LabColor
  /** Макс. ΔE от эталона зоны (адаптивно по пятну семени). */
  maxDeltaE: number
}

function rgbToLab(r: number, g: number, b: number): LabColor {
  let R = r / 255
  let G = g / 255
  let B = b / 255
  R = R > 0.04045 ? ((R + 0.055) / 1.055) ** 2.4 : R / 12.92
  G = G > 0.04045 ? ((G + 0.055) / 1.055) ** 2.4 : G / 12.92
  B = B > 0.04045 ? ((B + 0.055) / 1.055) ** 2.4 : B / 12.92
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) / 1.0
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X)
  const fy = f(Y)
  const fz = f(Z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function deltaE76(l1: LabColor, l2: LabColor): number {
  return Math.hypot(l1.L - l2.L, l1.a - l2.a, l1.b - l2.b)
}

/** Эталон цвета зоны по однородному пятну вокруг семени. */
export function buildSeedColorProfile(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  sr: number,
  sg: number,
  sb: number,
): SeedColorProfile {
  const labs: LabColor[] = []
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx
      const y = sy + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const i = (y * w + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) continue
      if (!sameFillFamily(r, g, b, sr, sg, sb)) continue
      labs.push(rgbToLab(r, g, b))
    }
  }
  const seedLab = rgbToLab(sr, sg, sb)
  if (labs.length === 0) {
    return { sr, sg, sb, lab: seedLab, maxDeltaE: 18 }
  }
  labs.sort((a, b) => a.L - b.L)
  const mid = (labs.length / 2) | 0
  const medianLab = labs[mid]!
  const deltas = labs.map((lab) => deltaE76(lab, medianLab)).sort((a, b) => a - b)
  const p90 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.9))] ?? 0
  const maxDeltaE = Math.min(26, Math.max(12, Math.round(p90 * 1.35 + 8)))
  return { sr, sg, sb, lab: medianLab, maxDeltaE }
}

function pixelInFillZone(
  r: number,
  g: number,
  b: number,
  profile: SeedColorProfile,
  fromR?: number,
  fromG?: number,
  fromB?: number,
  edgeTol = 9,
): boolean {
  if (isInkBarrier(r, g, b) || isBackgroundSeed(r, g, b)) return false
  if (!sameFillFamily(r, g, b, profile.sr, profile.sg, profile.sb)) return false
  const de = deltaE76(rgbToLab(r, g, b), profile.lab)
  if (de <= profile.maxDeltaE) return true
  if (fromR == null || fromG == null || fromB == null) return false
  if (colorDistCheb(r, g, b, fromR, fromG, fromB) > edgeTol) return false
  return de <= profile.maxDeltaE + 5
}

function diagonalCrossesInk(
  data: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  nx: number,
  ny: number,
): boolean {
  const dx = nx - x
  const dy = ny - y
  if (dx === 0 || dy === 0) return false
  const i1 = (y * w + (x + dx)) * 4
  const i2 = ((y + dy) * w + x) * 4
  const ink1 = isInkBarrier(data[i1]!, data[i1 + 1]!, data[i1 + 2]!)
  const ink2 = isInkBarrier(data[i2]!, data[i2 + 1]!, data[i2 + 2]!)
  // Блокируем только угол штриха (оба кардинала — чернила), иначе заливка
  // обрывается на тонких линиях и антиалиасе.
  return ink1 && ink2
}

function edgeToleranceForSeed(sr: number, sg: number, sb: number, baseEdgeTol: number): number {
  if (!isChromaticFill(sr, sg, sb)) return baseEdgeTol
  return Math.min(baseEdgeTol, 7)
}

function chromaticHueBlocksStep(
  sr: number,
  sg: number,
  sb: number,
  toR: number,
  toG: number,
  toB: number,
): boolean {
  if (!isChromaticFill(sr, sg, sb)) return false
  const seedHue = fillHueDegrees(sr, sg, sb)
  const toHue = fillHueDegrees(toR, toG, toB)
  if (seedHue == null || toHue == null) return false
  return hueDistanceDegrees(seedHue, toHue) > FILL_HUE_TOLERANCE_DEG
}

/** Розовый / пурпурный / magenta — типичные ACI-заливки и бордюры на планах. */
function isMagentaFamily(r: number, g: number, b: number): boolean {
  if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) return false
  if (r < 120 || b < 120) return false
  if (g > Math.min(r, b) * 0.78) return false
  return true
}

/**
 * Насыщенный штрих того же тона, что пастельная заливка
 * (ярко-розовая/пурпурная линия внутри розовой зоны).
 */
function isSameHueBoundaryStroke(
  r: number,
  g: number,
  b: number,
  sr: number,
  sg: number,
  sb: number,
): boolean {
  const seedHue = fillHueDegrees(sr, sg, sb)
  const pixelHue = fillHueDegrees(r, g, b)
  if (seedHue == null || pixelHue == null) return false
  if (hueDistanceDegrees(seedHue, pixelHue) > 14) return false
  const chroma = fillChroma(r, g, b)
  const seedChroma = fillChroma(sr, sg, sb)
  if (chroma < 90) return false
  return chroma >= seedChroma + 35 && chroma >= 120
}

function maskStats(mask: Uint8Array, w: number, h: number) {
  let count = 0
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    count += 1
    const x = i % w
    const y = (i / w) | 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { count, minX, minY, maxX, maxY }
}

function keepConnectedComponentAtSeed(
  mask: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): Uint8Array {
  const out = new Uint8Array(mask.length)
  const start = sy * w + sx
  if (!mask[start]) return mask
  const queue = new Int32Array(mask.length)
  let qh = 0
  let qt = 0
  queue[qt++] = start
  out[start] = 1
  while (qh < qt) {
    const p = queue[qh++]
    const x = p % w
    const y = (p / w) | 0
    const nbs = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ] as const
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (!mask[ni] || out[ni]) continue
      out[ni] = 1
      if (qt < queue.length) queue[qt++] = ni
    }
  }
  return out
}

function pruneMaskToFillFamily(
  mask: Uint8Array,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sr: number,
  sg: number,
  sb: number,
): { mask: Uint8Array; count: number; minX: number; minY: number; maxX: number; maxY: number } {
  if (!isChromaticFill(sr, sg, sb)) {
    return { mask, ...maskStats(mask, w, h) }
  }
  const next = new Uint8Array(mask)
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const pi = i * 4
    const r = data[pi]!
    const g = data[pi + 1]!
    const b = data[pi + 2]!
    if (sameFillFamily(r, g, b, sr, sg, sb)) continue
    next[i] = 0
  }
  return { mask: next, ...maskStats(next, w, h) }
}

/** Через насыщенный штрих того же тона — добираем соседние куски розовой заливки. */
function growMaskAcrossHueBridges(
  mask: Uint8Array,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sr: number,
  sg: number,
  sb: number,
  tol: number,
  edgeTol: number,
): { mask: Uint8Array; count: number; minX: number; minY: number; maxX: number; maxY: number } {
  if (!isMagentaFamily(sr, sg, sb)) {
    return { mask, ...maskStats(mask, w, h) }
  }

  let cur = new Uint8Array(mask)
  let { count, minX, minY, maxX, maxY } = maskStats(cur, w, h)
  if (count === 0) return { mask: cur, count, minX, minY, maxX, maxY }

  // 1) Включить насыщенные линии того же тона, к которым уже подошли
  for (let round = 0; round < 3; round++) {
    const next = new Uint8Array(cur)
    let added = 0
    const x0 = Math.max(0, minX - 1)
    const y0 = Math.max(0, minY - 1)
    const x1 = Math.min(w - 1, maxX + 1)
    const y1 = Math.min(h - 1, maxY + 1)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (cur[i]) continue
        const pi = i * 4
        const r = data[pi]
        const g = data[pi + 1]
        const b = data[pi + 2]
        if (!isSameHueBoundaryStroke(r, g, b, sr, sg, sb)) continue
        let touch = false
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (cur[ny * w + nx]) {
              touch = true
              break
            }
          }
        }
        if (!touch) continue
        next[i] = 1
        added += 1
        count += 1
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    cur = next
    if (added === 0) break
  }

  // 2) Залить остаток той же розовой зоны за штрихом
  const seen = new Uint8Array(cur)
  const queue = new Int32Array(w * h)
  let qh = 0
  let qt = 0
  for (let i = 0; i < cur.length; i++) {
    if (!cur[i]) continue
    queue[qt++] = i
  }

  const matchesHueFill = (r: number, g: number, b: number) =>
    colorsMatchFill(r, g, b, sr, sg, sb, tol)

  while (qh < qt) {
    const p = queue[qh++]
    const x = p % w
    const y = (p / w) | 0
    const pi = p * 4
    const cr = data[pi]
    const cg = data[pi + 1]
    const cb = data[pi + 2]

    const nbs: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ]
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (seen[ni]) continue
      const j = ni * 4
      const nr = data[j]
      const ng = data[j + 1]
      const nb = data[j + 2]
      if (isSameHueBoundaryStroke(nr, ng, nb, sr, sg, sb)) {
        seen[ni] = 1
        cur[ni] = 1
        count += 1
        if (nx < minX) minX = nx
        if (ny < minY) minY = ny
        if (nx > maxX) maxX = nx
        if (ny > maxY) maxY = ny
        if (qt < queue.length) queue[qt++] = ni
        continue
      }
      if (!matchesHueFill(nr, ng, nb)) {
        seen[ni] = 1
        continue
      }
      if (shouldBlockFillStep(cr, cg, cb, nr, ng, nb, sr, sg, sb, edgeTol)) {
        seen[ni] = 1
        continue
      }
      seen[ni] = 1
      cur[ni] = 1
      count += 1
      if (nx < minX) minX = nx
      if (ny < minY) minY = ny
      if (nx > maxX) maxX = nx
      if (ny > maxY) maxY = ny
      if (qt < queue.length) queue[qt++] = ni
    }
  }

  return { mask: cur, count, minX, minY, maxX, maxY }
}

/** Для ярких ACI-заливок (зелёный/пурпур и т.п.) антиалиас даёт разброс >16 — расширяем tol. */
export function seedFillTolerance(sr: number, sg: number, sb: number, baseTol: number): number {
  const chroma = Math.max(sr, sg, sb) - Math.min(sr, sg, sb)
  if (chroma < 50) return baseTol
  return Math.max(baseTol, Math.min(52, Math.round(chroma * 0.22)))
}

/**
 * Блокировать шаг flood fill только на реальной границе двух заливок.
 * Антиалиас внутри одной зоны идёт маленькими шагами — пропускаем.
 * Скачок к другому кластеру цвета (дальше от семени) — режем.
 */
export function shouldBlockFillStep(
  fromR: number,
  fromG: number,
  fromB: number,
  toR: number,
  toG: number,
  toB: number,
  sr: number,
  sg: number,
  sb: number,
  edgeTol: number,
): boolean {
  if (
    sameFillFamily(fromR, fromG, fromB, sr, sg, sb) &&
    !sameFillFamily(toR, toG, toB, sr, sg, sb)
  ) {
    return true
  }
  if (chromaticHueBlocksStep(sr, sg, sb, toR, toG, toB)) return true
  const jump = colorDistCheb(fromR, fromG, fromB, toR, toG, toB)
  if (jump <= edgeTol) return false
  const dFrom = colorDistCheb(fromR, fromG, fromB, sr, sg, sb)
  const dTo = colorDistCheb(toR, toG, toB, sr, sg, sb)
  // Ближе/сопоставимо с семенем — AA внутри той же заливки
  if (dTo <= dFrom + 3) return false
  // Уходим от семени на другой оттенок — граница соседней зоны
  if (dTo > dFrom + 8) return true
  const fromChroma = Math.max(fromR, fromG, fromB) - Math.min(fromR, fromG, fromB)
  const toChroma = Math.max(toR, toG, toB) - Math.min(toR, toG, toB)
  if (fromChroma >= 40 && toChroma >= 40) {
    if (dominantChannel(fromR, fromG, fromB) !== dominantChannel(toR, toG, toB)) return true
  }
  return jump > edgeTol + 6
}

/** Скачок на границе двух заливок — не переходим, даже если оба «похожи» на семя. */
export function crossesFillEdge(
  fromR: number,
  fromG: number,
  fromB: number,
  toR: number,
  toG: number,
  toB: number,
  edgeTol: number,
): boolean {
  return colorDistCheb(fromR, fromG, fromB, toR, toG, toB) > edgeTol
}

/**
 * Семя: однородный 3×3 вокруг касания — не берём «смешанную» границу двух заливок.
 */
function sampleCohesiveSeedAt(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
): { x: number; y: number; r: number; g: number; b: number } | null {
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null
  const ci = (cy * w + cx) * 4
  const cr = data[ci]!
  const cg = data[ci + 1]!
  const cb = data[ci + 2]!
  if (isBackgroundSeed(cr, cg, cb) || isInkBarrier(cr, cg, cb)) return null

  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  let valid = 0
  let same = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const i = (y * w + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) continue
      valid += 1
      if (!sameFillFamily(r, g, b, cr, cg, cb)) continue
      same += 1
      rs.push(r)
      gs.push(g)
      bs.push(b)
    }
  }
  if (valid === 0 || same < Math.max(3, Math.ceil(valid * 0.66))) return null
  if (rs.length === 0) return null
  rs.sort((a, b) => a - b)
  gs.sort((a, b) => a - b)
  bs.sort((a, b) => a - b)
  const mid = (rs.length / 2) | 0
  return { x: cx, y: cy, r: rs[mid]!, g: gs[mid]!, b: bs[mid]! }
}

export function findColorSeed(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  maxRadius = 14,
): { x: number; y: number; r: number; g: number; b: number } | null {
  const clampX = Math.max(0, Math.min(w - 1, Math.round(x0)))
  const clampY = Math.max(0, Math.min(h - 1, Math.round(y0)))

  const direct = sampleCohesiveSeedAt(data, w, h, clampX, clampY)
  if (direct) {
    // Если пятно тусклое/редкое — лучше взять доминирующий яркий цвет рядом
    // (типичный AA внутри голубой/зелёной ACI-заливки).
    const preferred = preferDominantChromaticSeed(data, w, h, clampX, clampY, 18, direct)
    return preferred ?? direct
  }

  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      const dxEdge = rad - Math.abs(dy)
      for (const dx of dxEdge === 0 ? [0] : [-dxEdge, dxEdge]) {
        const hit = sampleCohesiveSeedAt(data, w, h, clampX + dx, clampY + dy)
        if (hit) {
          const preferred = preferDominantChromaticSeed(data, w, h, hit.x, hit.y, 18, hit)
          return preferred ?? hit
        }
      }
    }
  }
  return null
}

/**
 * В окне вокруг клика выбирает самый частый насыщенный цвет той же семьи.
 * Иначе клик по AA-пикселю (79,150,221) не сливается с основной лужей (127,191,255).
 */
export function preferDominantChromaticSeed(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  fallback: { x: number; y: number; r: number; g: number; b: number },
): { x: number; y: number; r: number; g: number; b: number } | null {
  if (!isChromaticFill(fallback.r, fallback.g, fallback.b)) return null
  type Acc = {
    n: number
    chroma: number
    dist: number
    x: number
    y: number
    r: number
    g: number
    b: number
  }
  const counts = new Map<string, Acc>()
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const i = (y * w + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      if (!isChromaticFill(r, g, b)) continue
      if (!sameFillFamily(r, g, b, fallback.r, fallback.g, fallback.b)) continue
      const key = `${r & ~7},${g & ~7},${b & ~7}`
      const chroma = fillChroma(r, g, b)
      const dist = Math.hypot(dx, dy)
      const prev = counts.get(key)
      if (prev) {
        prev.n += 1
        // Предпочитаем ближе к клику; при равной дистанции — ярче.
        if (dist < prev.dist - 0.01 || (Math.abs(dist - prev.dist) <= 0.01 && chroma > prev.chroma)) {
          prev.chroma = chroma
          prev.dist = dist
          prev.x = x
          prev.y = y
          prev.r = r
          prev.g = g
          prev.b = b
        }
      } else {
        counts.set(key, { n: 1, chroma, dist, x, y, r, g, b })
      }
    }
  }
  let best: Acc | null = null
  for (const row of counts.values()) {
    if (!best || row.n > best.n || (row.n === best.n && row.chroma > best.chroma)) best = row
  }
  if (!best || best.n < 6) return null
  if (
    colorDistCheb(best.r, best.g, best.b, fallback.r, fallback.g, fallback.b) <= 8
  ) {
    return null
  }
  return { x: best.x, y: best.y, r: best.r, g: best.g, b: best.b }
}

function compressAxisChain(chain: Point2D[]): Point2D[] {
  if (chain.length <= 2) return chain
  const out: Point2D[] = [chain[0]!]
  for (let i = 1; i < chain.length - 1; i++) {
    const prev = out[out.length - 1]!
    const curr = chain[i]!
    const next = chain[i + 1]!
    const v1x = curr.x - prev.x
    const v1y = curr.y - prev.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const cross = Math.abs(v1x * v2y - v1y * v2x)
    const dot = v1x * v2x + v1y * v2y
    if (cross > 0.02 || dot <= 0) out.push(curr)
  }
  out.push(chain[chain.length - 1]!)
  return out
}

function appendHullPoints(hull: Point2D[], chunk: Point2D[]) {
  for (const p of chunk) {
    if (!hull.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.45)) hull.push(p)
  }
}

/**
 * Ортогональная оболочка маски — углы участка без пиксельной «лесенки».
 * Для заливок на чертеже (прямоугольники, Г-образные зоны).
 */
export function traceMaskOrthoHull(
  mask: Uint8Array,
  w: number,
  h: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Point2D[] | null {
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1

  const top: Point2D[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (filled(x, y)) {
        top.push({ x: x + 0.5, y: y + 0.5 })
        break
      }
    }
  }
  const right: Point2D[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = maxX; x >= minX; x--) {
      if (filled(x, y)) {
        right.push({ x: x + 1.5, y: y + 0.5 })
        break
      }
    }
  }
  const bottom: Point2D[] = []
  for (let x = maxX; x >= minX; x--) {
    for (let y = maxY; y >= minY; y--) {
      if (filled(x, y)) {
        bottom.push({ x: x + 0.5, y: y + 1.5 })
        break
      }
    }
  }
  const left: Point2D[] = []
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      if (filled(x, y)) {
        left.push({ x: x + 0.5, y: y + 0.5 })
        break
      }
    }
  }

  const hull: Point2D[] = []
  appendHullPoints(hull, compressAxisChain(top))
  appendHullPoints(hull, compressAxisChain(right))
  appendHullPoints(hull, compressAxisChain(bottom))
  appendHullPoints(hull, compressAxisChain(left))

  return hull.length >= 3 ? hull : null
}

/**
 * Обход внешней границы маски (Moore neighborhood).
 * Важно: идём только по контуру, не «ныряем» внутрь заливки —
 * иначе точки сбиваются в кучу у одного края.
 */
export function traceMaskContour(
  mask: Uint8Array,
  w: number,
  h: number,
): Point2D[] | null {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1

  // Верхний-левый граничный пиксель
  let sx = -1
  let sy = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        sx = x
        sy = y
        break
      }
    }
    if (sx >= 0) break
  }
  if (sx < 0) return null

  // E, SE, S, SW, W, NW, N, NE — по часовой
  const dx = [1, 1, 0, -1, -1, -1, 0, 1]
  const dy = [0, 1, 1, 1, 0, -1, -1, -1]

  const pts: Point2D[] = []
  let cx = sx
  let cy = sy
  // «Пришли» снаружи слева
  let bx = sx - 1
  let by = sy
  const seen = new Set<string>()
  const limit = Math.max(64, w * h)

  for (let n = 0; n < limit; n++) {
    const state = `${cx},${cy},${bx},${by}`
    if (seen.has(state)) break
    seen.add(state)
    pts.push({ x: cx + 0.5, y: cy + 0.5 })

    let backIdx = 0
    for (let i = 0; i < 8; i++) {
      if (cx + dx[i] === bx && cy + dy[i] === by) {
        backIdx = i
        break
      }
    }

    let found = false
    for (let k = 1; k <= 8; k++) {
      const i = (backIdx + k) % 8
      const nx = cx + dx[i]
      const ny = cy + dy[i]
      if (!inside(nx, ny)) continue
      bx = cx
      by = cy
      cx = nx
      cy = ny
      found = true
      break
    }
    if (!found) break

    // Замкнули контур: вернулись в старт после полного обхода
    if (cx === sx && cy === sy && pts.length >= 3) break
  }

  if (pts.length < 4) return null
  const cleaned: Point2D[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const q = cleaned[cleaned.length - 1]
    if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 1e-6) continue
    cleaned.push(p)
  }
  return cleaned.length >= 4 ? cleaned : pts
}

/**
 * Схлопывает «лесенку» растра: точки на 1px ступеньках (горизонт↔вертикаль)
 * — артефакт пикселей, а не реальные углы зоны. Повторяем, пока есть что убрать.
 */
export function collapseRasterStairs(points: Point2D[]): Point2D[] {
  if (points.length < 4) return points

  let pts = points
  const last = points[points.length - 1]
  if (Math.hypot(points[0].x - last.x, points[0].y - last.y) < 1.05) {
    pts = points.slice(0, -1)
  }
  if (pts.length < 4) return points

  const isAxisUnit = (dx: number, dy: number) => {
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    // ровно один шаг по оси (~1 px), второй ≈ 0
    return (ax <= 1.15 && ay <= 0.2) || (ay <= 1.15 && ax <= 0.2)
  }

  let guard = 0
  while (guard++ < 48) {
    const n = pts.length
    if (n < 4) break
    const out: Point2D[] = []
    let removed = 0
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n]
      const b = pts[i]
      const c = pts[(i + 1) % n]
      const abx = b.x - a.x
      const aby = b.y - a.y
      const bcx = c.x - b.x
      const bcy = c.y - b.y
      if (isAxisUnit(abx, aby) && isAxisUnit(bcx, bcy)) {
        // перпендикулярный поворот = ступенька диагонали
        const dot = abx * bcx + aby * bcy
        if (Math.abs(dot) < 0.35) {
          removed += 1
          continue
        }
      }
      out.push(b)
    }
    if (removed === 0 || out.length < 3) break
    pts = out
  }
  return pts.length >= 3 ? pts : points
}

/** Углы контура для отображения точек (не все пиксели границы). */
export function cornerVertices(points: Point2D[], maxCorners = 32): Point2D[] {
  return structuralZoneContour(points, undefined, maxCorners)
}

/** Схлопывает серии точек на одной горизонтали/вертикали (оси растра). */
export function mergeOrthogonalRuns(points: Point2D[]): Point2D[] {
  if (points.length < 4) return points

  let pts = points
  const last = points[points.length - 1]
  if (Math.hypot(points[0].x - last.x, points[0].y - last.y) < 1.05) {
    pts = points.slice(0, -1)
  }
  const n = pts.length
  if (n < 4) return points

  const horiz = (dx: number, dy: number) => Math.abs(dy) <= 0.65 && Math.abs(dx) > 0.35
  const vert = (dx: number, dy: number) => Math.abs(dx) <= 0.65 && Math.abs(dy) > 0.35

  const out: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const curr = pts[i]!
    const next = pts[(i + 1) % n]!
    const dx1 = curr.x - prev.x
    const dy1 = curr.y - prev.y
    const dx2 = next.x - curr.x
    const dy2 = next.y - curr.y
    if ((horiz(dx1, dy1) && horiz(dx2, dy2)) || (vert(dx1, dy1) && vert(dx2, dy2))) {
      continue
    }
    out.push(curr)
  }
  return out.length >= 3 ? out : points
}

function mergeOrthogonalRunsLoop(points: Point2D[], maxPass = 12): Point2D[] {
  let pts = points
  for (let i = 0; i < maxPass; i++) {
    const next = mergeOrthogonalRuns(pts)
    if (next.length === pts.length) return next
    pts = next
  }
  return pts
}

/** Оставляет вершины с заметным поворотом — углы зоны, не пиксели «лесенки». */
export function extractCornerVertices(
  points: Point2D[],
  minTurnDeg = 8,
  minEdgeLen = 0,
): Point2D[] {
  const pts = mergeOrthogonalRunsLoop(collapseRasterStairs(points))
  if (pts.length <= 4) return pts
  const n = pts.length
  const corners: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!
    const b = pts[i]!
    const c = pts[(i + 1) % n]!
    const v1x = a.x - b.x
    const v1y = a.y - b.y
    const v2x = c.x - b.x
    const v2y = c.y - b.y
    const l1 = Math.hypot(v1x, v1y)
    const l2 = Math.hypot(v2x, v2y)
    if (l1 < 0.35 || l2 < 0.35) continue
    if (minEdgeLen > 0 && Math.min(l1, l2) < minEdgeLen) continue
    const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))
    const turn = Math.acos(dot) * (180 / Math.PI)
    if (turn >= minTurnDeg) corners.push(b)
  }
  return corners.length >= 3 ? corners : pts
}

/** Выравнивает почти горизонтальные/вертикальные рёбра по осям растра. */
export function snapRectilinearOutline(points: Point2D[], span: number): Point2D[] {
  if (points.length < 4) return points

  let pts = points
  const last = points[points.length - 1]
  if (Math.hypot(points[0].x - last.x, points[0].y - last.y) < 1.05) {
    pts = points.slice(0, -1)
  }
  if (pts.length < 3) return points

  const snapPx = Math.max(0.55, span * 0.0035)
  const n = pts.length
  const snapped: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const curr = pts[i]!
    const next = pts[(i + 1) % n]!
    let x = curr.x
    let y = curr.y
    const dx1 = curr.x - prev.x
    const dy1 = curr.y - prev.y
    const dx2 = next.x - curr.x
    const dy2 = next.y - curr.y
    const horiz1 = Math.abs(dy1) <= snapPx && Math.abs(dx1) > snapPx
    const vert1 = Math.abs(dx1) <= snapPx && Math.abs(dy1) > snapPx
    const horiz2 = Math.abs(dy2) <= snapPx && Math.abs(dx2) > snapPx
    const vert2 = Math.abs(dx2) <= snapPx && Math.abs(dy2) > snapPx
    if (horiz1 || horiz2) y = Math.round(y * 2) / 2
    if (vert1 || vert2) x = Math.round(x * 2) / 2
    snapped.push({ x, y })
  }
  return mergeOrthogonalRunsLoop(collapseRasterStairs(snapped))
}

function maskBBoxContour(minX: number, minY: number, maxX: number, maxY: number): Point2D[] {
  return [
    { x: minX + 0.5, y: minY + 0.5 },
    { x: maxX + 1.5, y: minY + 0.5 },
    { x: maxX + 1.5, y: maxY + 1.5 },
    { x: minX + 0.5, y: maxY + 1.5 },
  ]
}

/** Площадь контура ≈ числу пикселей маски — иначе оболочка «раздула» зону. */
export function contourMatchesMaskPixels(outline: Point2D[], pixelCount: number): boolean {
  if (outline.length < 3 || pixelCount <= 0) return false
  const ratio = Math.abs(polygonArea(outline)) / pixelCount
  return ratio >= 0.86 && ratio <= 1.1
}

function isGreenFillFamily(r: number, g: number, b: number): boolean {
  return g >= 100 && g >= r + 22 && g >= b + 12
}

/**
 * Голубые / синие ACI-заливки (в т.ч. приглушённый AA внутри яркой зоны).
 * Без этого клик по «чуть более тёмному» пикселю в той же луже → tiny.
 */
export function isBlueCyanFillFamily(r: number, g: number, b: number): boolean {
  if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) return false
  if (b < 95) return false
  const chroma = fillChroma(r, g, b)
  if (chroma < 28) return false
  // Синий/голубой: B доминирует или cyan (G и B высокие, R ниже).
  if (b >= g && b >= r + 18) return true
  if (b >= 160 && g >= 90 && r <= g && b - r >= 40) return true
  return false
}

/** Жёлтые / светло-жёлтые ACI-заливки (не зелёный, не оранжевый, не олива). */
export function isYellowFillFamily(r: number, g: number, b: number): boolean {
  if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) return false
  if (isGreenFillFamily(r, g, b)) return false
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  const chroma = maxC - minC
  if (chroma < 40) return false
  // Олива/грязь (средняя яркость, r≈g, низкий b) — не жёлтое покрытие.
  if (maxC < 200 && Math.abs(r - g) <= 18 && b <= Math.min(r, g) * 0.72) return false
  if (r < 85 || g < 85) return false
  if (b > Math.min(r, g) * 0.78 + 12) return false
  if (g >= r + 18) return false
  if (r >= g + 55) return false
  return true
}

function refineStructuralContour(
  points: Point2D[],
  span: number,
  maxVertices: number,
  maskBBox?: { minX: number; minY: number; maxX: number; maxY: number },
  fillRatio?: number,
): Point2D[] {
  const minEdge = Math.max(2.5, span * 0.016)

  let pts = mergeOrthogonalRunsLoop(collapseRasterStairs(points))
  let eps = Math.max(2.2, span * 0.048)
  pts = simplifyContour(pts, eps)
  pts = extractCornerVertices(pts, 12, minEdge)
  pts = snapRectilinearOutline(pts, span)

  for (let pass = 0; pass < 8 && pts.length > maxVertices; pass++) {
    eps *= 1.38
    pts = mergeOrthogonalRunsLoop(collapseRasterStairs(pts))
    pts = simplifyContour(pts, eps)
    pts = extractCornerVertices(pts, 16 + pass * 3, minEdge * (1 + pass * 0.25))
    pts = snapRectilinearOutline(pts, span)
  }

  if (
    pts.length > maxVertices &&
    maskBBox &&
    fillRatio != null &&
    fillRatio >= 0.92
  ) {
    return maskBBoxContour(maskBBox.minX, maskBBox.minY, maskBBox.maxX, maskBBox.maxY)
  }

  if (pts.length > maxVertices) {
    const step = pts.length / maxVertices
    const sampled: Point2D[] = []
    for (let i = 0; i < maxVertices; i++) {
      sampled.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]!)
    }
    pts = sampled.length >= 3 ? sampled : pts
    pts = snapRectilinearOutline(pts, span)
  }

  return pts.length >= 3 ? pts : points
}

/**
 * Контур заливки → углы участка (4–16 точек), без пиксельной обводки.
 * Площадь по-прежнему считается по маске пикселей, не по этому контуру.
 */
export function structuralZoneContour(
  points: Point2D[],
  bbox?: { bw: number; bh: number },
  maxVertices = 16,
  maskBBox?: { minX: number; minY: number; maxX: number; maxY: number },
  fillRatio?: number,
): Point2D[] {
  if (points.length < 4) return points
  const span = bbox ? Math.max(bbox.bw, bbox.bh, 1) : 64
  return refineStructuralContour(points, span, maxVertices, maskBBox, fillRatio)
}

function openRdp(points: Point2D[], eps: number): Point2D[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = points[a].x
    const ay = points[a].y
    const bx = points[b].x
    const by = points[b].y
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x
      const py = points[i].y
      const d =
        len2 < 1e-12
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(len2)
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > eps && maxI > 0) {
      keep[maxI] = 1
      stack.push([a, maxI], [maxI, b])
    }
  }
  const out: Point2D[] = []
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i])
  }
  return out.length >= 2 ? out : points
}

/**
 * Упрощение контура. Для замкнутых колец якоря — две противоположные точки,
 * иначе RDP схлопывает всё в кучу (начало и конец почти совпадают).
 */
export function simplifyContour(points: Point2D[], eps: number): Point2D[] {
  if (points.length < 4) return points

  let pts = points
  const last = points[points.length - 1]
  if (Math.hypot(points[0].x - last.x, points[0].y - last.y) < 1.05) {
    pts = points.slice(0, -1)
  }
  if (pts.length < 4) return points

  let farI = 1
  let farD = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y)
    if (d > farD) {
      farD = d
      farI = i
    }
  }

  const chainA = pts.slice(0, farI + 1)
  const chainB = pts.slice(farI).concat(pts.slice(0, 1))
  const a = openRdp(chainA, eps)
  const b = openRdp(chainB, eps)
  const out = [...a.slice(0, -1), ...b.slice(0, -1)]
  return out.length >= 3 ? out : openRdp(pts, eps)
}

/** Режет контур заливки до числа вершин, удобных для ручного редактирования. */
export function softenContourForEditing(points: Point2D[], maxVertices = 48): Point2D[] {
  if (points.length < 3) return points
  let pts = mergeOrthogonalRunsLoop(collapseRasterStairs(points))
  if (pts.length <= maxVertices) return pts

  for (let minTurn = 8; minTurn <= 28; minTurn += 4) {
    const corners = extractCornerVertices(pts, minTurn, 1.2)
    if (corners.length >= 3 && corners.length <= maxVertices) return corners
  }

  let eps = 1.2
  for (let pass = 0; pass < 10 && pts.length > maxVertices; pass++) {
    pts = collapseRasterStairs(simplifyContour(pts, eps))
    eps *= 1.28
  }
  if (pts.length <= maxVertices) return pts

  const step = pts.length / maxVertices
  const sampled: Point2D[] = []
  for (let i = 0; i < maxVertices; i++) {
    sampled.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]!)
  }
  return sampled.length >= 3 ? sampled : pts
}

export function simplifyContourForEditing(points: Point2D[], maxVertices = 16): Point2D[] {
  return softenContourForEditing(points, maxVertices)
}

/**
 * Контур заливки по маске: следует границе пикселей, лесенка схлопнута,
 * без принудительного «прямоугольника» и snap по осям.
 */
export function contourFromFillMask(
  mask: Uint8Array,
  w: number,
  h: number,
  span: number,
): Point2D[] | null {
  const traced = traceMaskContour(mask, w, h)
  if (!traced || traced.length < 3) return null

  let contour = mergeOrthogonalRunsLoop(collapseRasterStairs(traced))
  const eps = Math.max(0.75, Math.min(span * 0.011, 6))
  if (contour.length > 80) {
    contour = collapseRasterStairs(simplifyContour(contour, eps))
  }
  if (contour.length > 56) {
    const corners = extractCornerVertices(contour, 9, 1.1)
    if (corners.length >= 3) contour = corners
  }
  return contour.length >= 3 ? contour : null
}

export let lastPickDebug: Record<string, unknown> = {}

function regionTouchesBorder(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  w: number,
  h: number,
  margin = 1,
): boolean {
  return minX <= margin || minY <= margin || maxX >= w - 1 - margin || maxY >= h - 1 - margin
}

/** Только характерные «колодцы» (~80–900 px) и средние круги до ~12k px. */
function isSmallCircleIsland(count: number, bw: number, bh: number): boolean {
  if (count < 80) return false
  const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh))
  if (aspect > 1.3) return false
  const r = Math.min(bw, bh) / 2
  if (r < 4) return false
  const circleArea = Math.PI * r * r
  const ratio = count / circleArea
  if (ratio < 0.78 || ratio > 1.22) return false
  return count <= 12_000
}

/** Эпсилон RDP: крупнее зона → сильнее режем пиксельную лесенку, углы сохраняем. */
export function contourSimplifyEps(count: number, bw: number, bh: number): number {
  const span = Math.max(bw, bh, 1)
  void count
  return Math.max(1.1, Math.min(span * 0.028, 42))
}

function sameFillFamily(
  r: number,
  g: number,
  b: number,
  sr: number,
  sg: number,
  sb: number,
): boolean {
  if (isYellowFillFamily(sr, sg, sb)) return isYellowFillFamily(r, g, b)
  if (isGreenFillFamily(sr, sg, sb)) return isGreenFillFamily(r, g, b)
  if (isMagentaFamily(sr, sg, sb)) return isMagentaFamily(r, g, b)
  if (isBlueCyanFillFamily(sr, sg, sb)) return isBlueCyanFillFamily(r, g, b)

  const seedChromatic = isChromaticFill(sr, sg, sb)
  const pixelChromatic = isChromaticFill(r, g, b)
  if (!seedChromatic) {
    if (pixelChromatic) return false
    return (
      dominantChannel(r, g, b) === dominantChannel(sr, sg, sb) &&
      colorDistCheb(r, g, b, sr, sg, sb) <= 24
    )
  }
  if (!pixelChromatic) return false

  const seedHue = fillHueDegrees(sr, sg, sb)
  const pixelHue = fillHueDegrees(r, g, b)
  if (seedHue == null || pixelHue == null) {
    return colorDistCheb(r, g, b, sr, sg, sb) <= 18
  }
  return hueDistanceDegrees(seedHue, pixelHue) <= FILL_HUE_TOLERANCE_DEG
}

/** Пиксель в заливке: эталон зоны + локальный AA от соседа. */
function canIncludeInFill(
  r: number,
  g: number,
  b: number,
  fromR: number,
  fromG: number,
  fromB: number,
  profile: SeedColorProfile,
  edgeTol: number,
): boolean {
  return pixelInFillZone(r, g, b, profile, fromR, fromG, fromB, edgeTol)
}

function floodFillMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  profile: SeedColorProfile,
  edgeTol: number,
  maxPixels: number,
): {
  mask: Uint8Array
  count: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  sumX: number
  sumY: number
} {
  const { sr, sg, sb } = profile
  const mask = new Uint8Array(w * h)
  const seen = new Uint8Array(w * h)
  const queue = new Int32Array(Math.min(maxPixels + 64, w * h))
  let qh = 0
  let qt = 0
  const start = sy * w + sx
  queue[qt++] = start
  seen[start] = 1
  let count = 0
  let sumX = 0
  let sumY = 0
  let minX = sx
  let minY = sy
  let maxX = sx
  let maxY = sy

  while (qh < qt && count < maxPixels) {
    const p = queue[qh++]
    const x = p % w
    const y = (p / w) | 0
    const i = p * 4
    const cr = data[i]!
    const cg = data[i + 1]!
    const cb = data[i + 2]!

    mask[p] = 1
    count += 1
    sumX += x
    sumY += y
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y

    const cardinals: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    const diagonals: Array<[number, number]> = [
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ]
    const nbs = [...cardinals]
    for (const [nx, ny] of diagonals) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (mask[y * w + (nx)] || mask[ny * w + x]) nbs.push([nx, ny])
    }
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (seen[ni]) continue
      const j = ni * 4
      const nr = data[j]!
      const ng = data[j + 1]!
      const nb = data[j + 2]
      if (diagonalCrossesInk(data, w, x, y, nx, ny)) {
        seen[ni] = 1
        continue
      }
      if (!canIncludeInFill(nr, ng, nb!, cr, cg, cb, profile, edgeTol)) {
        seen[ni] = 1
        continue
      }
      if (shouldBlockFillStep(cr, cg, cb, nr, ng, nb!, sr, sg, sb, edgeTol)) {
        seen[ni] = 1
        continue
      }
      if (
        chromaticHueBlocksStep(sr, sg, sb, nr, ng, nb!) &&
        deltaE76(rgbToLab(nr, ng, nb!), profile.lab) > profile.maxDeltaE
      ) {
        seen[ni] = 1
        continue
      }
      seen[ni] = 1
      if (qt < queue.length) queue[qt++] = ni
    }
  }

  return { mask, count, minX, minY, maxX, maxY, sumX, sumY }
}

export function pickRegionFromImageData(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  pixelsPerUnit: number,
  opts?: {
    tolerance?: number
    edgeTol?: number
    maxPixels?: number
    minPixels?: number
    simplifyEps?: number
    seedRgb?: { r: number; g: number; b: number }
    seedSearchRadius?: number
  },
): PngPickedRegion | null {
  lastPickDebug = {}
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data

  const found =
    opts?.seedRgb != null
      ? {
          x: Math.max(0, Math.min(w - 1, Math.round(seedX))),
          y: Math.max(0, Math.min(h - 1, Math.round(seedY))),
          r: opts.seedRgb.r,
          g: opts.seedRgb.g,
          b: opts.seedRgb.b,
        }
      : findColorSeed(data, w, h, seedX, seedY, opts?.seedSearchRadius ?? 10)
  if (!found) {
    lastPickDebug = { reason: 'bg' }
    return null
  }

  const sx = found.x
  const sy = found.y
  const sr = found.r
  const sg = found.g
  const sb = found.b
  const chromaticSeed = isChromaticFill(sr, sg, sb)
  const profile = buildSeedColorProfile(data, w, h, sx, sy, sr, sg, sb)
  const edgeTol0 = edgeToleranceForSeed(sr, sg, sb, opts?.edgeTol ?? 9)
  const maxPixels = opts?.maxPixels ?? Math.min(3_500_000, w * h)
  const minPixels = opts?.minPixels ?? 3

  const filled = floodFillMask(data, w, h, sx, sy, profile, edgeTol0, maxPixels)

  let { mask, count, minX, minY, maxX, maxY } = filled

  // Tiny на AA-пикселе: повторяем с доминирующим цветом семьи в радиусе.
  if (count < Math.max(minPixels, 12) && opts?.seedRgb == null) {
    const alt = preferDominantChromaticSeed(data, w, h, sx, sy, 28, {
      x: sx,
      y: sy,
      r: sr,
      g: sg,
      b: sb,
    })
    if (
      alt &&
      (alt.x !== sx || alt.y !== sy || colorDistCheb(alt.r, alt.g, alt.b, sr, sg, sb) > 8)
    ) {
      return pickRegionFromImageData(imageData, alt.x, alt.y, pixelsPerUnit, {
        ...opts,
        seedRgb: { r: alt.r, g: alt.g, b: alt.b },
      })
    }
  }

  if (count < minPixels) {
    lastPickDebug = { reason: 'tiny', count }
    return null
  }

  mask = keepConnectedComponentAtSeed(mask, w, h, sx, sy)
  ;({ count, minX, minY, maxX, maxY } = maskStats(mask, w, h))
  if (count < minPixels) {
    lastPickDebug = { reason: 'disconnected', count }
    return null
  }

  if (chromaticSeed) {
    const beforeCount = count
    const stripped = pruneMaskToFillFamily(mask, data, w, h, sr, sg, sb)
    if (stripped.count >= beforeCount * 0.85) {
      mask = stripped.mask
      count = stripped.count
      minX = stripped.minX
      minY = stripped.minY
      maxX = stripped.maxX
      maxY = stripped.maxY
      mask = keepConnectedComponentAtSeed(mask, w, h, sx, sy)
      ;({ count, minX, minY, maxX, maxY } = maskStats(mask, w, h))
      if (count < minPixels) {
        lastPickDebug = { reason: 'stripped', count }
        return null
      }
    }
  }

  // Цветные бордюры — только для нейтральных/серых заливок; ACI-цвет не расширяем.
  if (count >= 40 && !chromaticSeed) {
    const absorbed = absorbBoundaryStrokes(mask, data, w, h, sr, sg, sb, 2)
    mask = absorbed.mask
    count = absorbed.count
    minX = absorbed.minX
    minY = absorbed.minY
    maxX = absorbed.maxX
    maxY = absorbed.maxY
  }

  if (count >= 40 && isMagentaFamily(sr, sg, sb)) {
    const grown = growMaskAcrossHueBridges(mask, data, w, h, sr, sg, sb, profile.maxDeltaE, edgeTol0)
    mask = grown.mask
    count = grown.count
    minX = grown.minX
    minY = grown.minY
    maxX = grown.maxX
    maxY = grown.maxY
  }

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  if (bw < 1 || bh < 1) {
    lastPickDebug = { reason: 'nobbox', count }
    return null
  }
  const chromaticLotEarly =
    isGreenFillFamily(sr, sg, sb) ||
    isBlueCyanFillFamily(sr, sg, sb) ||
    isMagentaFamily(sr, sg, sb) ||
    isYellowFillFamily(sr, sg, sb)
  // Компактные зелёные/цветные участки на PNG часто «круглые» по bbox — это не колодцы.
  if (!chromaticLotEarly && isSmallCircleIsland(count, bw, bh)) {
    lastPickDebug = { reason: 'circle-mask', count, bw, bh }
    return null
  }

  const maskBBox = { minX, minY, maxX, maxY }
  const fillRatio = count / Math.max(1, bw * bh)

  if (isOversizedFillSpill(count, w, h, bw, bh, sr, sg, sb, fillRatio)) {
    lastPickDebug = { reason: 'spill', count, bw, bh, fillRatio }
    return null
  }

  const contour = finalizeRegionOutline(mask, w, h, count, bw, bh, maskBBox, fillRatio, opts?.simplifyEps)
  if (!contour || contour.length < 3) {
    lastPickDebug = { reason: 'nocontour', count, bw, bh, fillRatio }
    return null
  }

  const area = count / (pixelsPerUnit * pixelsPerUnit)
  const perimeter = polygonPerimeter(contour, true) / pixelsPerUnit
  // Круги-колодцы отсекаем только для нейтральных/серых пятен.
  // Яркие ACI (зелёный/голубой/пурпур) на PNG — участки покрытия, не «кружки».
  const chromaticLot =
    isGreenFillFamily(sr, sg, sb) ||
    isBlueCyanFillFamily(sr, sg, sb) ||
    isMagentaFamily(sr, sg, sb) ||
    isYellowFillFamily(sr, sg, sb)
  if (
    !chromaticLot &&
    count >= 100 &&
    contour.length >= 6 &&
    isCircleLikeRegion({ vertices: contour, area, perimeter })
  ) {
    lastPickDebug = { reason: 'circle-shape', count, bw, bh }
    return null
  }

  lastPickDebug = {
    reason: 'ok',
    count,
    area,
    verts: contour.length,
    bw,
    bh,
    fillRatio,
    touchesBorder: regionTouchesBorder(minX, minY, maxX, maxY, w, h),
    bbox: maskBBox,
    source: 'png',
  }
  return {
    pixels: contour,
    holes: [],
    area,
    perimeter,
    maskBBox,
    pixelCount: count,
    maskOverlay: extractRegionMaskOverlay(mask, w, h, minX, minY, maxX, maxY),
  }
}

/**
 * Контур для оверлея: площадь полигона ≈ маске.
 * Компактные пятна — углы; тонкие коридоры — без схлопывания в треугольник.
 */
export function finalizeRegionOutline(
  mask: Uint8Array,
  w: number,
  h: number,
  count: number,
  bw: number,
  bh: number,
  maskBBox: { minX: number; minY: number; maxX: number; maxY: number },
  fillRatio: number,
  simplifyEps?: number,
): Point2D[] {
  const span = Math.max(bw, bh, 1)
  const { minX, minY, maxX, maxY } = maskBBox

  const fallbackTrace = (): Point2D[] => {
    let c = traceMaskContour(mask, w, h)
    const eps =
      simplifyEps ?? Math.max(0.35, Math.min(1.35, Math.sqrt(Math.max(count, 1)) * 0.028))
    if (c && c.length >= 3) {
      c = mergeOrthogonalRunsLoop(collapseRasterStairs(c))
      c = simplifyContour(c, eps)
      if (count < 40 && c.length < 4) {
        const raw = traceMaskContour(mask, w, h)
        if (raw && raw.length >= 4) {
          c = simplifyContour(mergeOrthogonalRunsLoop(collapseRasterStairs(raw)), 0.25)
        }
      }
      return c.length >= 3 ? c : maskBBoxContour(minX, minY, maxX, maxY)
    }
    return maskBBoxContour(minX, minY, maxX, maxY)
  }

  const base = contourFromFillMask(mask, w, h, span) ?? fallbackTrace()
  const accept = (pts: Point2D[], loose = false) => {
    if (pts.length < 4) return false
    if (!loose) return contourMatchesMaskPixels(pts, count)
    const ratio = Math.abs(polygonArea(pts)) / count
    return ratio >= 0.55 && ratio <= 1.45
  }

  // Плотные «пятна» — можно ужать до углов.
  if (fillRatio >= 0.42 && count >= 60) {
    const structural = structuralZoneContour(base, { bw, bh }, 20, maskBBox, fillRatio)
    if (accept(structural)) {
      const soft = softenContourForEditing(structural, 24)
      if (accept(soft)) return soft
      return structural
    }
  }

  // Тонкие коридоры: не схлопывать — иначе заливка рисует треугольник через концы.
  if (fillRatio < 0.28) {
    const light = mergeOrthogonalRunsLoop(collapseRasterStairs(base))
    const detailed = light.length >= 4 ? light : base
    if (detailed.length > 120) {
      const soft = softenContourForEditing(detailed, 96)
      if (accept(soft, true)) return soft
    }
    if (detailed.length >= 4) return detailed
  }

  // Коридоры средней плотности / сложный контур.
  const maxVerts = fillRatio < 0.35 ? 96 : fillRatio < 0.55 ? 48 : 28
  const soft = softenContourForEditing(base, maxVerts)
  if (accept(soft, fillRatio < 0.4)) return soft
  if (accept(base, fillRatio < 0.4)) return base
  if (base.length >= 4) return base
  return fallbackTrace()
}

/**
 * Отсекает «фоновые» заливки: разлив на пол-чертежа.
 * Компактные оливковые участки (~десятки тысяч px) — валидны; раньше chroma<72 && count≥40k
 * резал их как spill и пользователь видел «зона слишком большая».
 */
export function isOversizedFillSpill(
  count: number,
  w: number,
  h: number,
  bw: number,
  bh: number,
  sr: number,
  sg: number,
  sb: number,
  fillRatio: number,
): boolean {
  const img = Math.max(1, w * h)
  const chroma = fillChroma(sr, sg, sb)
  // Яркие ACI-заливки (зелёный/голубой/…) — реальные участки; не режем как «spill фона».
  const chromaticLot =
    isGreenFillFamily(sr, sg, sb) ||
    isBlueCyanFillFamily(sr, sg, sb) ||
    isMagentaFamily(sr, sg, sb) ||
    isYellowFillFamily(sr, sg, sb)
  if (chromaticLot) {
    if (count >= img * 0.2 && count >= 400_000) return true
    if (bw >= w * 0.85 && bh >= h * 0.85 && count >= 300_000) return true
    return false
  }

  // Тусклые (олива/серый): пользователь меряет оливковые участки — разрешаем.
  // Режем только заливку почти на весь кадр (unit-тест / явный фон).
  if (chroma < 72) {
    if (count >= img * 0.85 && count >= 40_000) return true
    if (count >= img * 0.12 && count >= 200_000) return true
    return false
  }
  if (chroma < 100) {
    if (count >= img * 0.12 && count >= 200_000) return true
    if (count >= 120_000 && bw >= w * 0.55 && bh >= h * 0.55 && fillRatio < 0.1) return true
    return false
  }
  if (count >= 200_000 && count >= img * 0.08) return true
  if (w >= 800 && h >= 800 && bw >= w * 0.55 && bh >= h * 0.55 && count >= 80_000) {
    return true
  }
  if (fillRatio < 0.14 && count >= 200_000) return true
  return false
}

function readImageData(
  img: CanvasImageSource,
  sw: number,
  sh: number,
  sx = 0,
  sy = 0,
  sWidth?: number,
  sHeight?: number,
): ImageData | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    if (sWidth != null && sHeight != null) {
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sw, sh)
    } else {
      ctx.drawImage(img, 0, 0, sw, sh)
    }
    return ctx.getImageData(0, 0, sw, sh)
  } catch {
    // CORS / tainted canvas — без пикселей flood fill невозможен.
    return null
  }
}

/** Масштабирует crop-маску в координаты полного PNG (nearest-neighbor). */
export function scaleRegionMaskOverlay(
  mask: RegionMaskOverlay,
  offsetX: number,
  offsetY: number,
  scale: number,
): RegionMaskOverlay | undefined {
  if (scale === 1) {
    return {
      ...mask,
      minX: offsetX + mask.minX,
      minY: offsetY + mask.minY,
    }
  }
  const inv = 1 / scale
  const { bitW: srcBitW, bitH: srcBitH } = maskOverlayBitSize(mask)
  const width = Math.max(1, Math.round(mask.width * inv))
  const height = Math.max(1, Math.round(mask.height * inv))
  const bitW = Math.max(1, Math.round(srcBitW * inv))
  const bitH = Math.max(1, Math.round(srcBitH * inv))
  if (bitW * bitH > 2_500_000) return undefined
  const bits = new Uint8Array(bitW * bitH)
  for (let y = 0; y < bitH; y++) {
    const sy = Math.min(srcBitH - 1, Math.floor((y * srcBitH) / bitH))
    const srcRow = sy * srcBitW
    const dstRow = y * bitW
    for (let x = 0; x < bitW; x++) {
      const sx = Math.min(srcBitW - 1, Math.floor((x * srcBitW) / bitW))
      bits[dstRow + x] = mask.bits[srcRow + sx]!
    }
  }
  const out: RegionMaskOverlay = {
    minX: offsetX + mask.minX * inv,
    minY: offsetY + mask.minY * inv,
    width,
    height,
    bits,
  }
  if (bitW !== width || bitH !== height) {
    out.bitW = bitW
    out.bitH = bitH
  }
  return out
}

function mapRegionToFull(
  region: PngPickedRegion,
  offsetX: number,
  offsetY: number,
  scale: number,
): PngPickedRegion {
  const inv = 1 / scale
  const mapPt = (p: Point2D) => ({ x: offsetX + p.x * inv, y: offsetY + p.y * inv })
  const pixels = region.pixels.map(mapPt)
  const holes = region.holes.map((hole) => hole.map(mapPt))
  // Только flood-маска (возможно upsample). НЕ rasterizeOutline — иначе клин.
  const maskOverlay = region.maskOverlay
    ? scaleRegionMaskOverlay(region.maskOverlay, offsetX, offsetY, scale)
    : undefined
  return {
    pixels,
    holes,
    area: region.area,
    perimeter: region.perimeter,
    pixelCount: region.pixelCount,
    maskBBox: region.maskBBox
      ? {
          minX: offsetX + region.maskBBox.minX * inv,
          minY: offsetY + region.maskBBox.minY * inv,
          maxX: offsetX + region.maskBBox.maxX * inv,
          maxY: offsetY + region.maskBBox.maxY * inv,
        }
      : undefined,
    maskOverlay,
  }
}

/**
 * 1) Локальное окно → расширяем, пока заливка не перестанет упираться в край.
 * 2) Не возвращаем обрубок; полный план — только если меньшие окна не закрыли зону.
 */
export function pickRegionAtScreenFromImage(
  img: HTMLImageElement,
  view: RasterViewState,
  mapping: PngWorldMapping,
  screenX: number,
  screenY: number,
): PngPickedRegion | null {
  const full = rasterScreenToImagePixel(view, screenX, screenY)
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight
  if (imgW < 8 || imgH < 8) return null

  const ppu = mapping.pixelsPerUnit > 0 ? mapping.pixelsPerUnit : 1
  const pickOpts = {
    tolerance: 16,
    edgeTol: 9,
    minPixels: 3,
    seedSearchRadius: 14,
  }

  const MAX_FULLRES_PIXELS = 52_000_000
  const MAX_WINDOW_PIXELS = 52_000_000

  const windowIsFullImage = (x0: number, y0: number, x1: number, y1: number) =>
    x0 <= 0 && y0 <= 0 && x1 >= imgW && y1 >= imgH

  const tryWindow = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { region: PngPickedRegion; complete: boolean } | null => {
    const w = x1 - x0
    const h = y1 - y0
    if (w < 4 || h < 4) return null
    if (w * h > MAX_WINDOW_PIXELS) return null
    const data = readImageData(img, w, h, x0, y0, w, h)
    if (!data) return null
    const region = pickRegionFromImageData(data, full.x - x0, full.y - y0, ppu, pickOpts)
    if (!region) return null
    const touches = Boolean(lastPickDebug.touchesBorder)
    const complete = !touches || windowIsFullImage(x0, y0, x1, y1)
    return { region: mapRegionToFull(region, x0, y0, 1), complete }
  }

  // Постепенно расширяем окно вокруг клика (крупные голубые лужи иначе incomplete → null).
  let radius = Math.min(4200, 720 + Math.round(view.scale * 480))
  const maxRadius = Math.max(imgW, imgH)
  let lastIncomplete: PngPickedRegion | null = null
  for (let step = 0; step < 8; step++) {
    const x0 = Math.max(0, Math.floor(full.x) - radius)
    const y0 = Math.max(0, Math.floor(full.y) - radius)
    const x1 = Math.min(imgW, Math.ceil(full.x) + radius)
    const y1 = Math.min(imgH, Math.ceil(full.y) + radius)
    const hit = tryWindow(x0, y0, x1, y1)
    if (hit?.complete) return hit.region
    if (hit?.region) lastIncomplete = hit.region
    if (windowIsFullImage(x0, y0, x1, y1)) break
    radius = Math.min(maxRadius, Math.ceil(radius * 1.65) + 200)
  }

  if (imgW * imgH <= MAX_FULLRES_PIXELS) {
    const whole = tryWindow(0, 0, imgW, imgH)
    if (whole) return whole.region
  }

  // Coarse fallback для сверхкрупных PNG
  const coarseMax = 12288
  const coarseScale = Math.min(1, coarseMax / Math.max(imgW, imgH))
  const cw = Math.max(1, Math.round(imgW * coarseScale))
  const ch = Math.max(1, Math.round(imgH * coarseScale))
  const coarseData = readImageData(img, cw, ch)
  if (!coarseData) {
    // Лучше крупная (возможно обрезанная) зона, чем «не удалось» на видимом цвете.
    return lastIncomplete
  }

  const coarse = pickRegionFromImageData(
    coarseData,
    full.x * coarseScale,
    full.y * coarseScale,
    ppu * coarseScale,
    pickOpts,
  )
  if (!coarse) return lastIncomplete

  const bbox = lastPickDebug.bbox as
    | { minX: number; minY: number; maxX: number; maxY: number }
    | undefined
  if (!bbox) return mapRegionToFull(coarse, 0, 0, coarseScale)

  const pad = Math.max(24, Math.round(48 / Math.max(coarseScale, 0.05)))
  const x0 = Math.max(0, Math.floor(bbox.minX / coarseScale) - pad)
  const y0 = Math.max(0, Math.floor(bbox.minY / coarseScale) - pad)
  const x1 = Math.min(imgW, Math.ceil((bbox.maxX + 1) / coarseScale) + pad)
  const y1 = Math.min(imgH, Math.ceil((bbox.maxY + 1) / coarseScale) + pad)
  const cropW = x1 - x0
  const cropH = y1 - y0

  if (cropW * cropH > 18_000_000) {
    return mapRegionToFull(coarse, 0, 0, coarseScale)
  }

  let fineScale = 1
  if (cropW * cropH > 12_000_000) {
    fineScale = Math.sqrt(12_000_000 / (cropW * cropH))
  }
  const fw = Math.max(1, Math.round(cropW * fineScale))
  const fh = Math.max(1, Math.round(cropH * fineScale))
  const fineData = readImageData(img, fw, fh, x0, y0, cropW, cropH)
  if (!fineData) return mapRegionToFull(coarse, 0, 0, coarseScale)

  const fine = pickRegionFromImageData(
    fineData,
    (full.x - x0) * fineScale,
    (full.y - y0) * fineScale,
    ppu * fineScale,
    pickOpts,
  )
  if (!fine) return mapRegionToFull(coarse, 0, 0, coarseScale)
  return mapRegionToFull(fine, x0, y0, fineScale)
}

/**
 * Выбор участка на растровом плане: только flood fill по PNG (то, что видит пользователь).
 * LibreDWG HATCH на «Заливках КДО» даёт чужие/огромные зоны и ложный тост «слишком большая» —
 * на растре hatch-fallback отключён.
 */
export function pickPlanRegionAtScreen(
  img: HTMLImageElement,
  view: RasterViewState,
  mapping: PngWorldMapping,
  screenX: number,
  screenY: number,
  opts?: {
    dxfDoc?: DxfDocument | null
  },
): PngPickedRegion | null {
  void opts
  const png = pickRegionAtScreenFromImage(img, view, mapping, screenX, screenY)
  if (png && png.pixels.length >= 3) {
    lastPickDebug = { ...lastPickDebug, source: 'png' }
    return png
  }
  return null
}
