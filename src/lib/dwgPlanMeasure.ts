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

const SNAP_SCREEN_PX = 16

function pushVertex(out: Point2D[], p: Point2D | undefined | null) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return
  out.push({ x: p.x, y: p.y })
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
  return { x: clientX - rect.left, y: clientY - rect.top }
}

/** Клик на stage → пиксель PNG с привязкой к ближайшей вершине DWG. */
export function planClickToImagePixel(
  sx: number,
  sy: number,
  view: RasterViewState,
  mapping: PngWorldMapping,
  snapWorldPoints: readonly Point2D[],
): Point2D {
  const raw = rasterScreenToImagePixel(view, sx, sy)
  if (snapWorldPoints.length === 0) return raw

  let bestPx = raw
  let bestDist = SNAP_SCREEN_PX
  for (const world of snapWorldPoints) {
    const [wx, wy] = rasterWorldToScreen(view, mapping, world.x, world.y)
    const d = Math.hypot(wx - sx, wy - sy)
    if (d < bestDist) {
      bestDist = d
      bestPx = worldToImagePixel(mapping, world.x, world.y)
    }
  }
  return bestPx
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
