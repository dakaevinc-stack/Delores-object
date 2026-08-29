import { useCallback, useEffect, useRef, useState } from 'react'
import { CadViewer, type CadViewerRef } from '@cadview/react'
import type { DxfDocument, Point2D, ViewTransform } from '@cadview/core'
import { parseDxf, screenToWorld, worldToScreen } from '@cadview/core'
import { prepareCadViewerDocument } from '../../lib/dwgViewerFit'
import { DwgRasterViewer, type DwgRasterViewerRef } from './DwgRasterViewer'
import {
  formatArea,
  formatLinear,
  measureBetween,
  polygonArea,
  polygonPerimeter,
  regionPerimeterRingsMeters,
  buildRegionEdgeScreenLabels,
  type DwgViewerTool,
  type LengthMeasure,
  type PerimeterRing,
  screenPointFromMouse,
  worldPointFromMouse,
} from '../../lib/dwgMeasureFormat'
import { pickRegionAtScreenFromImage } from '../../lib/dwgPngRegionPick'
import { findRegionAtWorldPoint } from '../../lib/dwgRegionPick'
import { PinchTracker } from '../../lib/touchPinchZoom'
import {
  rasterPlanWorldToScreen,
  type PngWorldMapping,
  type RasterViewState,
} from '../../lib/dwgRasterMeasure'
import { pngMetaToMapping, type PngPreviewWorldMeta } from '../../lib/dwgPngBounds'
import {
  collectDxfSnapPoints,
  imagePixelToScreen,
  planClickToImagePixel,
  planPixelArea,
  planPixelDistance,
  planPixelPerimeter,
  planPixelPointsToScreenPolyline,
  planPixelToWorld,
  pointerOnStage,
} from '../../lib/dwgPlanMeasure'
import {
  drawingAreaToSquareMeters,
  drawingLengthToMeters,
} from '../../lib/dwgDrawingUnits'
import {
  calcAsphaltOrder,
  calcCrushedStoneOrder,
  calcCurbConcreteOrder,
  calcSandOrder,
  calcSoilOrder,
  DEFAULT_ASPHALT_WEARING_MIX,
  DEFAULT_CONCRETE_GRADE,
  DEFAULT_CRUSHED_STONE_FRACTION,
  DEFAULT_LAYER_THICKNESS_CM,
  type AsphaltMixId,
  type ConcreteGrade,
  type CrushedStoneFraction,
} from '../../lib/dwgMaterialOrder'
import { DwgMaterialOrderPanel } from './DwgMaterialOrderPanel'
import styles from './DwgViewerChrome.module.css'

type Props = {
  dxfText: string
  pngUrl?: string | null
  /** loading — ждём PNG; ready — показываем план; failed — только вектор */
  pngState?: 'idle' | 'loading' | 'ready' | 'failed'
  /** Точные границы PNG с сервера — для корректных измерений в метрах */
  pngWorldMeta?: PngPreviewWorldMeta | null
  preferPlan?: boolean
  drawingName: string
  cadRef: React.RefObject<CadViewerRef | null>
  rasterRef: React.RefObject<DwgRasterViewerRef | null>
  wrapRef: React.RefObject<HTMLDivElement | null>
  onLayersLoaded: (entityCount: number) => void
  onRasterBlank?: () => void
}

const DRAG_THRESHOLD_PX = 5
const LONG_PRESS_MS = 480
const LONG_PRESS_MOVE_PX = 12

type RegionPickItem = {
  id: string
  space: 'plan' | 'world'
  outline: Point2D[]
  holes: Point2D[][]
  area: number
  perimeter: number
}

const REGION_PALETTE = [
  { fill: 'rgba(167, 139, 250, 0.18)', stroke: '#a78bfa', label: '#ddd6fe' },
  { fill: 'rgba(56, 189, 248, 0.18)', stroke: '#38bdf8', label: '#bae6fd' },
  { fill: 'rgba(52, 211, 153, 0.18)', stroke: '#34d399', label: '#a7f3d0' },
  { fill: 'rgba(251, 191, 36, 0.18)', stroke: '#fbbf24', label: '#fde68a' },
  { fill: 'rgba(244, 114, 182, 0.18)', stroke: '#f472b6', label: '#fbcfe8' },
  { fill: 'rgba(248, 113, 113, 0.18)', stroke: '#f87171', label: '#fecaca' },
] as const

/** Цвета кусков измерения (линия/дуга) — совпадают со списком в панели. */
const EDGE_SIDE_COLORS = [
  '#38bdf8',
  '#fbbf24',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#22d3ee',
  '#f87171',
  '#a3e635',
  '#e879f9',
] as const

function edgeSideColor(side: number): string {
  return EDGE_SIDE_COLORS[(Math.max(1, side) - 1) % EDGE_SIDE_COLORS.length]
}

function regionCentroid(outline: readonly Point2D[]): Point2D {
  let x = 0
  let y = 0
  const n = outline.length
  if (n === 0) return { x: 0, y: 0 }
  for (const p of outline) {
    x += p.x
    y += p.y
  }
  return { x: x / n, y: y / n }
}

function sameRegionPick(a: RegionPickItem, b: Omit<RegionPickItem, 'id'>): boolean {
  if (a.space !== b.space) return false
  if (Math.abs(a.area - b.area) > Math.max(1e-6, a.area * 0.02)) return false
  const ca = regionCentroid(a.outline)
  const cb = regionCentroid(b.outline)
  const span = Math.sqrt(Math.max(a.area, 1e-9))
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) <= span * 0.15
}

type MeasureOverlayProps = {
  wrapRef: React.RefObject<HTMLDivElement | null>
  cadRef: React.RefObject<CadViewerRef | null>
  rasterRef?: React.RefObject<DwgRasterViewerRef | null>
  syncPlan?: boolean
  scaleReady?: boolean
  pngMapping?: PngWorldMapping | null
  rasterView?: RasterViewState | null
  planPixels?: Point2D[]
  planHoles?: Point2D[][]
  regionPicks?: RegionPickItem[]
  snapWorldPoints?: Point2D[]
  onPlanPixelClick?: (pixel: Point2D) => void
  onPlanRegionPick?: (payload: {
    pixels: Point2D[]
    holes: Point2D[][]
    area: number
    perimeter: number
  }) => void
  onWorldRegionPick?: (payload: {
    vertices: Point2D[]
    holes: Point2D[][]
    area: number
    perimeter: number
  }) => void
  getDxfDocument?: () => DxfDocument | null
  mode: DwgViewerTool
  lengthPoints: Point2D[]
  lengthMeasure: LengthMeasure | null
  areaPoints: Point2D[]
  onLengthClick: (point: Point2D) => void
  onAreaClick: (point: Point2D) => void
  insUnits?: number
  pixelsPerUnit?: number
}

function pointerInOverlay(
  svg: SVGSVGElement,
  stage: HTMLElement | null,
  clientX: number,
  clientY: number,
): Point2D {
  if (stage) return pointerOnStage(stage, clientX, clientY)
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const inv = svg.getScreenCTM()?.inverse()
  if (inv) {
    const local = pt.matrixTransform(inv)
    return { x: local.x, y: local.y }
  }
  const rect = svg.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

function MeasureOverlay({
  wrapRef,
  cadRef,
  rasterRef,
  syncPlan = false,
  scaleReady = true,
  pngMapping = null,
  rasterView = null,
  planPixels = [],
  regionPicks = [],
  snapWorldPoints = [],
  onPlanPixelClick,
  onPlanRegionPick,
  onWorldRegionPick,
  getDxfDocument,
  mode,
  lengthPoints,
  lengthMeasure,
  areaPoints,
  onLengthClick,
  onAreaClick,
  insUnits = 6,
  pixelsPerUnit = 0,
}: MeasureOverlayProps) {
  const areaClosed = areaPoints.length >= 3
  const svgRef = useRef<SVGSVGElement>(null)
  const [vt, setVt] = useState<ViewTransform | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [, setViewTick] = useState(0)
  const [holdRing, setHoldRing] = useState<Point2D | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
    longPressFired: boolean
  } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef(new PinchTracker())
  const pinchGestureRef = useRef(false)

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    setHoldRing(null)
  }

  const planInteract = syncPlan && Boolean(rasterView)
  const planDraw = planInteract && scaleReady && Boolean(pngMapping)

  const liveRasterView = () => rasterRef?.current?.getViewState() ?? rasterView
  const liveStage = () => rasterRef?.current?.getStageElement() ?? null

  const tryPickRegionAt = (sx: number, sy: number): boolean => {
    // 1) Цветной PNG-план — заливка по пикселям
    const view = liveRasterView()
    const mapping = planDraw && pngMapping ? pngMapping : null
    if (view && mapping && onPlanRegionPick) {
      const img = rasterRef?.current?.getImageElement() ?? null
      if (img?.naturalWidth) {
        const pngRegion = pickRegionAtScreenFromImage(img, view, mapping, sx, sy)
        if (pngRegion && pngRegion.pixels.length >= 3) {
          onPlanRegionPick({
            pixels: pngRegion.pixels,
            holes: pngRegion.holes,
            area: pngRegion.area,
            perimeter: pngRegion.perimeter,
          })
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(12)
          }
          return true
        }
      }
    }

    // 2) Векторный DXF — только HATCH (заливки площадей), не текст/размеры/цифры
    if (!planInteract && onWorldRegionPick && getDxfDocument) {
      const doc = getDxfDocument()
      const viewer = cadRef.current?.getViewer()
      const liveVt = viewer?.getViewTransform() ?? vt
      if (!doc || !liveVt) return false
      const [wx, wy] = screenToWorld(liveVt, sx, sy)
      const hit = findRegionAtWorldPoint(doc, { x: wx, y: wy })
      if (!hit || hit.vertices.length < 3) return false
      onWorldRegionPick({
        vertices: hit.vertices,
        holes: hit.holes,
        area: hit.area,
        perimeter: hit.perimeter,
      })
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(12)
      }
      return true
    }
    return false
  }

  useEffect(() => {
    const host = planInteract ? rasterRef?.current?.getStageElement() : null
    const wrap = wrapRef.current
    if (!host && !wrap) return

    if (planInteract && host) {
      const sync = () => {
        const el = rasterRef?.current?.getStageElement()
        if (!el) return
        setSize({ w: el.clientWidth, h: el.clientHeight })
      }
      sync()
      const ro = new ResizeObserver(sync)
      ro.observe(host)
      return () => ro.disconnect()
    }

    const canvas = wrap?.querySelector('canvas')
    if (!wrap || !canvas) return

    const sync = () => {
      const viewer = cadRef.current?.getViewer()
      if (!viewer) return
      setVt(viewer.getViewTransform())
      setSize({ w: canvas.clientWidth, h: canvas.clientHeight })
    }

    sync()
    const viewer = cadRef.current?.getViewer()
    viewer?.on('viewchange', sync)
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    return () => {
      viewer?.off('viewchange', sync)
      ro.disconnect()
    }
  }, [cadRef, wrapRef, rasterRef, mode, planInteract, rasterView])

  useEffect(() => {
    if (!planInteract || !rasterView) return
    setViewTick((n) => n + 1)
  }, [planInteract, rasterView?.scale, rasterView?.x, rasterView?.y, rasterView?.stageW, rasterView?.stageH])

  useEffect(() => () => clearLongPress(), [])

  const getCanvas = () => wrapRef.current?.querySelector('canvas') ?? null

  if (size.w === 0) return null
  if (!planInteract && !vt) return null

  const mapping = planDraw && pngMapping ? pngMapping : null
  const viewForPlan = planDraw ? rasterView : null
  const planClosed = planPixels.length >= 3

  const planScreenPolyline = (pixels: readonly Point2D[]): string => {
    if (!viewForPlan) return ''
    return planPixelPointsToScreenPolyline(viewForPlan, pixels)
  }

  const worldPolyline = (points: readonly Point2D[]): string =>
    points
      .map((p) => {
        if (planDraw && mapping && viewForPlan) {
          const [sx, sy] = rasterPlanWorldToScreen(viewForPlan, mapping, p.x, p.y)
          return `${sx},${sy}`
        }
        if (vt) {
          const [sx, sy] = worldToScreen(vt, p.x, p.y)
          return `${sx},${sy}`
        }
        return '0,0'
      })
      .join(' ')

  const lengthLine = planDraw
    ? planPixels.length >= 1
      ? planScreenPolyline(planPixels.slice(0, lengthMeasure ? 2 : planPixels.length))
      : ''
    : lengthPoints.length >= 1
      ? worldPolyline(lengthMeasure ? lengthMeasure.points : lengthPoints)
      : ''

  const areaPolyline = planDraw
    ? planPixels.length > 0
      ? planScreenPolyline(planPixels)
      : ''
    : areaPoints.length > 0
      ? worldPolyline(areaPoints)
      : ''

  const planScreenPath = (pixels: readonly Point2D[]): string => {
    if (!viewForPlan || pixels.length < 2) return ''
    return pixels
      .map((p, i) => {
        const [sx, sy] = imagePixelToScreen(viewForPlan, p.x, p.y)
        return `${i === 0 ? 'M' : 'L'} ${sx} ${sy}`
      })
      .join(' ')
  }

  const worldScreenPath = (pixels: readonly Point2D[]): string => {
    if (!vt || pixels.length < 2) return ''
    return pixels
      .map((p, i) => {
        const [sx, sy] = worldToScreen(vt, p.x, p.y)
        return `${i === 0 ? 'M' : 'L'} ${sx} ${sy}`
      })
      .join(' ')
  }

  const regionPaths =
    mode === 'region'
      ? regionPicks.map((region, index) => {
          const ringPath =
            region.space === 'plan' && planDraw
              ? planScreenPath(region.outline)
              : region.space === 'world' && !planDraw
                ? worldScreenPath(region.outline)
                : ''
          if (!ringPath) return null
          const holePaths =
            region.space === 'plan' && planDraw
              ? region.holes
                  .map((hole) => (hole.length >= 3 ? ` ${planScreenPath(hole)} Z` : ''))
                  .join('')
              : region.holes
                  .map((hole) => (hole.length >= 3 ? ` ${worldScreenPath(hole)} Z` : ''))
                  .join('')
          const palette = REGION_PALETTE[index % REGION_PALETTE.length]
          const c = regionCentroid(region.outline)
          const labelScreen =
            region.space === 'plan' && viewForPlan
              ? imagePixelToScreen(viewForPlan, c.x, c.y)
              : vt
                ? worldToScreen(vt, c.x, c.y)
                : ([0, 0] as [number, number])
          return {
            id: region.id,
            index,
            d: `${ringPath} Z${holePaths}`,
            palette,
            labelX: labelScreen[0],
            labelY: labelScreen[1],
          }
        })
      : []

  const regionEdgeLabels =
    mode === 'region'
      ? regionPicks.flatMap((region) => {
          const drawable =
            (region.space === 'plan' && planDraw) || (region.space === 'world' && !planDraw && vt)
          if (!drawable) return []

          const rings =
            region.space === 'plan' && pixelsPerUnit > 0
              ? regionPerimeterRingsMeters({
                  outline: region.outline,
                  holes: region.holes,
                  space: 'plan',
                  insUnits,
                  pixelsPerUnit,
                })
              : region.space === 'world'
                ? regionPerimeterRingsMeters({
                    outline: region.outline,
                    holes: region.holes,
                    space: 'world',
                    insUnits,
                    pixelsPerUnit: 1,
                  })
                : []
          if (rings.length === 0) return []

          const toScreen =
            region.space === 'plan' && viewForPlan
              ? (p: Point2D) => imagePixelToScreen(viewForPlan, p.x, p.y)
              : vt
                ? (p: Point2D) => worldToScreen(vt, p.x, p.y)
                : () => [0, 0] as [number, number]

          return buildRegionEdgeScreenLabels({
            outline: region.outline,
            holes: region.holes,
            rings,
            toScreen,
            pushPx: 12,
          }).map((label) => {
            const color = edgeSideColor(label.side)
            return {
              ...label,
              id: `${region.id}-${label.kind}-${label.holeIndex ?? 0}-${label.side}`,
              stroke: color,
              labelFill: color,
            }
          })
        })
      : []

  const areaFill =
    planDraw && planClosed
      ? planScreenPolyline(planPixels)
      : areaClosed && areaPoints.length >= 3
        ? worldPolyline(areaPoints)
        : ''

  const drawPlanPixels = planDraw ? planPixels : []
  const drawWorldPoints =
    mode === 'length'
      ? lengthMeasure
        ? lengthMeasure.points
        : lengthPoints
      : mode === 'area'
        ? areaPoints
        : []

  const showRegionContour = mode === 'region' || mode === 'area'

  const screenPointForPlanPixel = (p: Point2D): [number, number] => {
    if (!viewForPlan) return [0, 0]
    return imagePixelToScreen(viewForPlan, p.x, p.y)
  }

  const screenPointForWorld = (p: Point2D): [number, number] => {
    if (planDraw && mapping && viewForPlan) {
      return rasterPlanWorldToScreen(viewForPlan, mapping, p.x, p.y)
    }
    if (vt) return worldToScreen(vt, p.x, p.y)
    return [0, 0]
  }

  return (
    <svg
      ref={svgRef}
      className={styles.measureOverlay}
      viewBox={`0 0 ${size.w} ${size.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ cursor: grabbing ? 'grabbing' : 'crosshair' }}
      onWheel={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const svg = svgRef.current
        if (!svg) return
        if (planInteract) {
          const stage = liveStage()
          const { x, y } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
          rasterRef?.current?.zoomAt(x, y, factor)
          return
        }
        const canvas = getCanvas()
        const viewer = cadRef.current?.getViewer()
        if (!canvas || !viewer) return
        const sp = screenPointFromMouse(canvas, e.clientX, e.clientY)
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
        viewer.handleZoom(sp.x, sp.y, factor)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return
        e.preventDefault()
        e.stopPropagation()
        const svg = svgRef.current
        if (!svg) return
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        pinchRef.current.down(e.pointerId, { x: sx, y: sy })
        if (pinchRef.current.isPinching()) {
          clearLongPress()
          dragRef.current = null
        } else {
          clearLongPress()
          dragRef.current = {
            pointerId: e.pointerId,
            startX: sx,
            startY: sy,
            lastX: sx,
            lastY: sy,
            moved: false,
            longPressFired: false,
          }
          if (
            mode === 'region' &&
            ((planDraw && onPlanRegionPick) || (!planInteract && onWorldRegionPick))
          ) {
            setHoldRing({ x: sx, y: sy })
            longPressTimerRef.current = setTimeout(() => {
              longPressTimerRef.current = null
              const active = dragRef.current
              if (!active || active.moved || pinchRef.current.isPinching()) {
                setHoldRing(null)
                return
              }
              const picked = tryPickRegionAt(active.startX, active.startY)
              setHoldRing(null)
              if (picked && dragRef.current) {
                dragRef.current.longPressFired = true
              }
            }, LONG_PRESS_MS)
          }
        }
        ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const svg = svgRef.current
        if (!svg) return
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        const pinch = pinchRef.current.move(e.pointerId, { x: sx, y: sy })
        if (pinch) {
          pinchGestureRef.current = true
          clearLongPress()
          dragRef.current = null
          setGrabbing(false)
          if (planInteract) {
            rasterRef?.current?.zoomAt(pinch.center.x, pinch.center.y, pinch.factor)
          } else {
            const viewer = cadRef.current?.getViewer()
            if (viewer) viewer.handleZoom(pinch.center.x, pinch.center.y, pinch.factor)
          }
          return
        }
        if (pinchRef.current.isPinching()) return

        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return
        const dx = sx - drag.lastX
        const dy = sy - drag.lastY
        if (!drag.moved) {
          const total = Math.hypot(sx - drag.startX, sy - drag.startY)
          if (total > LONG_PRESS_MOVE_PX && longPressTimerRef.current) {
            clearLongPress()
          }
          if (total < DRAG_THRESHOLD_PX) return
          clearLongPress()
          drag.moved = true
          setGrabbing(true)
        }
        drag.lastX = sx
        drag.lastY = sy
        if (planInteract) {
          rasterRef?.current?.panBy(dx, dy)
          return
        }
        const viewer = cadRef.current?.getViewer()
        if (!viewer) return
        viewer.handlePan(dx, dy)
      }}
      onPointerUp={(e) => {
        pinchRef.current.up(e.pointerId)
        if (pinchRef.current.pointerCount() === 0) {
          pinchRef.current.clear()
        }

        const drag = dragRef.current
        const wasPinch = pinchGestureRef.current
        if (pinchRef.current.pointerCount() === 0) {
          pinchGestureRef.current = false
        }

        if (wasPinch || pinchRef.current.isPinching()) {
          if (drag?.pointerId === e.pointerId) dragRef.current = null
          setGrabbing(false)
          try {
            ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
          } catch {
            /* already released */
          }
          clearLongPress()
          return
        }

        if (!drag || drag.pointerId !== e.pointerId) return
        dragRef.current = null
        setGrabbing(false)
        try {
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        clearLongPress()
        if (drag.moved || drag.longPressFired) return
        if (e.button !== 0) return
        if (mode === 'region') return
        const svg = e.currentTarget as SVGSVGElement
        const view = liveRasterView()
        const stage = liveStage()
        if (planDraw && mapping && view && onPlanPixelClick) {
          const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
          const pixel = planClickToImagePixel(sx, sy, view, mapping, snapWorldPoints)
          onPlanPixelClick(pixel)
          return
        }
        if (planInteract && !planDraw) return
        const canvas = getCanvas()
        const viewer = cadRef.current?.getViewer()
        if (!canvas || !viewer) return
        const world = worldPointFromMouse(
          canvas,
          viewer.getViewTransform(),
          e.clientX,
          e.clientY,
        )
        if (mode === 'length') onLengthClick(world)
        else onAreaClick(world)
      }}
      onPointerCancel={(e) => {
        clearLongPress()
        if (e.pointerId != null) pinchRef.current.up(e.pointerId)
        if (pinchRef.current.pointerCount() === 0) {
          pinchRef.current.clear()
          pinchGestureRef.current = false
        }
        dragRef.current = null
        setGrabbing(false)
      }}
    >
      {holdRing ? (
        <g className={styles.holdRing} pointerEvents="none">
          <circle cx={holdRing.x} cy={holdRing.y} r={28} className={styles.holdRingOuter} />
          <circle cx={holdRing.x} cy={holdRing.y} r={14} className={styles.holdRingInner} />
        </g>
      ) : null}
      {showRegionContour && mode === 'region'
        ? regionPaths.map((item) =>
            item ? (
              <g key={item.id} pointerEvents="none">
                <path
                  d={item.d}
                  fill={item.palette.fill}
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth={1.25}
                  fillRule="evenodd"
                />
                <circle
                  cx={item.labelX}
                  cy={item.labelY}
                  r={11}
                  fill="rgba(10, 16, 28, 0.88)"
                  stroke={item.palette.stroke}
                  strokeWidth={1.5}
                />
                <text
                  x={item.labelX}
                  y={item.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={item.palette.label}
                  fontSize={12}
                  fontWeight={800}
                >
                  {item.index + 1}
                </text>
              </g>
            ) : null,
          )
        : null}
      {showRegionContour && mode === 'region'
        ? regionEdgeLabels.map((label) => (
            <g key={label.id} pointerEvents="none">
              <polyline
                points={label.screenPoints}
                fill="none"
                stroke="rgba(10, 16, 28, 0.75)"
                strokeWidth={label.shape === 'arc' ? 7 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={label.screenPoints}
                fill="none"
                stroke={label.stroke}
                strokeWidth={label.shape === 'arc' ? 3.5 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={label.shape === 'arc' ? '7 5' : undefined}
              />
              <circle
                cx={label.endA.x}
                cy={label.endA.y}
                r={4.5}
                fill="#0b1222"
                stroke={label.stroke}
                strokeWidth={2}
              />
              <circle
                cx={label.endB.x}
                cy={label.endB.y}
                r={4.5}
                fill="#0b1222"
                stroke={label.stroke}
                strokeWidth={2}
              />
              <g transform={`translate(${label.x.toFixed(2)} ${label.y.toFixed(2)})`}>
                <rect
                  className={styles.edgeLabelBg}
                  x={-36}
                  y={-11}
                  width={72}
                  height={22}
                  rx={6}
                  stroke={label.stroke}
                />
                <text className={styles.edgeLabelText} textAnchor="middle" dominantBaseline="central">
                  <tspan className={styles.edgeLabelSide} fill={label.labelFill}>
                    {label.side}
                  </tspan>
                  <tspan>{` ${formatLinear(label.lengthM)}`}</tspan>
                </text>
              </g>
            </g>
          ))
        : null}
      {showRegionContour && mode === 'area' && areaFill ? (
        <polygon
          points={areaFill}
          fill="rgba(56, 189, 248, 0.12)"
          stroke="rgba(56, 189, 248, 0.9)"
          strokeWidth={2}
        />
      ) : null}
      {showRegionContour && mode === 'area' && areaPolyline ? (
        <polyline
          points={areaPolyline}
          fill="none"
          stroke="rgba(56, 189, 248, 0.95)"
          strokeWidth={2}
          strokeDasharray={
            (planDraw ? planClosed : areaClosed) ? undefined : '6 4'
          }
        />
      ) : null}
      {mode === 'length' && lengthLine ? (
        <polyline
          points={lengthLine}
          fill="none"
          stroke="rgba(251, 191, 36, 0.95)"
          strokeWidth={2}
        />
      ) : null}
      {planDraw && mode !== 'region' && drawPlanPixels.length <= 48
        ? drawPlanPixels.map((p, i) => {
            const [sx, sy] = screenPointForPlanPixel(p)
            return (
              <circle
                key={`plan-${i}-${sx.toFixed(1)}-${sy.toFixed(1)}`}
                cx={sx}
                cy={sy}
                r={5}
                className={mode === 'length' ? styles.lengthVertex : styles.areaVertex}
              />
            )
          })
        : null}
      {!planDraw && mode !== 'region'
        ? drawWorldPoints.map((p, i) => {
            const [sx, sy] = screenPointForWorld(p)
            return (
              <circle
                key={`${mode}-${i}-${sx.toFixed(1)}-${sy.toFixed(1)}`}
                cx={sx}
                cy={sy}
                r={5}
                className={mode === 'length' ? styles.lengthVertex : styles.areaVertex}
              />
            )
          })
        : null}
    </svg>
  )
}

export function DwgViewerChrome({
  dxfText,
  pngUrl,
  pngState = 'idle',
  pngWorldMeta = null,
  preferPlan = false,
  drawingName,
  cadRef,
  rasterRef,
  wrapRef,
  onLayersLoaded,
  onRasterBlank,
}: Props) {
  const hasRaster = Boolean(pngUrl)
  const dxfReady = dxfText.trim().length > 0
  const planExpected = preferPlan && pngState !== 'failed'
  const measurePreferred = pngState === 'failed' || (!preferPlan && !hasRaster)
  const [tool, setTool] = useState<DwgViewerTool | null>(
    measurePreferred && dxfReady ? 'length' : null,
  )
  const [lengthPoints, setLengthPoints] = useState<Point2D[]>([])
  const [lengthMeasure, setLengthMeasure] = useState<LengthMeasure | null>(null)
  const [areaPoints, setAreaPoints] = useState<Point2D[]>([])
  const [planPixels, setPlanPixels] = useState<Point2D[]>([])
  const [planHoles, setPlanHoles] = useState<Point2D[][]>([])
  const [regionPicks, setRegionPicks] = useState<RegionPickItem[]>([])
  const [materialKind, setMaterialKind] = useState<
    'none' | 'asphalt' | 'soil' | 'curbConcrete' | 'crushedStone' | 'sand'
  >('none')
  const [asphaltBinderCm, setAsphaltBinderCm] = useState(6)
  const [asphaltWearingCm, setAsphaltWearingCm] = useState(4)
  const [asphaltMixId, setAsphaltMixId] = useState<AsphaltMixId>(DEFAULT_ASPHALT_WEARING_MIX)
  const [soilThicknessCm, setSoilThicknessCm] = useState(10)
  const [curbLockCm, setCurbLockCm] = useState(10)
  const [concreteGrade, setConcreteGrade] = useState<ConcreteGrade>(DEFAULT_CONCRETE_GRADE)
  const [crushedStoneCm, setCrushedStoneCm] = useState(DEFAULT_LAYER_THICKNESS_CM)
  const [crushedStoneFraction, setCrushedStoneFraction] = useState<CrushedStoneFraction>(
    DEFAULT_CRUSHED_STONE_FRACTION,
  )
  const [sandCm, setSandCm] = useState(DEFAULT_LAYER_THICKNESS_CM)
  /** Компактный UI: узкий экран или низкий (альбом на телефоне) */
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 719px), (max-height: 520px)').matches
      : false,
  )
  const [regionDetailsOpen, setRegionDetailsOpen] = useState(() =>
    typeof window !== 'undefined'
      ? !window.matchMedia('(max-width: 719px), (max-height: 520px)').matches
      : true,
  )
  const regionPickCountRef = useRef(0)
  const parsedDocRef = useRef<DxfDocument | null>(null)
  const [snapWorldPoints, setSnapWorldPoints] = useState<Point2D[]>([])
  const [drawingInsUnits, setDrawingInsUnits] = useState(6)
  const [rasterView, setRasterView] = useState<RasterViewState | null>(null)

  const measurePngMapping: PngWorldMapping | null =
    pngWorldMeta && rasterView ? pngMetaToMapping(pngWorldMeta, rasterView) : null
  const measureScaleReady = !hasRaster || Boolean(measurePngMapping)
  const planInsUnits =
    pngWorldMeta?.insUnits != null && Number.isFinite(pngWorldMeta.insUnits)
      ? pngWorldMeta.insUnits
      : drawingInsUnits

  const onLayersLoadedRef = useRef(onLayersLoaded)
  useEffect(() => {
    onLayersLoadedRef.current = onLayersLoaded
  }, [onLayersLoaded])

  useEffect(() => {
    setLengthPoints([])
    setLengthMeasure(null)
    setAreaPoints([])
    setPlanPixels([])
    setPlanHoles([])
    setRegionPicks([])
    setSnapWorldPoints([])
    if (!dxfText.trim()) {
      parsedDocRef.current = null
      return
    }
    try {
      const doc = parseDxf(dxfText)
      parsedDocRef.current = doc
      setSnapWorldPoints(collectDxfSnapPoints(doc))
      if (doc.header?.insUnits != null) setDrawingInsUnits(doc.header.insUnits)
    } catch {
      parsedDocRef.current = null
    }
  }, [dxfText])

  const handleLayersLoaded = useCallback(() => {
    const viewer = cadRef.current?.getViewer()
    const entityCount = viewer ? prepareCadViewerDocument(viewer) : 0
    if (viewer) {
      const doc = viewer.getDocument()
      if (doc) setSnapWorldPoints(collectDxfSnapPoints(doc))
      if (doc?.header?.insUnits != null) setDrawingInsUnits(doc.header.insUnits)
    }
    onLayersLoadedRef.current(entityCount)
  }, [cadRef])

  const selectPlan = useCallback(() => {
    setTool(null)
    requestAnimationFrame(() => rasterRef.current?.fit())
  }, [rasterRef])

  const selectLengthTool = useCallback(() => {
    if (!dxfReady) return
    setTool('length')
    setAreaPoints([])
    setPlanPixels([])
    setPlanHoles([])
    setRegionPicks([])
  }, [dxfReady])

  const selectAreaTool = useCallback(() => {
    if (!dxfReady) return
    setTool('area')
    setLengthPoints([])
    setLengthMeasure(null)
    setPlanPixels([])
    setPlanHoles([])
    setRegionPicks([])
  }, [dxfReady])

  const selectRegionTool = useCallback(() => {
    if (!dxfReady) return
    setTool('region')
    setLengthPoints([])
    setLengthMeasure(null)
    setAreaPoints([])
    setPlanPixels([])
    setPlanHoles([])
    // участки не сбрасываем при повторном выборе инструмента — только «Сбросить»
  }, [dxfReady])

  const resetMeasures = useCallback(() => {
    setLengthPoints([])
    setLengthMeasure(null)
    setAreaPoints([])
    setPlanPixels([])
    setPlanHoles([])
    setRegionPicks([])
  }, [])

  const removeRegionPick = useCallback((id: string) => {
    setRegionPicks((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const getDxfDocument = useCallback(() => parsedDocRef.current, [])

  const appendRegionPick = useCallback((next: Omit<RegionPickItem, 'id'>) => {
    setRegionPicks((prev) => {
      if (prev.some((r) => sameRegionPick(r, next))) return prev
      return [
        ...prev,
        {
          ...next,
          id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        },
      ]
    })
  }, [])

  const onPlanRegionPick = useCallback(
    (payload: { pixels: Point2D[]; holes: Point2D[][]; area: number; perimeter: number }) => {
      if (payload.pixels.length < 3) return
      setLengthPoints([])
      setLengthMeasure(null)
      setAreaPoints([])
      setPlanPixels([])
      setPlanHoles([])
      appendRegionPick({
        space: 'plan',
        outline: payload.pixels,
        holes: payload.holes,
        area: payload.area,
        perimeter: payload.perimeter,
      })
    },
    [appendRegionPick],
  )

  const onWorldRegionPick = useCallback(
    (payload: {
      vertices: Point2D[]
      holes: Point2D[][]
      area: number
      perimeter: number
    }) => {
      if (payload.vertices.length < 3) return
      setLengthPoints([])
      setLengthMeasure(null)
      setPlanPixels([])
      setPlanHoles([])
      setAreaPoints([])
      appendRegionPick({
        space: 'world',
        outline: payload.vertices,
        holes: payload.holes,
        area: payload.area,
        perimeter: payload.perimeter,
      })
    },
    [appendRegionPick],
  )

  const onPlanPixelClick = useCallback(
    (pixel: Point2D) => {
      const ppu = measurePngMapping?.pixelsPerUnit
      if (!ppu) return
      if (tool === 'area') {
        setPlanHoles([])
        setRegionPicks([])
        setPlanPixels((prev) => [...prev, pixel])
        return
      }
      if (tool === 'length') {
        setPlanPixels((prev) => {
          if (prev.length === 0) {
            setLengthMeasure(null)
            return [pixel]
          }
          if (prev.length === 1) {
            const w0 = planPixelToWorld(measurePngMapping!, prev[0])
            const w1 = planPixelToWorld(measurePngMapping!, pixel)
            setLengthMeasure(measureBetween(w0, w1))
            setLengthPoints([w0, w1])
            return [prev[0], pixel]
          }
          setLengthMeasure(null)
          setLengthPoints([])
          return [pixel]
        })
      }
    },
    [tool, measurePngMapping],
  )

  const onLengthClick = useCallback((point: Point2D) => {
    setLengthPoints((prev) => {
      if (prev.length === 0) {
        setLengthMeasure(null)
        return [point]
      }
      if (prev.length === 1) {
        const measure = measureBetween(prev[0], point)
        setLengthMeasure(measure)
        return [prev[0], point]
      }
      setLengthMeasure(null)
      return [point]
    })
  }, [])

  const onAreaClick = useCallback((point: Point2D) => {
    setRegionPicks([])
    setAreaPoints((prev) => [...prev, point])
  }, [])

  const canPlan = planExpected || hasRaster
  const measuring = tool !== null
  const measureOnPlan = measuring && hasRaster
  const planClosed = planPixels.length >= 3
  const areaClosed = measureOnPlan ? planClosed : areaPoints.length >= 3
  const regionClosed = tool === 'region' && regionPicks.length > 0
  const showRegionDetails = regionDetailsOpen || !isNarrowViewport

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 719px), (max-height: 520px)')
    const sync = () => {
      const compact = mq.matches
      setIsNarrowViewport(compact)
      if (!compact) setRegionDetailsOpen(true)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const prev = regionPickCountRef.current
    regionPickCountRef.current = regionPicks.length
    if (regionPicks.length === 0) {
      if (isNarrowViewport && tool === 'region') setRegionDetailsOpen(false)
      return
    }
    // Новая заливка на телефоне — свернуть панель, чтобы сразу видеть чертёж
    if (regionPicks.length > prev && isNarrowViewport) {
      setRegionDetailsOpen(false)
    }
  }, [regionPicks.length, isNarrowViewport, tool])

  const areaClosedPrevRef = useRef(false)
  useEffect(() => {
    const wasClosed = areaClosedPrevRef.current
    areaClosedPrevRef.current = areaClosed
    if (tool === 'area' && areaClosed && !wasClosed && isNarrowViewport) {
      setRegionDetailsOpen(false)
    }
    if (tool === 'area' && !areaClosed && isNarrowViewport) {
      setRegionDetailsOpen(false)
    }
  }, [areaClosed, isNarrowViewport, tool])
  const unitsForMeasure = measureOnPlan && measureScaleReady ? planInsUnits : drawingInsUnits
  const ppu = measurePngMapping?.pixelsPerUnit ?? 0
  const areaValueRaw =
    measureOnPlan && ppu > 0 && planClosed
      ? planPixelArea(planPixels, ppu)
      : areaClosed
        ? polygonArea(areaPoints)
        : 0
  const perimeterRaw =
    measureOnPlan && ppu > 0
      ? planPixelPerimeter(planPixels, ppu, planClosed)
      : polygonPerimeter(areaPoints, areaClosed)
  const areaValue = drawingAreaToSquareMeters(areaValueRaw, unitsForMeasure)
  const perimeterValue = drawingLengthToMeters(perimeterRaw, unitsForMeasure)
  const regionRows = regionPicks.map((r, index) => ({
    id: r.id,
    index,
    area: drawingAreaToSquareMeters(r.area, unitsForMeasure),
    perimeter: drawingLengthToMeters(r.perimeter, unitsForMeasure),
    color: REGION_PALETTE[index % REGION_PALETTE.length].stroke,
    rings:
      r.space === 'plan' && ppu > 0
        ? regionPerimeterRingsMeters({
            outline: r.outline,
            holes: r.holes,
            space: 'plan',
            insUnits: unitsForMeasure,
            pixelsPerUnit: ppu,
          })
        : r.space === 'world'
          ? regionPerimeterRingsMeters({
              outline: r.outline,
              holes: r.holes,
              space: 'world',
              insUnits: unitsForMeasure,
              pixelsPerUnit: 1,
            })
          : ([] as PerimeterRing[]),
  }))
  const regionAreaSum = regionRows.reduce((s, r) => s + r.area, 0)
  const regionPerimeterSum = regionRows.reduce((s, r) => s + r.perimeter, 0)
  const orderAreaM2 =
    tool === 'region' ? regionAreaSum : tool === 'area' && areaClosed ? areaValue : 0
  const orderPerimeterM =
    tool === 'region'
      ? regionPerimeterSum
      : tool === 'area' && areaClosed
        ? perimeterValue
        : 0
  const asphaltOrder =
    materialKind === 'asphalt' && orderAreaM2 > 0
      ? calcAsphaltOrder(orderAreaM2, {
          binderCm: asphaltBinderCm,
          wearingCm: asphaltWearingCm,
          binderMixId: asphaltMixId,
          wearingMixId: asphaltMixId,
        })
      : null
  const soilOrder =
    materialKind === 'soil' && orderAreaM2 > 0
      ? calcSoilOrder(orderAreaM2, soilThicknessCm)
      : null
  const curbConcreteOrder =
    materialKind === 'curbConcrete' && orderPerimeterM > 0
      ? calcCurbConcreteOrder(orderPerimeterM, curbLockCm, concreteGrade)
      : null
  const crushedStoneOrder =
    materialKind === 'crushedStone' && orderAreaM2 > 0
      ? calcCrushedStoneOrder(orderAreaM2, crushedStoneCm, crushedStoneFraction)
      : null
  const sandOrder =
    materialKind === 'sand' && orderAreaM2 > 0 ? calcSandOrder(orderAreaM2, sandCm) : null
  const lengthReadout =
    measureOnPlan && ppu > 0 && planPixels.length >= 2
      ? formatLinear(
          drawingLengthToMeters(planPixelDistance(planPixels[0], planPixels[1], ppu), unitsForMeasure),
        )
      : lengthMeasure
        ? formatLinear(drawingLengthToMeters(lengthMeasure.distance, unitsForMeasure))
        : null
  const planActive = !measuring
  const lengthActive = tool === 'length'
  const areaActive = tool === 'area'
  const regionActive = tool === 'region'
  const hasMeasureData =
    planPixels.length > 0 ||
    lengthPoints.length > 0 ||
    Boolean(lengthMeasure) ||
    areaPoints.length > 0 ||
    regionPicks.length > 0
  const showReset = measuring && hasMeasureData
  const regionToolReady = dxfReady
  const showRaster = hasRaster
  const showVectorVisible = measuring && dxfReady && !hasRaster
  const showPlanLoading = planExpected && !hasRaster && !measuring
  const showPlanFailed =
    preferPlan && !hasRaster && pngState === 'failed' && !measuring
  const showMeasureBanner = !hasRaster && pngState === 'failed' && !measuring

  useEffect(() => {
    if (pngState === 'failed' && dxfReady && !hasRaster && tool === null) {
      setTool('length')
    }
  }, [pngState, dxfReady, hasRaster, tool])

  useEffect(() => {
    if (!tool) return
    const fit = () => {
      const viewer = cadRef.current?.getViewer()
      if (!viewer) return
      prepareCadViewerDocument(viewer)
      if (!hasRaster) {
        viewer.resize()
        viewer.fitToView()
      }
    }
    const t0 = requestAnimationFrame(fit)
    const t1 = window.setTimeout(fit, 80)
    const t2 = window.setTimeout(fit, 280)
    return () => {
      cancelAnimationFrame(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [tool, hasRaster, cadRef, dxfText])

  // Вектор на весь экран: подогнать по центру при появлении, при ресайзе только resize (не сбрасывать зум)
  useEffect(() => {
    if (!showVectorVisible) return
    const wrap = wrapRef.current
    if (!wrap) return
    const center = () => {
      const viewer = cadRef.current?.getViewer()
      if (!viewer) return
      prepareCadViewerDocument(viewer)
      viewer.resize()
      viewer.fitToView()
    }
    center()
    const t1 = window.setTimeout(center, 120)
    const t2 = window.setTimeout(center, 360)
    const ro = new ResizeObserver(() => {
      const viewer = cadRef.current?.getViewer()
      if (!viewer) return
      viewer.resize()
    })
    ro.observe(wrap)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      ro.disconnect()
    }
  }, [showVectorVisible, cadRef, wrapRef, dxfText])

  const measureOverlayEl =
    measuring && tool ? (
      <MeasureOverlay
        wrapRef={wrapRef}
        cadRef={cadRef}
        rasterRef={rasterRef}
        syncPlan={measureOnPlan}
        scaleReady={measureScaleReady}
        pngMapping={measurePngMapping}
        rasterView={rasterView}
        planPixels={planPixels}
        planHoles={planHoles}
        regionPicks={regionPicks}
        snapWorldPoints={snapWorldPoints}
        onPlanPixelClick={onPlanPixelClick}
        onPlanRegionPick={onPlanRegionPick}
        onWorldRegionPick={onWorldRegionPick}
        getDxfDocument={getDxfDocument}
        mode={tool}
        lengthPoints={lengthPoints}
        lengthMeasure={lengthMeasure}
        areaPoints={areaPoints}
        onLengthClick={onLengthClick}
        onAreaClick={onAreaClick}
        insUnits={unitsForMeasure}
        pixelsPerUnit={ppu}
      />
    ) : null

  const materialOrderPanel = (
    <DwgMaterialOrderPanel
      materialKind={materialKind}
      onMaterialKind={setMaterialKind}
      asphaltBinderCm={asphaltBinderCm}
      onAsphaltBinderCm={setAsphaltBinderCm}
      asphaltWearingCm={asphaltWearingCm}
      onAsphaltWearingCm={setAsphaltWearingCm}
      asphaltMixId={asphaltMixId}
      onAsphaltMixId={setAsphaltMixId}
      soilThicknessCm={soilThicknessCm}
      onSoilThicknessCm={setSoilThicknessCm}
      curbLockCm={curbLockCm}
      onCurbLockCm={setCurbLockCm}
      concreteGrade={concreteGrade}
      onConcreteGrade={setConcreteGrade}
      crushedStoneCm={crushedStoneCm}
      onCrushedStoneCm={setCrushedStoneCm}
      crushedStoneFraction={crushedStoneFraction}
      onCrushedStoneFraction={setCrushedStoneFraction}
      sandCm={sandCm}
      onSandCm={setSandCm}
      asphaltOrder={asphaltOrder}
      soilOrder={soilOrder}
      curbConcreteOrder={curbConcreteOrder}
      crushedStoneOrder={crushedStoneOrder}
      sandOrder={sandOrder}
    />
  )

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label="Инструменты чертежа">
        <div className={styles.toolGroup}>
          {canPlan ? (
            <button
              type="button"
              className={`${styles.toolBtn} ${planActive ? styles.toolBtnActive : ''}`}
              aria-pressed={planActive}
              onPointerDown={(e) => e.preventDefault()}
              onClick={selectPlan}
            >
              План
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.toolBtn} ${lengthActive ? styles.toolBtnActive : ''}`}
            aria-pressed={lengthActive}
            disabled={!dxfReady}
            title={!dxfReady ? 'Дождитесь загрузки чертежа' : 'Измерить отрезок'}
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectLengthTool}
          >
            Линейка
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${areaActive ? styles.toolBtnActive : ''}`}
            aria-pressed={areaActive}
            disabled={!dxfReady}
            title={!dxfReady ? 'Дождитесь загрузки чертежа' : 'Измерить площадь контура'}
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectAreaTool}
          >
            Площадь
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${regionActive ? styles.toolBtnActive : ''}`}
            aria-pressed={regionActive}
            disabled={!regionToolReady}
            title={
              !dxfReady
                ? 'Дождитесь загрузки чертежа'
                : hasRaster
                  ? 'Измерить площадь и периметр цветной заливки плана'
                  : 'Измерить площадь и периметр заливки HATCH (текст и размеры не учитываются)'
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectRegionTool}
          >
            Заливка
          </button>
        </div>
        {showReset ? (
          <>
            <span className={styles.toolSep} aria-hidden />
            <button
              type="button"
              className={styles.toolBtnGhost}
              onPointerDown={(e) => e.preventDefault()}
              onClick={resetMeasures}
            >
              Сбросить
            </button>
          </>
        ) : null}
      </div>

      <div className={styles.stage}>
        {showPlanLoading ? (
          <p className={styles.planLoading}>
            {pngState === 'loading'
              ? 'Рисуем цветной план (как в AutoCAD)…'
              : 'Загружаем план…'}
          </p>
        ) : null}

        {showPlanFailed ? (
          <div className={styles.planFailed}>
            <p className={styles.planLoading}>
              Цветной план для этого DWG недоступен. Переключаем на измерения по контурам…
            </p>
          </div>
        ) : null}

        {showMeasureBanner ? (
          <p className={styles.vectorHint}>
            Режим измерений: «Линейка», «Площадь», «Заливка» (заливки HATCH на чертеже;
            цифры и размеры не выбираются).
          </p>
        ) : null}

        {showRaster && pngUrl ? (
          <div
            className={`${styles.rasterLayer} ${measureOnPlan ? styles.rasterLayerMeasure : ''}`}
          >
            <DwgRasterViewer
              ref={rasterRef}
              url={pngUrl}
              label={drawingName}
              onBlank={onRasterBlank}
              onViewChange={setRasterView}
              overlay={measureOnPlan ? measureOverlayEl : null}
            />
          </div>
        ) : null}

        {dxfReady ? (
          <div
            className={
              measureOnPlan
                ? styles.vectorMeasureOnPlan
                : showVectorVisible
                  ? styles.vectorLayer
                  : styles.vectorHidden
            }
          >
            <CadViewer
              ref={cadRef}
              file={dxfText}
              theme="dark"
              tool="pan"
              options={{
                minZoom: 0.001,
                maxZoom: 2000,
                zoomSpeed: 1.035,
                backgroundColor: measureOnPlan ? 'transparent' : '#2b2b2b',
              }}
              onLayersLoaded={handleLayersLoaded}
              style={{ width: '100%', height: '100%' }}
            />

            {!measureOnPlan ? measureOverlayEl : null}
          </div>
        ) : null}

        {measuring && tool === 'length' && lengthReadout ? (
          <div className={styles.readout} aria-live="polite">
            <p className={styles.readoutTitle}>Длина</p>
            <p className={styles.readoutValue}>{lengthReadout}</p>
            <p className={styles.readoutHint}>Точки под курсором. Тяните — сдвиг чертежа</p>
          </div>
        ) : null}

        {measuring && tool === 'area' ? (
          <div
            className={`${styles.readout} ${areaClosed && isNarrowViewport && !showRegionDetails ? styles.readoutCompact : ''} ${areaClosed && isNarrowViewport && showRegionDetails ? styles.readoutExpanded : ''}`}
            aria-live="polite"
          >
            {areaClosed ? (
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>Площадь участка</p>
                {isNarrowViewport ? (
                  <button
                    type="button"
                    className={styles.readoutToggle}
                    aria-expanded={showRegionDetails}
                    aria-controls="area-readout-details"
                    onClick={() => setRegionDetailsOpen((open) => !open)}
                  >
                    {showRegionDetails ? 'Свернуть' : 'Детали'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className={styles.readoutTitle}>Площадь участка</p>
            )}
            {areaPoints.length === 0 && planPixels.length === 0 ? (
              <p className={styles.readoutHint}>
                {measureOnPlan && !measureScaleReady
                  ? 'Загружаем масштаб плана…'
                  : measureOnPlan
                    ? 'Клик — угол контура (привязка к геометрии). С 3-й точки — площадь'
                    : 'Клик — угол контура (привязка к геометрии). С 3-й точки — площадь'}
              </p>
            ) : (
              <>
                <dl className={styles.readoutGrid}>
                  {areaClosed ? (
                    <div>
                      <dt>Площадь</dt>
                      <dd>{formatArea(areaValue)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{areaClosed ? 'Периметр' : 'Длина контура'}</dt>
                    <dd>{formatLinear(perimeterValue)}</dd>
                  </div>
                  <div>
                    <dt>Точек</dt>
                    <dd>{measureOnPlan ? planPixels.length : areaPoints.length}</dd>
                  </div>
                </dl>
                {areaClosed && showRegionDetails ? (
                  <div id="area-readout-details">
                    {materialOrderPanel}
                    <p className={styles.readoutHint}>
                      «Сбросить» — новый контур
                    </p>
                  </div>
                ) : (
                  <p className={styles.readoutHint}>
                    {areaClosed
                      ? '«Детали» — расчёт заказа. «Сбросить» — новый контур'
                      : 'Ещё точка — замкнёт контур и покажет площадь'}
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        {measuring && tool === 'region' ? (
          <div
            className={`${styles.readout} ${regionClosed && isNarrowViewport && !showRegionDetails ? styles.readoutCompact : ''} ${regionClosed && isNarrowViewport && showRegionDetails ? styles.readoutExpanded : ''}`}
            aria-live="polite"
          >
            {regionClosed ? (
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>
                  Заливки · {regionPicks.length}
                </p>
                {isNarrowViewport ? (
                  <button
                    type="button"
                    className={styles.readoutToggle}
                    aria-expanded={showRegionDetails}
                    aria-controls="region-readout-details"
                    onClick={() => setRegionDetailsOpen((open) => !open)}
                  >
                    {showRegionDetails ? 'Свернуть' : 'Детали'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className={styles.readoutTitle}>Заливка</p>
            )}
            {!regionClosed ? (
              <p className={styles.readoutHint}>
                {measureOnPlan && !measureScaleReady
                  ? 'Загружаем масштаб плана…'
                  : measureOnPlan
                    ? 'Укажите цветную заливку на плане — можно выбрать несколько'
                    : 'Укажите заливку HATCH на чертеже — можно выбрать несколько'}
              </p>
            ) : (
              <>
                <ul className={styles.regionList}>
                  {regionRows.map((row) => (
                    <li key={row.id} className={styles.regionListItem}>
                      <div className={styles.regionHeader}>
                        <span
                          className={styles.regionBadge}
                          style={{ background: row.color }}
                          aria-hidden
                        >
                          {row.index + 1}
                        </span>
                        <div className={styles.regionMetrics}>
                          <span>
                            <em>S</em> {formatArea(row.area)}
                          </span>
                          <span>
                            <em>P</em> {formatLinear(row.perimeter)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.regionRemove}
                          aria-label={`Удалить заливку ${row.index + 1}`}
                          onClick={() => removeRegionPick(row.id)}
                        >
                          ×
                        </button>
                      </div>
                      {showRegionDetails && row.rings.length > 0 ? (
                        <div className={styles.regionEdges}>
                          {row.rings.map((ring) => (
                            <div
                              key={ring.kind === 'outer' ? 'outer' : `hole-${ring.holeIndex}`}
                              className={styles.regionEdgeGroup}
                            >
                              <p className={styles.regionEdgesTitle}>
                                {ring.kind === 'outer'
                                  ? 'Линии и дуги'
                                  : `Вырез ${ring.holeIndex}`}
                              </p>
                              <ul className={styles.regionEdgeList}>
                                {ring.edges.map((edge) => (
                                  <li key={edge.side} className={styles.regionEdgeItem}>
                                    <span
                                      className={styles.regionEdgeSide}
                                      style={{ background: edgeSideColor(edge.side), color: '#0b1222' }}
                                    >
                                      {edge.side}
                                    </span>
                                    <span className={styles.regionEdgeKind}>
                                      {edge.shape === 'arc' ? 'дуга' : 'линия'}
                                    </span>
                                    <span className={styles.regionEdgeLen}>
                                      {formatLinear(edge.lengthM)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {regionRows.length > 1 ? (
                  <p className={styles.regionSum}>
                    Сумма площадей: <strong>{formatArea(regionAreaSum)}</strong>
                  </p>
                ) : null}

                {showRegionDetails ? (
                  <div id="region-readout-details">
                    {materialOrderPanel}

                    <p className={styles.readoutHint}>
                      Укажите другую заливку для добавления. «Сбросить» — очистить всё
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {measuring && tool === 'length' && !lengthReadout ? (
          <p className={styles.toolHint}>
            {measureOnPlan && !measureScaleReady
              ? 'Загружаем масштаб плана…'
              : lengthPoints.length === 0 && planPixels.length === 0
                ? 'Клик — первая точка. Тяните — сдвиг чертежа'
                : 'Клик — вторая точка'}
          </p>
        ) : null}
      </div>
    </>
  )
}
