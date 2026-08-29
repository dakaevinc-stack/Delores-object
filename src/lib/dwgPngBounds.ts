import type { DxfDocument, DxfEntity } from '@cadview/core'
import { computeEntitiesBounds } from '@cadview/core'
import type { WorldBounds, PngWorldMapping, RasterViewState } from './dwgRasterMeasure'

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.round((sorted.length - 1) * p)
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

function sampleEntityPoints(entity: DxfEntity): Array<{ x: number; y: number }> {
  switch (entity.type) {
    case 'LINE':
      return [
        { x: entity.start.x, y: entity.start.y },
        { x: entity.end.x, y: entity.end.y },
      ]
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return entity.vertices.map((v) => ({ x: v.x, y: v.y }))
    case 'CIRCLE':
    case 'ARC':
      return [{ x: entity.center.x, y: entity.center.y }]
    case 'ELLIPSE':
      return [{ x: entity.center.x, y: entity.center.y }]
    case 'POINT':
      return [{ x: entity.position.x, y: entity.position.y }]
    case 'SPLINE':
      return entity.controlPoints.map((p) => ({ x: p.x, y: p.y }))
    case 'HATCH':
      return entity.boundaryPaths.flatMap((path) => {
        if (path.vertices?.length) {
          return path.vertices.map((p) => ({ x: p.x, y: p.y }))
        }
        return (path.edges ?? []).flatMap((edge) => {
          if (edge.type === 'line') {
            return [
              { x: edge.start.x, y: edge.start.y },
              { x: edge.end.x, y: edge.end.y },
            ]
          }
          if (edge.type === 'arc' || edge.type === 'ellipse') {
            return [{ x: edge.center.x, y: edge.center.y }]
          }
          return []
        })
      })
    case 'INSERT':
      return [{ x: entity.insertionPoint.x, y: entity.insertionPoint.y }]
    case 'TEXT':
    case 'MTEXT':
      return [{ x: entity.insertionPoint.x, y: entity.insertionPoint.y }]
    default: {
      const box = computeEntitiesBounds([entity])
      if (!box) return []
      return [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.maxY },
      ]
    }
  }
}

/** Приближает ComputeBounds из Dwg2Png — точнее, чем сырой computeEntitiesBounds. */
export function computePngAlignedWorldBounds(doc: DxfDocument): WorldBounds | null {
  const points: Array<{ x: number; y: number }> = []
  for (const entity of doc.entities) {
    if (entity.visible === false) continue
    points.push(...sampleEntityPoints(entity))
  }

  if (points.length >= 8) {
    const xs = points.map((p) => p.x).sort((a, b) => a - b)
    const ys = points.map((p) => p.y).sort((a, b) => a - b)
    const minX = percentile(xs, 0.01)
    const maxX = percentile(xs, 0.99)
    const minY = percentile(ys, 0.01)
    const maxY = percentile(ys, 0.99)
    const margin = Math.max(maxX - minX, maxY - minY) * 0.04 + 50
    return {
      minX: minX - margin,
      minY: minY - margin,
      maxX: maxX + margin,
      maxY: maxY + margin,
    }
  }

  const bounds = computeEntitiesBounds(doc.entities, doc)
  if (!bounds) return null
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  }
}

export type PngPreviewWorldMeta = WorldBounds & {
  imgW: number
  imgH: number
  maxDimension: number
  pixelsPerUnit?: number
  offsetX?: number
  offsetY?: number
  /** $INSUNITS из DWG — для перевода в метры на PNG-плане. */
  insUnits?: number
}

export function pngMetaToMapping(
  meta: PngPreviewWorldMeta,
  raster?: Pick<RasterViewState, 'imgW' | 'imgH'> | null,
): PngWorldMapping | null {
  const pixelsPerUnit = Number(meta.pixelsPerUnit)
  const offsetX = Number(meta.offsetX)
  const offsetY = Number(meta.offsetY)
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return null
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return null

  const imgW = raster?.imgW ?? meta.imgW
  const imgH = raster?.imgH ?? meta.imgH
  const wScale = imgW / meta.imgW
  const hScale = imgH / meta.imgH
  if (Math.abs(wScale - hScale) > 0.02) return null

  return {
    originX: meta.minX,
    originY: meta.minY,
    pixelsPerUnit: pixelsPerUnit * wScale,
    offsetX: offsetX * wScale,
    offsetY: offsetY * hScale,
    imgH,
  }
}

export function parsePngWorldMeta(raw: unknown): PngPreviewWorldMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const minX = Number(row.minX)
  const minY = Number(row.minY)
  const maxX = Number(row.maxX)
  const maxY = Number(row.maxY)
  const imgW = Number(row.imgW)
  const imgH = Number(row.imgH)
  const maxDimension = Number(row.maxDimension)
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return null
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    imgW,
    imgH,
    maxDimension: Number.isFinite(maxDimension) ? maxDimension : Math.max(imgW, imgH),
    pixelsPerUnit: Number.isFinite(Number(row.pixelsPerUnit)) ? Number(row.pixelsPerUnit) : undefined,
    offsetX: Number.isFinite(Number(row.offsetX)) ? Number(row.offsetX) : undefined,
    offsetY: Number.isFinite(Number(row.offsetY)) ? Number(row.offsetY) : undefined,
    insUnits: Number.isFinite(Number(row.insUnits)) ? Number(row.insUnits) : undefined,
  }
}
