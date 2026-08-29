import type { Point2D, ViewTransform } from '@cadview/core'
import { screenToWorld, worldToScreen } from '@cadview/core'
import { drawingLengthToMeters } from './dwgDrawingUnits'

export type DwgViewerTool = 'length' | 'area' | 'region'

export type LengthMeasure = {
  distance: number
  angle: number
  deltaX: number
  deltaY: number
  points: [Point2D, Point2D]
}

export function measureBetween(a: Point2D, b: Point2D): LengthMeasure {
  const deltaX = b.x - a.x
  const deltaY = b.y - a.y
  const distance = Math.hypot(deltaX, deltaY)
  const angle = (((Math.atan2(deltaY, deltaX) * 180) / Math.PI) + 360) % 360
  return { distance, angle, deltaX, deltaY, points: [a, b] }
}

export function polygonArea(points: readonly Point2D[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(sum) / 2
}

export function polygonPerimeter(points: readonly Point2D[], closed = false): number {
  if (points.length < 2) return 0
  let sum = 0
  const lastIndex = closed ? points.length : points.length - 1
  for (let i = 0; i < lastIndex; i++) {
    const j = closed ? (i + 1) % points.length : i + 1
    const dx = points[j].x - points[i].x
    const dy = points[j].y - points[i].y
    sum += Math.hypot(dx, dy)
  }
  return sum
}

export type PerimeterEdge = {
  side: number
  lengthM: number
  /** Прямая стена или дуга/кривая (длина — по пути). */
  shape: 'line' | 'arc'
  mid: Point2D
  a: Point2D
  b: Point2D
  points: Point2D[]
}

export type PerimeterRing = {
  kind: 'outer' | 'hole'
  holeIndex?: number
  edges: PerimeterEdge[]
}

/** Длины сторон замкнутого контура в единицах чертежа (или пикселях для plan). */
export function closedPolygonEdgeLengths(points: readonly Point2D[]): number[] {
  if (points.length < 2) return []
  const out: number[] = []
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    out.push(Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y))
  }
  return out
}

type ContourMeasureSide = {
  length: number
  shape: 'line' | 'arc'
  mid: Point2D
  a: Point2D
  b: Point2D
  /** Точки пути стороны (для подсветки линии/дуги на чертеже). */
  points: Point2D[]
}

function ringCentroid(points: readonly Point2D[]): Point2D {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  const n = points.length || 1
  return { x: x / n, y: y / n }
}

function turnAngleDeg(prev: Point2D, cur: Point2D, next: Point2D): number {
  const ax = cur.x - prev.x
  const ay = cur.y - prev.y
  const bx = next.x - cur.x
  const by = next.y - cur.y
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(bx, by)
  if (la < 1e-12 || lb < 1e-12) return 0
  const cross = ax * by - ay * bx
  const dot = ax * bx + ay * by
  return (Math.atan2(cross, dot) * 180) / Math.PI
}

function pathLength(points: readonly Point2D[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return sum
}

function pointAtPathFraction(points: readonly Point2D[], fraction: number): Point2D {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0] }
  const total = pathLength(points)
  if (total < 1e-12) return { ...points[0] }
  let remain = Math.max(0, Math.min(1, fraction)) * total
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (remain <= seg || i === points.length - 1) {
      const t = seg < 1e-12 ? 0 : remain / seg
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      }
    }
    remain -= seg
  }
  return { ...points[points.length - 1] }
}

function maxChordDeviation(points: readonly Point2D[]): number {
  if (points.length < 3) return 0
  const a = points[0]
  const b = points[points.length - 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let maxD = 0
  for (let i = 1; i < points.length - 1; i++) {
    const px = points[i].x
    const py = points[i].y
    const d =
      len2 < 1e-12
        ? Math.hypot(px - a.x, py - a.y)
        : Math.abs(dy * px - dx * py + b.x * a.y - b.y * a.x) / Math.sqrt(len2)
    if (d > maxD) maxD = d
  }
  return maxD
}

/**
 * Склеивает почти прямые отрезки контура в одну сторону;
 * кривую между углами — в одну «дугу» с длиной по пути.
 */
export function extractContourMeasureSides(
  points: readonly Point2D[],
  opts?: { cornerDeg?: number; arcChordRatio?: number },
): ContourMeasureSide[] {
  if (points.length < 2) return []
  let pts = points.slice()
  const last = pts[pts.length - 1]
  if (Math.hypot(pts[0].x - last.x, pts[0].y - last.y) < 1e-6) pts = pts.slice(0, -1)
  if (pts.length < 2) return []
  if (pts.length === 2) {
    const len = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    return [
      {
        length: len,
        shape: 'line',
        a: pts[0],
        b: pts[1],
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        points: [pts[0], pts[1]],
      },
    ]
  }

  const cornerDeg = opts?.cornerDeg ?? 28
  const arcChordRatio = opts?.arcChordRatio ?? 0.035
  const n = pts.length
  const isCorner = new Array<boolean>(n).fill(false)
  let cornerCount = 0
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    if (Math.abs(turnAngleDeg(prev, cur, next)) >= cornerDeg) {
      isCorner[i] = true
      cornerCount += 1
    }
  }

  // Если углов почти нет (сглаженный контур) — берём вершины с максимальным поворотом
  if (cornerCount < 3) {
    const scored = pts
      .map((_, i) => ({
        i,
        turn: Math.abs(
          turnAngleDeg(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]),
        ),
      }))
      .sort((a, b) => b.turn - a.turn)
    const keep = Math.min(n, Math.max(3, Math.min(12, Math.round(n / 4))))
    isCorner.fill(false)
    for (let k = 0; k < keep; k++) isCorner[scored[k].i] = true
    cornerCount = keep
  }

  const corners: number[] = []
  for (let i = 0; i < n; i++) if (isCorner[i]) corners.push(i)
  if (corners.length < 2) {
    const closed = [...pts, pts[0]]
    return [
      {
        length: polygonPerimeter(pts, true),
        shape: 'line',
        a: pts[0],
        b: pts[0],
        mid: ringCentroid(pts),
        points: closed,
      },
    ]
  }

  const sides: ContourMeasureSide[] = []
  for (let c = 0; c < corners.length; c++) {
    const start = corners[c]
    const end = corners[(c + 1) % corners.length]
    const chain: Point2D[] = [{ ...pts[start] }]
    let i = start
    while (i !== end) {
      i = (i + 1) % n
      chain.push({ ...pts[i] })
      if (chain.length > n + 2) break
    }
    if (chain.length < 2) continue
    const length = pathLength(chain)
    if (length < 1e-9) continue
    const chord = Math.hypot(chain[chain.length - 1].x - chain[0].x, chain[chain.length - 1].y - chain[0].y)
    const bend = maxChordDeviation(chain)
    const shape: 'line' | 'arc' =
      chord > 1e-9 && bend / chord >= arcChordRatio ? 'arc' : 'line'
    sides.push({
      length,
      shape,
      a: chain[0],
      b: chain[chain.length - 1],
      mid: pointAtPathFraction(chain, 0.5),
      points: chain,
    })
  }
  return sides
}

export function regionPerimeterRingsMeters(params: {
  outline: Point2D[]
  holes: Point2D[][]
  space: 'plan' | 'world'
  insUnits: number
  pixelsPerUnit: number
}): PerimeterRing[] {
  const { outline, holes, space, insUnits, pixelsPerUnit } = params
  if (outline.length < 2) return []
  const unitScale = space === 'plan' ? (pixelsPerUnit > 0 ? 1 / pixelsPerUnit : 0) : 1
  if (unitScale === 0) return []

  const toMeters = (drawingLen: number) => drawingLengthToMeters(drawingLen * unitScale, insUnits)
  const ringEdges = (points: Point2D[]): PerimeterEdge[] =>
    extractContourMeasureSides(points).map((side, index) => ({
      side: index + 1,
      lengthM: toMeters(side.length),
      shape: side.shape,
      mid: side.mid,
      a: side.a,
      b: side.b,
      points: side.points,
    }))

  const rings: PerimeterRing[] = [{ kind: 'outer', edges: ringEdges(outline) }]
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i]
    if (hole.length < 2) continue
    rings.push({ kind: 'hole', holeIndex: i + 1, edges: ringEdges(hole) })
  }
  return rings
}

export type RegionEdgeScreenLabel = {
  side: number
  lengthM: number
  shape: 'line' | 'arc'
  x: number
  y: number
  kind: 'outer' | 'hole'
  holeIndex?: number
  /** Экранная полилиния куска измерения (линия или дуга). */
  screenPoints: string
  endA: { x: number; y: number }
  endB: { x: number; y: number }
}

function edgeLabelScreenPoint(
  mid: Point2D,
  a: Point2D,
  b: Point2D,
  ringCentroidPoint: Point2D,
  toScreen: (p: Point2D) => [number, number],
  pushPx: number,
): { x: number; y: number; screenLen: number } {
  const [mx, my] = toScreen(mid)
  const [sx1, sy1] = toScreen(a)
  const [sx2, sy2] = toScreen(b)
  const [scx, scy] = toScreen(ringCentroidPoint)
  const screenLen = Math.hypot(sx2 - sx1, sy2 - sy1)
  let dx = mx - scx
  let dy = my - scy
  const d = Math.hypot(dx, dy)
  if (d > 1e-6) {
    dx = (dx / d) * pushPx
    dy = (dy / d) * pushPx
  } else {
    const ex = sx2 - sx1
    const ey = sy2 - sy1
    const el = Math.hypot(ex, ey) || 1
    dx = (-ey / el) * pushPx
    dy = (ex / el) * pushPx
  }
  return { x: mx + dx, y: my + dy, screenLen }
}

/** Подписи сторон контура в экранных координатах для overlay. */
export function buildRegionEdgeScreenLabels(params: {
  outline: Point2D[]
  holes: Point2D[][]
  rings: PerimeterRing[]
  toScreen: (p: Point2D) => [number, number]
  minScreenEdgePx?: number
  pushPx?: number
}): RegionEdgeScreenLabel[] {
  const {
    outline,
    holes,
    rings,
    toScreen,
    minScreenEdgePx = 18,
    pushPx = 0,
  } = params
  const out: RegionEdgeScreenLabel[] = []

  for (const ring of rings) {
    const points = ring.kind === 'outer' ? outline : holes[(ring.holeIndex ?? 1) - 1]
    if (!points || points.length < 2) continue
    const centroid = ringCentroid(points)
    for (const edge of ring.edges) {
      const pos = edgeLabelScreenPoint(edge.mid, edge.a, edge.b, centroid, toScreen, pushPx)
      if (pos.screenLen < minScreenEdgePx && edge.shape === 'line') continue
      const pathPts = edge.points.length >= 2 ? edge.points : [edge.a, edge.b]
      const screenPts = pathPts.map((p) => toScreen(p))
      const [eax, eay] = screenPts[0]
      const [ebx, eby] = screenPts[screenPts.length - 1]
      out.push({
        side: edge.side,
        lengthM: edge.lengthM,
        shape: edge.shape,
        x: pos.x,
        y: pos.y,
        kind: ring.kind,
        holeIndex: ring.holeIndex,
        screenPoints: screenPts.map(([sx, sy]) => `${sx},${sy}`).join(' '),
        endA: { x: eax, y: eay },
        endB: { x: ebx, y: eby },
      })
    }
  }
  return out
}

/** Чертёжные единицы — обычно метры на стройке. */
export function formatLinear(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `${(value / 1000).toFixed(2)} км`
  if (abs >= 1) return `${value.toFixed(2)} м`
  if (abs >= 0.01) return `${(value * 100).toFixed(1)} см`
  return `${(value * 1000).toFixed(0)} мм`
}

export function formatArea(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)} га`
  if (abs >= 1) return `${value.toFixed(2)} м²`
  return `${(value * 10_000).toFixed(0)} см²`
}

export function formatAngle(deg: number): string {
  return `${deg.toFixed(1)}°`
}

/** Экранные координаты в системе CadViewer (CSS-пиксели canvas). */
export function screenPointFromMouse(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point2D {
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

export function worldPointFromMouse(
  canvas: HTMLCanvasElement,
  vt: ViewTransform,
  clientX: number,
  clientY: number,
): Point2D {
  const sp = screenPointFromMouse(canvas, clientX, clientY)
  const [wx, wy] = screenToWorld(vt, sp.x, sp.y)
  return { x: wx, y: wy }
}

export function worldPointsToScreenPolyline(
  vt: ViewTransform,
  points: readonly Point2D[],
): string {
  return points
    .map((p) => {
      const [sx, sy] = worldToScreen(vt, p.x, p.y)
      return `${sx},${sy}`
    })
    .join(' ')
}

export function lengthMeasureSummary(m: LengthMeasure) {
  return {
    distance: formatLinear(m.distance),
    width: formatLinear(Math.abs(m.deltaX)),
    height: formatLinear(Math.abs(m.deltaY)),
    angle: formatAngle(m.angle),
  }
}
