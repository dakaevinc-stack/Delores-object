import type { DxfDocument, DxfEntity, DxfInsertEntity, Point2D } from '@cadview/core'
import { polygonPerimeter } from './dwgMeasureFormat'

const SAME_POINT_EPS = 1e-4
const MIN_REGION_AREA = 1e-8

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function samePoint(a: Point2D, b: Point2D): boolean {
  return dist(a, b) <= SAME_POINT_EPS
}

function signedArea(polygon: readonly Point2D[]): number {
  if (polygon.length < 3) return 0
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    sum += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y
  }
  return sum / 2
}

/** Луч внутрь/наружу — контур может быть CW или CCW. */
export function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const denom = yj - yi
    if (Math.abs(denom) < 1e-18) continue
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / denom + xi
    if (intersect) inside = !inside
  }
  return inside
}

function polygonContainsPolygon(outer: readonly Point2D[], inner: readonly Point2D[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false
  if (Math.abs(signedArea(inner)) >= Math.abs(signedArea(outer)) - 1e-9) return false
  let hits = 0
  const step = Math.max(1, Math.floor(inner.length / 8))
  for (let i = 0; i < inner.length; i += step) {
    if (pointInPolygon(inner[i], outer)) hits += 1
  }
  return hits >= Math.max(1, Math.ceil(inner.length / step / 2))
}

/** Дуга по bulge LWPOLYLINE: bulge = tan(θ/4). */
export function tessellateBulge(
  p1: Point2D,
  p2: Point2D,
  bulge: number,
  maxSeg = 24,
): Point2D[] {
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-8) return []
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return []
  const theta = 4 * Math.atan(bulge)
  const sinHalf = Math.sin(theta / 2)
  if (Math.abs(sinHalf) < 1e-12) return []
  const radius = Math.abs(chord / (2 * sinHalf))
  const midX = (p1.x + p2.x) / 2
  const midY = (p1.y + p2.y) / 2
  const distToCenter = radius * Math.cos(Math.abs(theta) / 2)
  const ux = dx / chord
  const uy = dy / chord
  const sign = bulge >= 0 ? 1 : -1
  const cx = midX - uy * distToCenter * sign
  const cy = midY + ux * distToCenter * sign
  const a0 = Math.atan2(p1.y - cy, p1.x - cx)
  let a1 = Math.atan2(p2.y - cy, p2.x - cx)
  if (bulge >= 0) {
    if (a1 <= a0) a1 += Math.PI * 2
  } else if (a1 >= a0) {
    a1 -= Math.PI * 2
  }
  const span = a1 - a0
  const steps = Math.max(3, Math.min(maxSeg, Math.ceil(Math.abs(span) / (Math.PI / 18))))
  const pts: Point2D[] = []
  for (let i = 1; i < steps; i++) {
    const a = a0 + (span * i) / steps
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
  }
  return pts
}

export function polylineWithBulgesToPolygon(
  vertices: ReadonlyArray<Point2D & { bulge?: number }>,
  closed: boolean,
  bulges?: readonly number[],
): Point2D[] | null {
  if (vertices.length < 2) return null
  const count = closed ? vertices.length : vertices.length - 1
  const pts: Point2D[] = []
  for (let i = 0; i < count; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    pts.push({ x: a.x, y: a.y })
    const bulge = Number.isFinite(a.bulge) ? Number(a.bulge) : Number(bulges?.[i] ?? 0)
    pts.push(...tessellateBulge(a, b, bulge))
  }
  if (!closed) {
    const last = vertices[vertices.length - 1]
    pts.push({ x: last.x, y: last.y })
  }
  if (pts.length >= 2 && samePoint(pts[0], pts[pts.length - 1])) pts.pop()
  return pts.length >= 3 ? pts : null
}

type ArcEdge = {
  type: 'arc'
  center: Point2D
  radius: number
  startAngle: number
  endAngle: number
  ccw?: boolean
}

type EllipseEdge = {
  type: 'ellipse'
  center: Point2D
  majorAxis: Point2D
  minorRatio: number
  startAngle: number
  endAngle: number
  ccw?: boolean
}

function sampleArcEdge(edge: ArcEdge, segments = 16): Point2D[] {
  const a0 = edge.startAngle
  let a1 = edge.endAngle
  if (edge.ccw === false) {
    if (a1 > a0) a1 -= Math.PI * 2
  } else if (a1 < a0) {
    a1 += Math.PI * 2
  }
  const span = a1 - a0
  const steps = Math.max(3, Math.min(segments, Math.ceil(Math.abs(span) / (Math.PI / 18))))
  const pts: Point2D[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = a0 + span * t
    pts.push({
      x: edge.center.x + edge.radius * Math.cos(a),
      y: edge.center.y + edge.radius * Math.sin(a),
    })
  }
  return pts
}

function sampleEllipseEdge(edge: EllipseEdge, segments = 24): Point2D[] {
  const majLen = Math.hypot(edge.majorAxis.x, edge.majorAxis.y)
  if (majLen < 1e-12) return []
  const ux = edge.majorAxis.x / majLen
  const uy = edge.majorAxis.y / majLen
  const minLen = majLen * edge.minorRatio
  const vx = -uy * minLen
  const vy = ux * minLen
  const mx = ux * majLen
  const my = uy * majLen
  const a0 = edge.startAngle
  let a1 = edge.endAngle
  if (edge.ccw === false) {
    if (a1 > a0) a1 -= Math.PI * 2
  } else if (a1 < a0) {
    a1 += Math.PI * 2
  }
  const span = a1 - a0
  const steps = Math.max(6, Math.min(segments, Math.ceil(Math.abs(span) / (Math.PI / 18))))
  const pts: Point2D[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (span * i) / steps
    pts.push({
      x: edge.center.x + mx * Math.cos(a) + vx * Math.sin(a),
      y: edge.center.y + my * Math.cos(a) + vy * Math.sin(a),
    })
  }
  return pts
}

type HatchPath = {
  type?: string
  vertices?: Array<Point2D & { bulge?: number }>
  bulges?: number[]
  isClosed?: boolean
  edges?: Array<
    | ArcEdge
    | EllipseEdge
    | { type: 'line'; start: Point2D; end: Point2D }
    | { type: 'spline'; controlPoints?: Point2D[] }
    | { type: string }
  >
}

export function hatchPathToPolygon(path: HatchPath): Point2D[] | null {
  if (path.vertices && path.vertices.length >= 2) {
    const closed = path.isClosed !== false
    const poly = polylineWithBulgesToPolygon(path.vertices, closed, path.bulges)
    if (poly) return poly
  }
  if (!path.edges?.length) return null

  const pts: Point2D[] = []
  const append = (next: Point2D[]) => {
    if (next.length === 0) return
    if (pts.length === 0) {
      pts.push(...next)
      return
    }
    if (samePoint(pts[pts.length - 1], next[0])) pts.push(...next.slice(1))
    else pts.push(...next)
  }

  for (const edge of path.edges) {
    if (edge.type === 'line' && 'start' in edge && 'end' in edge) {
      if (!Number.isFinite(edge.start.x) || !Number.isFinite(edge.end.x)) continue
      append([{ ...edge.start }, { ...edge.end }])
      continue
    }
    if (edge.type === 'arc' && 'center' in edge && 'radius' in edge) {
      append(sampleArcEdge(edge as ArcEdge))
      continue
    }
    if (edge.type === 'ellipse' && 'majorAxis' in edge) {
      append(sampleEllipseEdge(edge as EllipseEdge))
      continue
    }
    if (edge.type === 'spline' && 'controlPoints' in edge && edge.controlPoints?.length) {
      append(edge.controlPoints.map((p) => ({ x: p.x, y: p.y })))
    }
  }

  if (pts.length >= 2 && samePoint(pts[0], pts[pts.length - 1])) pts.pop()
  return pts.length >= 3 ? pts : null
}

export type PickedRegion = {
  layer: string
  vertices: Point2D[]
  holes: Point2D[][]
  area: number
  perimeter: number
}

type Xform = { x: number; y: number; sx: number; sy: number; cos: number; sin: number }

const IDENTITY: Xform = { x: 0, y: 0, sx: 1, sy: 1, cos: 1, sin: 0 }

function isIdentity(xf: Xform): boolean {
  return xf.x === 0 && xf.y === 0 && xf.sx === 1 && xf.sy === 1 && xf.sin === 0 && xf.cos === 1
}

function applyXform(p: Point2D, xf: Xform): Point2D {
  if (isIdentity(xf)) return { x: p.x, y: p.y }
  const lx = p.x * xf.sx
  const ly = p.y * xf.sy
  return {
    x: xf.x + lx * xf.cos - ly * xf.sin,
    y: xf.y + lx * xf.sin + ly * xf.cos,
  }
}

function insertXform(insert: DxfInsertEntity, parent: Xform): Xform {
  const deg = Number.isFinite(insert.rotation) ? insert.rotation : 0
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const local: Xform = {
    x: insert.insertionPoint.x,
    y: insert.insertionPoint.y,
    sx: Number.isFinite(insert.scaleX) ? insert.scaleX : 1,
    sy: Number.isFinite(insert.scaleY) ? insert.scaleY : 1,
    cos,
    sin,
  }
  if (isIdentity(parent)) return local
  const origin = applyXform({ x: local.x, y: local.y }, parent)
  return {
    x: origin.x,
    y: origin.y,
    sx: parent.sx * local.sx,
    sy: parent.sy * local.sy,
    cos: parent.cos * local.cos - parent.sin * local.sin,
    sin: parent.sin * local.cos + parent.cos * local.sin,
  }
}

function transformPolygon(poly: Point2D[], xf: Xform): Point2D[] {
  if (isIdentity(xf)) return poly
  return poly.map((p) => applyXform(p, xf))
}

function closePolygonMetrics(vertices: Point2D[], holes: Point2D[][]): Pick<PickedRegion, 'area' | 'perimeter'> {
  let area = Math.abs(signedArea(vertices))
  let perimeter = polygonPerimeter(vertices, true)
  for (const hole of holes) {
    area -= Math.abs(signedArea(hole))
    perimeter += polygonPerimeter(hole, true)
  }
  return { area: Math.max(0, area), perimeter }
}

function polygonsFromHatch(entity: Extract<DxfEntity, { type: 'HATCH' }>): Point2D[][] {
  const polys: Point2D[][] = []
  for (const path of entity.boundaryPaths ?? []) {
    const poly = hatchPathToPolygon(path)
    if (poly && Math.abs(signedArea(poly)) >= MIN_REGION_AREA) polys.push(poly)
  }
  return polys
}

function regionsFromHatch(entity: Extract<DxfEntity, { type: 'HATCH' }>, xf: Xform): PickedRegion[] {
  const layer = entity.layer ?? ''
  const raw = polygonsFromHatch(entity).map((p) => transformPolygon(p, xf))
  if (raw.length === 0) return []

  const holeOf = new Set<number>()
  const holesFor = raw.map(() => [] as number[])
  for (let i = 0; i < raw.length; i++) {
    for (let j = 0; j < raw.length; j++) {
      if (i === j) continue
      if (!polygonContainsPolygon(raw[i], raw[j])) continue
      const iArea = Math.abs(signedArea(raw[i]))
      const jArea = Math.abs(signedArea(raw[j]))
      if (jArea >= iArea) continue
      holeOf.add(j)
      holesFor[i].push(j)
    }
  }

  const out: PickedRegion[] = []
  for (let i = 0; i < raw.length; i++) {
    if (holeOf.has(i)) continue
    const holes = holesFor[i].map((h) => raw[h])
    const metrics = closePolygonMetrics(raw[i], holes)
    if (metrics.area < MIN_REGION_AREA) continue
    out.push({ layer, vertices: raw[i], holes, ...metrics })
  }
  return out
}

function regionsFromEntity(entity: DxfEntity, xf: Xform): PickedRegion[] {
  if (entity.visible === false) return []
  // Только заливки (HATCH). CIRCLE / замкнутые полилинии — это линии/колодцы,
  // не покрытия: иначе под пальцем всплывают ложные «круги».
  if (entity.type === 'HATCH') return regionsFromHatch(entity, xf)
  return []
}

function blockByName(doc: DxfDocument, name: string) {
  return doc.blocks.get(name) ?? doc.blocks.get(name.toUpperCase()) ?? doc.blocks.get(name.toLowerCase())
}

function collectFromEntities(
  entities: readonly DxfEntity[],
  doc: DxfDocument,
  xf: Xform,
  out: PickedRegion[],
  depth: number,
) {
  if (depth > 12) return
  for (const entity of entities) {
    if (entity.type === 'INSERT') {
      const block = blockByName(doc, entity.blockName)
      if (!block?.entities?.length) continue
      collectFromEntities(block.entities, doc, insertXform(entity, xf), out, depth + 1)
      continue
    }
    out.push(...regionsFromEntity(entity, xf))
  }
}

function regionCircularity(area: number, perimeter: number): number {
  if (!(perimeter > 0) || !(area > 0)) return 0
  return (4 * Math.PI * area) / (perimeter * perimeter)
}

/** Почти идеальный круг — обычно колодец/точка на газоне, не участок покрытия. */
export function isCircleLikeRegion(region: Pick<PickedRegion, 'vertices' | 'area' | 'perimeter'>): boolean {
  const circ = regionCircularity(region.area, region.perimeter)
  // Только почти идеальный круг (колодец). Прямоугольники/покрытия ~0.5–0.8.
  return circ >= 0.92
}

export function collectFilledRegions(doc: DxfDocument): PickedRegion[] {
  const out: PickedRegion[] = []
  collectFromEntities(doc.entities, doc, IDENTITY, out, 0)
  return out
}

function isAnnotOrDimLayer(layer: string): boolean {
  const n = layer.toLowerCase()
  return /text|mtext|dim|annot|размер|текст|оси|axis|номер|вынос|подпис|марк|defpoints|нпк/.test(
    n,
  )
}

/**
 * Контур заливки под точкой.
 * Берём наименьший не-круглый участок: круглые HATCH (колодцы/островки)
 * часто лежат поверх покрытия и иначе «перебивают» выбор.
 * Слои текста/размеров/цифр отбрасываем — на стройчертежах их много.
 */
export function findRegionAtWorldPoint(doc: DxfDocument, point: Point2D): PickedRegion | null {
  const hits: PickedRegion[] = []
  for (const region of collectFilledRegions(doc)) {
    if (isAnnotOrDimLayer(region.layer)) continue
    if (!pointInPolygon(point, region.vertices)) continue
    if (region.holes.some((hole) => pointInPolygon(point, hole))) continue
    hits.push(region)
  }
  if (hits.length === 0) return null

  const shaped = hits.filter((r) => !isCircleLikeRegion(r))
  const pool = shaped.length > 0 ? shaped : []
  // Круглые заливки сами по себе не выбираем — только реальные участки покрытия.
  if (pool.length === 0) return null

  let best: PickedRegion | null = null
  for (const region of pool) {
    if (!best || region.area < best.area) best = region
  }
  return best
}

/** Вершины контуров — для привязки линейки/площади. */
export function collectRegionSnapPoints(doc: DxfDocument, max = 24_000): Point2D[] {
  const out: Point2D[] = []
  for (const region of collectFilledRegions(doc)) {
    for (const p of region.vertices) out.push(p)
    if (out.length >= max) return out
  }
  return out
}
