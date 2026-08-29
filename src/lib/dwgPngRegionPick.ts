import type { Point2D } from '@cadview/core'
import { polygonPerimeter } from './dwgMeasureFormat'
import { rasterScreenToImagePixel, type PngWorldMapping, type RasterViewState } from './dwgRasterMeasure'

const BG_WHITE = { r: 255, g: 255, b: 255 }
const BG_DARK = { r: 43, g: 43, b: 43 }

export type PngPickedRegion = {
  pixels: Point2D[]
  holes: Point2D[][]
  area: number
  perimeter: number
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
  if (colorDistCheb(r, g, b, sr, sg, sb) > tol) return false
  // Евклид уже chebyshev — режет «похожие» соседние палитры
  if (colorDistSq(r, g, b, sr, sg, sb) > tol * tol * 1.55) return false
  return true
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
 * Семя: медиана цвета в окне вокруг касания (устойчивее к антиалиасу),
 * радиус поиска небольшой — не уходим на чужой участок.
 */
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

  const sampleMedianAt = (cx: number, cy: number) => {
    const rs: number[] = []
    const gs: number[] = []
    const bs: number[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (isBackgroundSeed(r, g, b) || isInkBarrier(r, g, b)) continue
        rs.push(r)
        gs.push(g)
        bs.push(b)
      }
    }
    if (rs.length === 0) return null
    rs.sort((a, b) => a - b)
    gs.sort((a, b) => a - b)
    bs.sort((a, b) => a - b)
    const mid = (rs.length / 2) | 0
    return { x: cx, y: cy, r: rs[mid], g: gs[mid], b: bs[mid] }
  }

  const direct = sampleMedianAt(clampX, clampY)
  if (direct) return direct

  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      const dxEdge = rad - Math.abs(dy)
      for (const dx of dxEdge === 0 ? [0] : [-dxEdge, dxEdge]) {
        const hit = sampleMedianAt(clampX + dx, clampY + dy)
        if (hit) return hit
      }
    }
  }
  return null
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

/** Углы контура для отображения точек (не все пиксели границы). */
export function cornerVertices(points: Point2D[], maxCorners = 32): Point2D[] {
  if (points.length <= maxCorners) return points
  const eps = Math.max(0.4, Math.sqrt(points.length) * 0.04)
  let simplified = simplifyContour(points, eps)
  if (simplified.length < 3) simplified = points
  if (simplified.length <= maxCorners) return simplified
  const step = Math.ceil(simplified.length / maxCorners)
  const out: Point2D[] = []
  for (let i = 0; i < simplified.length; i += step) out.push(simplified[i])
  if (out.length >= 2) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) out.pop()
  }
  return out.length >= 3 ? out : simplified.slice(0, maxCorners)
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

/** Только характерные «колодцы» (~80–900 px), крошечные пятна не режем. */
function isSmallCircleIsland(count: number, bw: number, bh: number): boolean {
  if (count < 80 || count > 900) return false
  const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh))
  if (aspect > 1.25) return false
  const r = Math.min(bw, bh) / 2
  if (r < 4) return false
  const circleArea = Math.PI * r * r
  const ratio = count / circleArea
  return ratio >= 0.82 && ratio <= 1.18
}

function floodFillMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  sr: number,
  sg: number,
  sb: number,
  tol: number,
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
    const cr = data[i]
    const cg = data[i + 1]
    const cb = data[i + 2]
    if (!colorsMatchFill(cr, cg, cb, sr, sg, sb, tol)) continue

    mask[p] = 1
    count += 1
    sumX += x
    sumY += y
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y

    // 4-соседи всегда; диагональ — только если почти тот же цвет (узкие «лесенки»)
    const nbs: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    const nearSeed = colorDistCheb(cr, cg, cb, sr, sg, sb) <= Math.max(3, (tol / 4) | 0)
    if (nearSeed) {
      nbs.push([x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1])
    }
    for (const [nx, ny] of nbs) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (seen[ni]) continue
      const j = ni * 4
      const nr = data[j]
      const ng = data[j + 1]
      const nb = data[j + 2]
      if (!colorsMatchFill(nr, ng, nb, sr, sg, sb, tol)) {
        seen[ni] = 1
        continue
      }
      if (crossesFillEdge(cr, cg, cb, nr, ng, nb, edgeTol)) continue
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
  const tol = opts?.tolerance ?? 16
  const edgeTol0 = opts?.edgeTol ?? 9
  const maxPixels = opts?.maxPixels ?? Math.min(3_500_000, w * h)
  const minPixels = opts?.minPixels ?? 3

  let filled = floodFillMask(data, w, h, sx, sy, sr, sg, sb, tol, edgeTol0, maxPixels)
  // Узкие/шумные пятна: один мягкий повтор без ослабления цвета семени
  if (filled.count < minPixels) {
    filled = floodFillMask(data, w, h, sx, sy, sr, sg, sb, tol, Math.min(14, edgeTol0 + 5), maxPixels)
  }

  const { mask, count, minX, minY, maxX, maxY } = filled

  if (count < minPixels) {
    lastPickDebug = { reason: 'tiny', count }
    return null
  }

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  if (bw < 1 || bh < 1) {
    lastPickDebug = { reason: 'nobbox', count }
    return null
  }
  if (isSmallCircleIsland(count, bw, bh)) {
    lastPickDebug = { reason: 'circle-mask', count, bw, bh }
    return null
  }

  let contour = traceMaskContour(mask, w, h)
  const eps =
    opts?.simplifyEps ??
    Math.max(0.35, Math.min(1.35, Math.sqrt(Math.max(count, 1)) * 0.028))
  if (contour && contour.length >= 3) {
    contour = simplifyContour(contour, eps)
    // Для крошечных — не убиваем форму лишним упрощением
    if (count < 40 && contour.length < 4) {
      const raw = traceMaskContour(mask, w, h)
      if (raw && raw.length >= 4) contour = simplifyContour(raw, 0.25)
    }
  } else {
    contour = [
      { x: minX, y: minY },
      { x: maxX + 1, y: minY },
      { x: maxX + 1, y: maxY + 1 },
      { x: minX, y: maxY + 1 },
    ]
  }

  const area = count / (pixelsPerUnit * pixelsPerUnit)
  const perimeter = polygonPerimeter(contour, true) / pixelsPerUnit
  lastPickDebug = {
    reason: 'ok',
    count,
    area,
    verts: contour.length,
    bw,
    bh,
    touchesBorder: regionTouchesBorder(minX, minY, maxX, maxY, w, h),
    bbox: { minX, minY, maxX, maxY },
  }
  return { pixels: contour, holes: [], area, perimeter }
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
}

function mapRegionToFull(
  region: PngPickedRegion,
  offsetX: number,
  offsetY: number,
  scale: number,
): PngPickedRegion {
  const inv = 1 / scale
  return {
    pixels: region.pixels.map((p) => ({ x: offsetX + p.x * inv, y: offsetY + p.y * inv })),
    holes: [],
    area: region.area,
    perimeter: region.perimeter,
  }
}

/**
 * 1) Локальное окно в полном разрешении — мелкие участки и точный цвет.
 * 2) Если заливка упёрлась в край окна — расширяем / грубый проход по плану.
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

  const ppu = mapping.pixelsPerUnit
  const strict = {
    tolerance: 16,
    edgeTol: 9,
    minPixels: 3,
    seedSearchRadius: 8,
  }

  // —— Local full-res window (мелкие участки + точный цвет, без даунскейла) ——
  const localR = 720
  let lx0 = Math.max(0, Math.floor(full.x) - localR)
  let ly0 = Math.max(0, Math.floor(full.y) - localR)
  let lx1 = Math.min(imgW, Math.ceil(full.x) + localR)
  let ly1 = Math.min(imgH, Math.ceil(full.y) + localR)
  let lw = lx1 - lx0
  let lh = ly1 - ly0
  let spilledPastWindow = false

  const localData = readImageData(img, lw, lh, lx0, ly0, lw, lh)
  if (localData) {
    const local = pickRegionFromImageData(localData, full.x - lx0, full.y - ly0, ppu, strict)
    if (local && !(lastPickDebug.touchesBorder as boolean | undefined)) {
      return mapRegionToFull(local, lx0, ly0, 1)
    }
    // Упёрлись в край — расширим окно один раз
    if (local && lastPickDebug.touchesBorder) {
      spilledPastWindow = true
      const grow = 1600
      lx0 = Math.max(0, Math.floor(full.x) - grow)
      ly0 = Math.max(0, Math.floor(full.y) - grow)
      lx1 = Math.min(imgW, Math.ceil(full.x) + grow)
      ly1 = Math.min(imgH, Math.ceil(full.y) + grow)
      lw = lx1 - lx0
      lh = ly1 - ly0
      if (lw * lh <= 9_000_000) {
        const bigLocal = readImageData(img, lw, lh, lx0, ly0, lw, lh)
        if (bigLocal) {
          const again = pickRegionFromImageData(bigLocal, full.x - lx0, full.y - ly0, ppu, strict)
          if (again && !(lastPickDebug.touchesBorder as boolean | undefined)) {
            return mapRegionToFull(again, lx0, ly0, 1)
          }
          if (again) {
            // огромный регион — возвращаем из расширенного окна
            return mapRegionToFull(again, lx0, ly0, 1)
          }
        }
      }
    } else if (!local) {
      // Мелкий/фон/отсев — не идём на грубый проход (там сольются похожие цвета)
      return null
    }
  }

  // —— Coarse только если заливка реально вышла за локальное окно ——
  if (!spilledPastWindow) return null

  const coarseMax = 4096
  const coarseScale = Math.min(1, coarseMax / Math.max(imgW, imgH))
  const cw = Math.max(1, Math.round(imgW * coarseScale))
  const ch = Math.max(1, Math.round(imgH * coarseScale))
  const coarseData = readImageData(img, cw, ch)
  if (!coarseData) return null

  const coarse = pickRegionFromImageData(
    coarseData,
    full.x * coarseScale,
    full.y * coarseScale,
    ppu * coarseScale,
    { tolerance: 15, edgeTol: 8, minPixels: 3, seedSearchRadius: 8 },
  )
  if (!coarse) return null

  const bbox = lastPickDebug.bbox as
    | { minX: number; minY: number; maxX: number; maxY: number }
    | undefined
  if (!bbox) return mapRegionToFull(coarse, 0, 0, coarseScale)

  const pad = Math.max(16, Math.round(32 / Math.max(coarseScale, 0.05)))
  const x0 = Math.max(0, Math.floor(bbox.minX / coarseScale) - pad)
  const y0 = Math.max(0, Math.floor(bbox.minY / coarseScale) - pad)
  const x1 = Math.min(imgW, Math.ceil((bbox.maxX + 1) / coarseScale) + pad)
  const y1 = Math.min(imgH, Math.ceil((bbox.maxY + 1) / coarseScale) + pad)
  const cropW = x1 - x0
  const cropH = y1 - y0

  if (cropW * cropH > 10_000_000) {
    return mapRegionToFull(coarse, 0, 0, coarseScale)
  }

  let fineScale = 1
  if (cropW * cropH > 8_000_000) {
    fineScale = Math.sqrt(8_000_000 / (cropW * cropH))
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
    { tolerance: 15, edgeTol: 8, minPixels: 3, seedSearchRadius: 8 },
  )
  if (!fine) return mapRegionToFull(coarse, 0, 0, coarseScale)
  return mapRegionToFull(fine, x0, y0, fineScale)
}
