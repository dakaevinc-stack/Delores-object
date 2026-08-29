import type { Point2D, ViewTransform } from '@cadview/core'

export type WorldBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type RasterViewState = {
  scale: number
  x: number
  y: number
  stageW: number
  stageH: number
  imgW: number
  imgH: number
}

export type PngWorldMapping = {
  originX: number
  originY: number
  pixelsPerUnit: number
  offsetX: number
  offsetY: number
  imgH: number
}

/** Соответствует раскладке Dwg2Png (padding + fit bounds в PNG). */
export function computePngWorldMapping(
  imgW: number,
  imgH: number,
  bounds: WorldBounds,
  maxDimension = Math.max(imgW, imgH),
): PngWorldMapping {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1)
  const spanY = Math.max(bounds.maxY - bounds.minY, 1)
  const padding = Math.max(32, maxDimension * 0.02)
  const drawableW = imgW - padding * 2
  const drawableH = imgH - padding * 2
  const pixelsPerUnit = Math.min(drawableW / spanX, drawableH / spanY)
  const scaledW = spanX * pixelsPerUnit
  const scaledH = spanY * pixelsPerUnit
  const offsetX = padding + (drawableW - scaledW) / 2
  const offsetY = padding + (drawableH - scaledH) / 2
  return {
    originX: bounds.minX,
    originY: bounds.minY,
    pixelsPerUnit,
    offsetX,
    offsetY,
    imgH,
  }
}

/** Экран stage (CSS px) → пиксель PNG до масштаба мира. */
export function rasterScreenToImagePixel(
  state: RasterViewState,
  sx: number,
  sy: number,
): Point2D {
  return {
    x: (sx - state.stageW / 2 - state.x) / state.scale + state.imgW / 2,
    y: (sy - state.stageH / 2 - state.y) / state.scale + state.imgH / 2,
  }
}

export function imagePixelToWorld(mapping: PngWorldMapping, px: number, py: number): Point2D {
  return {
    x: mapping.originX + (px - mapping.offsetX) / mapping.pixelsPerUnit,
    y: mapping.originY + (mapping.imgH - mapping.offsetY - py) / mapping.pixelsPerUnit,
  }
}

export function worldToImagePixel(mapping: PngWorldMapping, wx: number, wy: number): Point2D {
  return {
    x: mapping.offsetX + (wx - mapping.originX) * mapping.pixelsPerUnit,
    y: mapping.imgH - mapping.offsetY - (wy - mapping.originY) * mapping.pixelsPerUnit,
  }
}

export function rasterScreenToWorld(
  state: RasterViewState,
  mapping: PngWorldMapping,
  sx: number,
  sy: number,
): Point2D {
  const { x: px, y: py } = rasterScreenToImagePixel(state, sx, sy)
  return imagePixelToWorld(mapping, px, py)
}

export function rasterWorldToScreen(
  state: RasterViewState,
  mapping: PngWorldMapping,
  wx: number,
  wy: number,
): [number, number] {
  const px = mapping.offsetX + (wx - mapping.originX) * mapping.pixelsPerUnit
  const py = mapping.imgH - mapping.offsetY - (wy - mapping.originY) * mapping.pixelsPerUnit
  const sx = (px - state.imgW / 2) * state.scale + state.stageW / 2 + state.x
  const sy = (py - state.imgH / 2) * state.scale + state.stageH / 2 + state.y
  return [sx, sy]
}

export function rasterWorldPolyline(
  state: RasterViewState,
  mapping: PngWorldMapping,
  points: readonly Point2D[],
): string {
  return points
    .map((p) => {
      const [sx, sy] = rasterWorldToScreen(state, mapping, p.x, p.y)
      return `${sx},${sy}`
    })
    .join(' ')
}

export function maxRasterScaleForStage(
  imgW: number,
  imgH: number,
  stageW: number,
  stageH: number,
): number {
  if (imgW <= 0 || imgH <= 0 || stageW <= 0 || stageH <= 0) return 48
  const pad = 32
  const fitScale = Math.min(
    Math.max(0, stageW - pad * 2) / imgW,
    Math.max(0, stageH - pad * 2) / imgH,
  )
  // До 48× CSS-масштаба (~400× от «подогнать» на больших планах)
  return Math.min(48, Math.max(fitScale * 1.02, fitScale * 300))
}

export function zoomRasterViewAt(
  state: RasterViewState,
  mx: number,
  my: number,
  factor: number,
  maxScale = 48,
): Pick<RasterViewState, 'scale' | 'x' | 'y'> {
  const nextScale = Math.min(maxScale, Math.max(0.02, state.scale * factor))
  const ix = (mx - state.stageW / 2 - state.x) / state.scale + state.imgW / 2
  const iy = (my - state.stageH / 2 - state.y) / state.scale + state.imgH / 2
  return {
    scale: nextScale,
    x: mx - state.stageW / 2 - (ix - state.imgW / 2) * nextScale,
    y: my - state.stageH / 2 - (iy - state.imgH / 2) * nextScale,
  }
}

/** Эквивалент CadViewer ViewTransform для текущего ракурса PNG-плана. */
export function cadViewTransformFromRasterPlan(
  raster: RasterViewState,
  mapping: PngWorldMapping,
): ViewTransform {
  const s = raster.scale
  const ppu = mapping.pixelsPerUnit
  return {
    scale: ppu * s,
    offsetX:
      (mapping.offsetX - mapping.originX * ppu - raster.imgW / 2) * s +
      raster.stageW / 2 +
      raster.x,
    offsetY:
      (mapping.originY * ppu + mapping.imgH - mapping.offsetY - raster.imgH / 2) * s +
      raster.stageH / 2 +
      raster.y,
  }
}

export function rasterPlanScreenToWorld(
  raster: RasterViewState,
  mapping: PngWorldMapping,
  sx: number,
  sy: number,
): Point2D {
  const vt = cadViewTransformFromRasterPlan(raster, mapping)
  const wx = (sx - vt.offsetX) / vt.scale
  const wy = (vt.offsetY - sy) / vt.scale
  return { x: wx, y: wy }
}

export function rasterPlanWorldToScreen(
  raster: RasterViewState,
  mapping: PngWorldMapping,
  wx: number,
  wy: number,
): [number, number] {
  const vt = cadViewTransformFromRasterPlan(raster, mapping)
  return [wx * vt.scale + vt.offsetX, vt.offsetY - wy * vt.scale]
}
