import type { DxfDocument, DxfEntity, Point2D } from '@cadview/core'
import { polygonArea, polygonPerimeter } from './dwgMeasureFormat'
import {
  imagePixelToWorld,
  rasterScreenToImagePixel,
  rasterWorldToScreen,
  worldToImagePixel,
  type PngWorldMapping,
  type RasterViewState,
} from './dwgRasterMeasure'

const SNAP_SCREEN_PX = 10

export type DxfSnapSegment = { a: Point2D; b: Point2D }

export type PlanClickSnapOpts = {
  /** Предыдущая точка контура — удерживает горизонталь/вертикаль (обычно с Shift). */
  previousPixel?: Point2D
  orthoSnap?: boolean
  /** Привязка к линиям/вершинам DWG; по умолчанию выкл. — точка ровно под курсором. */
  snapToGeometry?: boolean
  snapSegments?: readonly DxfSnapSegment[]
}

function pushVertex(out: Point2D[], p: Point2D | undefined | null) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return
  out.push({ x: p.x, y: p.y })
}

/** Отрезки DWG — для привязки клика к линиям, не только к вершинам. */
export function collectDxfSnapSegments(doc: DxfDocument): DxfSnapSegment[] {
  const out: DxfSnapSegment[] = []
  for (const entity of doc.entities) {
    if (entity.visible === false) continue
    sampleEntitySnapSegments(entity, out)
  }
  return out
}

function sampleEntitySnapSegments(entity: DxfEntity, out: DxfSnapSegment[]) {
  switch (entity.type) {
    case 'LINE':
      pushSegment(out, entity.start, entity.end)
      break
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = entity.vertices
      for (let i = 1; i < verts.length; i++) pushSegment(out, verts[i - 1], verts[i])
      if (entity.closed && verts.length > 2) pushSegment(out, verts[verts.length - 1], verts[0])
      break
    }
    case 'HATCH':
      for (const path of entity.boundaryPaths) {
        if (path.vertices?.length) {
          const verts = path.vertices
          for (let i = 1; i < verts.length; i++) pushSegment(out, verts[i - 1], verts[i])
          if (path.isClosed && verts.length > 2) pushSegment(out, verts[verts.length - 1], verts[0])
        }
        for (const edge of path.edges ?? []) {
          if (edge.type === 'line') pushSegment(out, edge.start, edge.end)
        }
      }
      break
    default:
      break
  }
}

function pushSegment(out: DxfSnapSegment[], a?: Point2D, b?: Point2D) {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return
  out.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } })
}

/** Вторую и далее точки — по горизонтали/вертикали от предыдущей (чертёжные участки). */
export function orthoSnapPlanPixel(curr: Point2D, prev: Point2D): Point2D {
  const dx = Math.abs(curr.x - prev.x)
  const dy = Math.abs(curr.y - prev.y)
  if (dx < 0.35 && dy < 0.35) return curr
  const ratio = 0.62
  if (dx > dy * ratio) return { x: curr.x, y: prev.y }
  if (dy > dx * ratio) return { x: prev.x, y: curr.y }
  return curr
}

export function projectScreenToSegment(
  sx: number,
  sy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; dist: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) {
    const dist = Math.hypot(sx - ax, sy - ay)
    return { x: ax, y: ay, dist, t: 0 }
  }
  let t = ((sx - ax) * dx + (sy - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const x = ax + t * dx
  const y = ay + t * dy
  return { x, y, dist: Math.hypot(sx - x, sy - y), t }
}

export type EdgeInsertHit = {
  edgeIndex: number
  insertIndex: number
  point: Point2D
  screenDist: number
}

/** Ближайшее ребро контура под курсором — для вставки новой вершины. */
export function findClosestEdgeInsertScreen(
  outline: readonly Point2D[],
  sx: number,
  sy: number,
  toScreen: (p: Point2D) => [number, number],
  maxDistPx = 14,
  closed = true,
): EdgeInsertHit | null {
  if (outline.length < 2) return null
  const n = outline.length
  const edgeCount = closed ? n : n - 1
  let best: EdgeInsertHit | null = null

  for (let i = 0; i < edgeCount; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % n]!
    const [ax, ay] = toScreen(a)
    const [bx, by] = toScreen(b)
    const proj = projectScreenToSegment(sx, sy, ax, ay, bx, by)
    if (proj.dist > maxDistPx) continue
    const point = {
      x: a.x + proj.t * (b.x - a.x),
      y: a.y + proj.t * (b.y - a.y),
    }
    const insertIndex = i + 1
    if (!best || proj.dist < best.screenDist) {
      best = { edgeIndex: i, insertIndex, point, screenDist: proj.dist }
    }
  }

  return best
}

/** Вершины и концы отрезков — для привязки клика к геометрии DWG. */
export function collectDxfSnapPoints(doc: DxfDocument): Point2D[] {
  const out: Point2D[] = []
  for (const entity of doc.entities) {
    if (entity.visible === false) continue
    sampleEntitySnapPoints(entity, out)
  }
  return out
}

function sampleEntitySnapPoints(entity: DxfEntity, out: Point2D[]) {
  switch (entity.type) {
    case 'LINE':
      pushVertex(out, entity.start)
      pushVertex(out, entity.end)
      break
    case 'LWPOLYLINE':
    case 'POLYLINE':
      for (const v of entity.vertices) pushVertex(out, v)
      break
    case 'HATCH':
      for (const path of entity.boundaryPaths) {
        if (path.vertices?.length) {
          for (const v of path.vertices) pushVertex(out, v)
        }
        for (const edge of path.edges ?? []) {
          if (edge.type === 'line') {
            pushVertex(out, edge.start)
            pushVertex(out, edge.end)
          }
          if (edge.type === 'arc' || edge.type === 'ellipse') {
            pushVertex(out, edge.center)
          }
        }
      }
      break
    case 'CIRCLE':
    case 'ARC':
    case 'ELLIPSE':
      pushVertex(out, entity.center)
      break
    case 'POINT':
      pushVertex(out, entity.position)
      break
    case 'SPLINE':
      for (const p of entity.controlPoints) pushVertex(out, p)
      break
    case 'INSERT':
      pushVertex(out, entity.insertionPoint)
      break
    case 'TEXT':
    case 'MTEXT':
      pushVertex(out, entity.insertionPoint)
      break
    default:
      break
  }
}

/** Пиксель PNG → экран stage (CSS px). */
export function imagePixelToScreen(
  state: RasterViewState,
  px: number,
  py: number,
): [number, number] {
  const sx = (px - state.imgW / 2) * state.scale + state.stageW / 2 + state.x
  const sy = (py - state.imgH / 2) * state.scale + state.stageH / 2 + state.y
  return [sx, sy]
}

export function pointerOnStage(stage: HTMLElement, clientX: number, clientY: number): Point2D {
  const rect = stage.getBoundingClientRect()
  const w = stage.clientWidth
  const h = stage.clientHeight
  if (rect.width < 1 || rect.height < 1 || w < 1 || h < 1) {
    return { x: 0, y: 0 }
  }
  // Visual → layout: иначе на iOS (visualViewport / safe-area) якорь зума плывёт.
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  }
}

/** Клик на stage → пиксель PNG с привязкой к геометрии DWG и ортогонали от prev. */
export function planClickToImagePixel(
  sx: number,
  sy: number,
  view: RasterViewState,
  mapping: PngWorldMapping,
  snapWorldPoints: readonly Point2D[],
  opts?: PlanClickSnapOpts,
): Point2D {
  const raw = rasterScreenToImagePixel(view, sx, sy)
  let best = raw
  let snapped = false

  if (opts?.snapToGeometry) {
    let bestScreenDist = SNAP_SCREEN_PX

    for (const world of snapWorldPoints) {
      const [wx, wy] = rasterWorldToScreen(view, mapping, world.x, world.y)
      const d = Math.hypot(wx - sx, wy - sy)
      if (d <= bestScreenDist) {
        bestScreenDist = d
        best = worldToImagePixel(mapping, world.x, world.y)
        snapped = true
      }
    }

    for (const seg of opts?.snapSegments ?? []) {
      const [ax, ay] = rasterWorldToScreen(view, mapping, seg.a.x, seg.a.y)
      const [bx, by] = rasterWorldToScreen(view, mapping, seg.b.x, seg.b.y)
      const proj = projectScreenToSegment(sx, sy, ax, ay, bx, by)
      if (proj.dist <= bestScreenDist) {
        bestScreenDist = proj.dist
        best = rasterScreenToImagePixel(view, proj.x, proj.y)
        snapped = true
      }
    }
  }

  if (!snapped) {
    best = raw
  }

  if (opts?.orthoSnap && opts?.previousPixel) {
    best = orthoSnapPlanPixel(best, opts.previousPixel)
  }

  return best
}

export function planPixelPointsToScreenPolyline(
  state: RasterViewState,
  pixels: readonly Point2D[],
): string {
  return pixels
    .map((p) => {
      const [sx, sy] = imagePixelToScreen(state, p.x, p.y)
      return `${sx},${sy}`
    })
    .join(' ')
}

export function planPixelDistance(p1: Point2D, p2: Point2D, pixelsPerUnit: number): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y) / pixelsPerUnit
}

export function planPixelArea(pixels: readonly Point2D[], pixelsPerUnit: number): number {
  if (pixels.length < 3) return 0
  return polygonArea(pixels) / (pixelsPerUnit * pixelsPerUnit)
}

export function planPixelPerimeter(
  pixels: readonly Point2D[],
  pixelsPerUnit: number,
  closed: boolean,
): number {
  return polygonPerimeter(pixels, closed) / pixelsPerUnit
}

export function planPixelToWorld(mapping: PngWorldMapping, pixel: Point2D): Point2D {
  return imagePixelToWorld(mapping, pixel.x, pixel.y)
}

/** Прореживает штрих, сохраняя начало/конец — для длинных рукописных пометок. */
export function simplifyPolylinePoints(
  points: readonly Point2D[],
  minDist: number,
  maxPoints = 480,
): Point2D[] {
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }))
  const dist = Math.max(0.01, minDist)
  const out: Point2D[] = [{ x: points[0]!.x, y: points[0]!.y }]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const last = out[out.length - 1]!
    if (Math.hypot(p.x - last.x, p.y - last.y) >= dist) {
      out.push({ x: p.x, y: p.y })
    }
  }
  const lastPt = points[points.length - 1]!
  const tail = out[out.length - 1]!
  if (Math.hypot(lastPt.x - tail.x, lastPt.y - tail.y) > 1e-6) {
    out.push({ x: lastPt.x, y: lastPt.y })
  }
  if (out.length <= maxPoints) return out
  const step = (out.length - 1) / (maxPoints - 1)
  const capped: Point2D[] = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(out.length - 1, Math.round(i * step))
    capped.push(out[idx]!)
  }
  return capped
}
