import type { CadViewerRef } from '@cadview/react'
import { computeEntitiesBounds, type DxfDocument } from '@cadview/core'
import type { WorldBounds } from './dwgRasterMeasure'
import { computePngAlignedWorldBounds } from './dwgPngBounds'

/** Header $EXTMIN/$EXTMAX часто раздувают «мир» — fitToView рисует микро-точку. */
export function headerBoundsInflated(doc: DxfDocument): boolean {
  const { extMin, extMax } = doc.header
  if (!extMin || !extMax) return false
  const entityBounds = computeEntitiesBounds(doc.entities, doc)
  if (!entityBounds) return false

  const hw = Math.max(extMax.x - extMin.x, 0)
  const hh = Math.max(extMax.y - extMin.y, 0)
  const ew = Math.max(entityBounds.maxX - entityBounds.minX, 0)
  const eh = Math.max(entityBounds.maxY - entityBounds.minY, 0)

  if (ew <= 0 && eh <= 0) return hw > 0 || hh > 0
  if (hw <= 0 || hh <= 0) return false

  const headerArea = hw * hh
  const entityArea = Math.max(ew * eh, 1e-9)
  return headerArea > entityArea * 2.5
}

export function getDrawingWorldBounds(
  viewer: NonNullable<ReturnType<CadViewerRef['getViewer']>>,
): WorldBounds | null {
  const doc = viewer.getDocument()
  if (!doc) return null
  return computePngAlignedWorldBounds(doc)
}

export function prepareCadViewerDocument(
  viewer: NonNullable<ReturnType<CadViewerRef['getViewer']>>,
): number {
  const doc = viewer.getDocument()
  if (!doc) return 0

  for (const layer of viewer.getLayers()) {
    if (layer.isOff || layer.isFrozen) {
      viewer.setLayerVisible(layer.name, true)
    }
  }

  if (headerBoundsInflated(doc)) {
    delete doc.header.extMin
    delete doc.header.extMax
  }

  return doc.entities.length
}

export function fitCadViewerToDrawing(
  cadRef: CadViewerRef | null,
  wrapRef: HTMLDivElement | null,
): void {
  const viewer = cadRef?.getViewer()
  if (!viewer) return

  prepareCadViewerDocument(viewer)
  viewer.resize()
  viewer.fitToView()

  const canvas = wrapRef?.querySelector('canvas')
  if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    prepareCadViewerDocument(viewer)
    viewer.fitToView()
  }
}
