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

export function rasterDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1
  // >3× раздувает canvas на телефоне и даёт рывки при зуме.
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1))
}

export function fitRasterScaleForStage(
  imgW: number,
  imgH: number,
  stageW: number,
  stageH: number,
  pad = 32,
): number {
  if (imgW <= 0 || imgH <= 0 || stageW <= 0 || stageH <= 0) return 1
  const sw = Math.max(0, stageW - pad * 2)
  const sh = Math.max(0, stageH - pad * 2)
  if (sw <= 0 || sh <= 0) return 1
  return Math.min(sw / imgW, sh / imgH)
}

/** Видимый фрагмент PNG → canvas с учётом DPR (без CSS-масштаба всего изображения). */
export function drawRasterPlanFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  view: Pick<RasterViewState, 'scale' | 'x' | 'y' | 'stageW' | 'stageH' | 'imgW' | 'imgH'>,
  devicePixelRatio = rasterDevicePixelRatio(),
): void {
  const { scale, x, y, stageW, stageH, imgW, imgH } = view
  if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0 || scale <= 0) return

  const dpr = devicePixelRatio
  const canvasW = Math.max(1, Math.round(stageW * dpr))
  const canvasH = Math.max(1, Math.round(stageH * dpr))

  const imagePxToStage = (px: number, py: number) => ({
    sx: (px - imgW / 2) * scale + stageW / 2 + x,
    sy: (py - imgH / 2) * scale + stageH / 2 + y,
  })

  const stageToImagePx = (sx: number, sy: number) => ({
    px: (sx - stageW / 2 - x) / scale + imgW / 2,
    py: (sy - stageH / 2 - y) / scale + imgH / 2,
  })

  const tl = stageToImagePx(0, 0)
  const br = stageToImagePx(stageW, stageH)
  // Целые texel в источнике — меньше дрожания на iOS при pinch/кнопках.
  const sx0 = Math.max(0, Math.min(imgW, Math.min(tl.px, br.px)))
  const sy0 = Math.max(0, Math.min(imgH, Math.min(tl.py, br.py)))
  const ex0 = Math.max(0, Math.min(imgW, Math.max(tl.px, br.px)))
  const ey0 = Math.max(0, Math.min(imgH, Math.max(tl.py, br.py)))
  const sx = Math.floor(sx0)
  const sy = Math.floor(sy0)
  const ex = Math.ceil(ex0)
  const ey = Math.ceil(ey0)
  const sw = Math.max(1, Math.min(imgW - sx, ex - sx))
  const sh = Math.max(1, Math.min(imgH - sy, ey - sy))

  const dstTL = imagePxToStage(sx, sy)
  // Без Math.round по dst — иначе план «плывёт» на 1px относительно точек/заливок.
  const dstX = dstTL.sx * dpr
  const dstY = dstTL.sy * dpr
  const dstW = sw * scale * dpr
  const dstH = sh * scale * dpr

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasW, canvasH)
  const upscale = scale * dpr
  // Резкая смена smoothing выглядела как глюк — держим сглаживание до явного пиксель-зума.
  const pixelSnap = upscale >= 1.35
  ctx.imageSmoothingEnabled = !pixelSnap
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = pixelSnap ? 'low' : 'high'
  }
  ctx.drawImage(img, sx, sy, sw, sh, dstX, dstY, dstW, dstH)
}

export type RegionMaskPaintLayer = {
  minX: number
  minY: number
  width: number
  height: number
  bits: Uint8Array
  /** CSS rgba channels 0–255 + alpha 0–1 */
  rgba: [number, number, number, number]
  /** Даунскейл bits: stretch на width×height при drawImage */
  bitW?: number
  bitH?: number
}

/**
 * Рисует кропы flood-масок в той же системе координат, что и drawRasterPlanFrame.
 * Нельзя использовать упрощённый SVG-path как единственную заливку.
 */
export function paintRegionMaskOverlays(
  ctx: CanvasRenderingContext2D,
  view: Pick<RasterViewState, 'scale' | 'x' | 'y' | 'stageW' | 'stageH' | 'imgW' | 'imgH'>,
  layers: readonly RegionMaskPaintLayer[],
  devicePixelRatio = rasterDevicePixelRatio(),
): void {
  const { scale, x, y, stageW, stageH, imgW, imgH } = view
  if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0 || scale <= 0) return
  if (layers.length === 0) return

  const dpr = devicePixelRatio
  const canvasW = Math.max(1, Math.round(stageW * dpr))
  const canvasH = Math.max(1, Math.round(stageH * dpr))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.imageSmoothingEnabled = false

  for (const layer of layers) {
    if (layer.width < 1 || layer.height < 1) continue
    const bitW = layer.bitW ?? layer.width
    const bitH = layer.bitH ?? layer.height
    if (bitW < 1 || bitH < 1 || layer.bits.length < bitW * bitH) continue
    const tmp = typeof document !== 'undefined' ? document.createElement('canvas') : null
    if (!tmp) continue
    tmp.width = bitW
    tmp.height = bitH
    const tctx = tmp.getContext('2d')
    if (!tctx) continue
    const img = tctx.createImageData(bitW, bitH)
    const [pr, pg, pb, pa01] = layer.rgba
    const pa = Math.max(0, Math.min(255, Math.round(pa01 * 255)))
    for (let i = 0; i < bitW * bitH; i++) {
      if (!layer.bits[i]) continue
      const o = i * 4
      img.data[o] = pr
      img.data[o + 1] = pg
      img.data[o + 2] = pb
      img.data[o + 3] = pa
    }
    tctx.putImageData(img, 0, 0)

    const dstX = ((layer.minX - imgW / 2) * scale + stageW / 2 + x) * dpr
    const dstY = ((layer.minY - imgH / 2) * scale + stageH / 2 + y) * dpr
    const dstW = layer.width * scale * dpr
    const dstH = layer.height * scale * dpr
    ctx.drawImage(tmp, 0, 0, bitW, bitH, dstX, dstY, dstW, dstH)
  }
}

export function maxRasterScaleForStage(
  imgW: number,
  imgH: number,
  stageW: number,
  stageH: number,
  devicePixelRatio = rasterDevicePixelRatio(),
): number {
  if (imgW <= 0 || imgH <= 0 || stageW <= 0 || stageH <= 0) return 64
  const fitScale = fitRasterScaleForStage(imgW, imgH, stageW, stageH)
  const imgMax = Math.max(imgW, imgH)
  const dpr = devicePixelRatio
  // Крупный PNG — больше «запаса» пикселей, можно приблизить сильнее.
  const maxDevicePxPerTexel =
    imgMax >= 20480 ? 18
      : imgMax >= 16384 ? 16
      : imgMax >= 12288 ? 14
      : imgMax >= 10240 ? 12
      : imgMax >= 8192 ? 10
      : 8
  const maxCssPerTexel = maxDevicePxPerTexel / dpr
  const maxZoomFactor =
    imgMax >= 20480 ? 120
      : imgMax >= 16384 ? 96
      : imgMax >= 12288 ? 80
      : imgMax >= 8192 ? 64
      : 48
  return Math.max(fitScale * 1.02, Math.min(maxCssPerTexel, fitScale * maxZoomFactor))
}

export function minRasterScaleForStage(
  imgW: number,
  imgH: number,
  stageW: number,
  stageH: number,
): number {
  const fitScale = fitRasterScaleForStage(imgW, imgH, stageW, stageH)
  // Чуть меньше «вписать», но не в точку.
  return Math.max(0.008, fitScale * 0.72)
}

/**
 * Границы pan: значимая часть чертежа остаётся на экране.
 * edgeRatio выше → меньше «пустоты» (на мобиле иначе при pinch улетаешь с плана).
 */
export function rasterPanLimits(
  state: Pick<RasterViewState, 'scale' | 'stageW' | 'stageH' | 'imgW' | 'imgH'>,
  edgeRatio = 0.42,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const short = Math.min(state.stageW, state.stageH)
  const edge = Math.max(48, short * edgeRatio)
  const halfW = (state.imgW * state.scale) / 2
  const halfH = (state.imgH * state.scale) / 2
  let minX = edge - state.stageW / 2 - halfW
  let maxX = state.stageW / 2 - edge + halfW
  let minY = edge - state.stageH / 2 - halfH
  let maxY = state.stageH / 2 - edge + halfH
  if (maxX < minX) {
    const c = (minX + maxX) / 2
    const slack = Math.max(16, (state.stageW - state.imgW * state.scale) * 0.12)
    minX = c - slack
    maxX = c + slack
  }
  if (maxY < minY) {
    const c = (minY + maxY) / 2
    const slack = Math.max(16, (state.stageH - state.imgH * state.scale) * 0.12)
    minY = c - slack
    maxY = c + slack
  }
  return { minX, maxX, minY, maxY }
}

export function clampRasterPan(
  state: Pick<RasterViewState, 'scale' | 'x' | 'y' | 'stageW' | 'stageH' | 'imgW' | 'imgH'>,
  x: number,
  y: number,
  opts?: { rubber?: number },
): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = rasterPanLimits(state)
  const rubber = opts?.rubber
  if (!(rubber != null && rubber > 0 && rubber < 1)) {
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    }
  }
  const soft = (v: number, min: number, max: number) => {
    if (v < min) return min - (min - v) * rubber
    if (v > max) return max + (v - max) * rubber
    return v
  }
  return { x: soft(x, minX, maxX), y: soft(y, minY, maxY) }
}

export function zoomRasterViewAt(
  state: RasterViewState,
  mx: number,
  my: number,
  factor: number,
  maxScale = 64,
  minScale = 0.02,
  opts?: { clamp?: boolean },
): Pick<RasterViewState, 'scale' | 'x' | 'y'> {
  const safeFactor =
    Number.isFinite(factor) && factor > 0 ? Math.min(1.35, Math.max(1 / 1.35, factor)) : 1
  const nextScale = Math.min(maxScale, Math.max(minScale, state.scale * safeFactor))
  if (!(nextScale > 0) || !Number.isFinite(nextScale)) {
    return { scale: state.scale, x: state.x, y: state.y }
  }
  const ix = (mx - state.stageW / 2 - state.x) / state.scale + state.imgW / 2
  const iy = (my - state.stageH / 2 - state.y) / state.scale + state.imgH / 2
  const next = {
    scale: nextScale,
    x: mx - state.stageW / 2 - (ix - state.imgW / 2) * nextScale,
    y: my - state.stageH / 2 - (iy - state.imgH / 2) * nextScale,
  }
  // Во время pinch clamp снаружи — иначе якорь ломается на каждом кадре.
  if (opts?.clamp === false) return next
  const pan = clampRasterPan({ ...state, ...next }, next.x, next.y)
  return { scale: next.scale, x: pan.x, y: pan.y }
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
