import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  screenPointFromMouse,
  worldPointFromMouse,
} from '../../lib/dwgMeasureFormat'
import { pickPlanRegionAtScreen, maskOverlayBitSize, lastPickDebug, type RegionMaskOverlay } from '../../lib/dwgPngRegionPick'
import { findRegionAtWorldPoint, pointInPolygon } from '../../lib/dwgRegionPick'
import { PinchTracker } from '../../lib/touchPinchZoom'
import {
  paintRegionMaskOverlays,
  rasterDevicePixelRatio,
  rasterPlanWorldToScreen,
  type PngWorldMapping,
  type RasterViewState,
} from '../../lib/dwgRasterMeasure'
import { pngMetaToMapping, type PngPreviewWorldMeta } from '../../lib/dwgPngBounds'
import {
  collectDxfSnapPoints,
  collectDxfSnapSegments,
  findClosestEdgeInsertScreen,
  imagePixelToScreen,
  planClickToImagePixel,
  planPixelArea,
  planPixelDistance,
  planPixelPerimeter,
  planPixelPointsToScreenPolyline,
  planPixelToWorld,
  pointerOnStage,
  simplifyPolylinePoints,
  type DxfSnapSegment,
} from '../../lib/dwgPlanMeasure'
import {
  drawingAreaToSquareMeters,
  drawingLengthToMeters,
} from '../../lib/dwgDrawingUnits'
import {
  calcAsphaltOrder,
  calcCrushedStoneOrder,
  calcSandOrder,
  calcSoilOrder,
  DEFAULT_ASPHALT_WEARING_MIX,
  DEFAULT_CRUSHED_STONE_FRACTION,
  DEFAULT_LAYER_THICKNESS_CM,
  type AsphaltMixId,
  type CrushedStoneFraction,
} from '../../lib/dwgMaterialOrder'
import { downloadDwgPlanMarksExcel } from '../../lib/downloadDwgPlanMarksExcel'
import {
  deleteDwgPlanMarkAndSync,
  DWG_PLAN_MARK_KINDS,
  DWG_PLAN_MARK_KIND_SHORT,
  filterDwgPlanMarks,
  formatDwgPlanMarkLabel,
  listDwgPlanMarks,
  markCentroid,
  markKindMeta,
  isUsablePlanMap,
  nextDwgPlanMarkNumber,
  rescalePlanMarksForImage,
  syncDwgPlanMarksFromServer,
  upsertDwgPlanMark,
  upsertDwgPlanMarkAndSync,
  persistDwgPlanMarks,
  type DwgPlanMark,
  type DwgPlanMarkKind,
  type DwgPlanMarkMap,
  type DwgPlanMarkSpace,
} from '../../lib/dwgPlanMarksRepository'
import {
  ckkbHandoverFolderName,
  kindNeedsHandoverDoc,
  resolveSiteDisplayName,
  uploadCkkbHandoverDocs,
} from '../../lib/ckkbHandoverDocs'
import { loadLocalSession } from '../../lib/localSession'
import { DwgMaterialOrderPanel, DwgZoneStatusSection } from './DwgMaterialOrderPanel'
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
  /** Для хранения отметок на плане */
  siteId?: string
  fileId?: string
  /** Имя объекта — для папки «Сдача ЦККБ …» */
  siteName?: string
}

const DRAG_THRESHOLD_PX = 5
const DRAG_THRESHOLD_TOUCH_PX = 10
const LONG_PRESS_MS = 220
const LONG_PRESS_TOUCH_MS = 380
const LONG_PRESS_MOVE_PX = 18
const LONG_PRESS_MOVE_TOUCH_PX = 28
const VERTEX_HIT_RADIUS_PX = 14
const EDGE_INSERT_HIT_PX = 14
const MAX_REGION_EDIT_VERTICES = 64
const VERTEX_DRAG_THRESHOLD_PX = 3
const VERTEX_DOUBLE_TAP_MS = 450
const FLING_MIN_SPEED = 0.045

type MeasureVertexRef = { space: 'plan' | 'world'; index: number; regionId?: string }

type RegionPickItem = {
  id: string
  space: 'plan' | 'world'
  outline: Point2D[]
  holes: Point2D[][]
  /** Площадь для расчётов — по числу пикселей маски (эталон). */
  area: number
  perimeter: number
  /** Пиксели маски flood fill; area = pixelCount / ppu² на плане. */
  pixelCount?: number
  /** Пиксель-точная заливка оверлея (кроп маски PNG). */
  maskOverlay?: RegionMaskOverlay
}

const REGION_PALETTE = [
  { fill: 'rgba(14, 165, 233, 0.48)', stroke: '#0ea5e9', label: '#e0f2fe' },
  { fill: 'rgba(16, 185, 129, 0.48)', stroke: '#10b981', label: '#d1fae5' },
  { fill: 'rgba(245, 158, 11, 0.48)', stroke: '#f59e0b', label: '#fef3c7' },
  { fill: 'rgba(236, 72, 153, 0.48)', stroke: '#ec4899', label: '#fce7f3' },
  { fill: 'rgba(239, 68, 68, 0.48)', stroke: '#ef4444', label: '#fee2e2' },
  { fill: 'rgba(6, 182, 212, 0.48)', stroke: '#06b6d4', label: '#cffafe' },
] as const

function maskOverlayCentroid(mask: RegionMaskOverlay): Point2D {
  const { bitW, bitH } = maskOverlayBitSize(mask)
  let sumX = 0
  let sumY = 0
  let n = 0
  const sx = mask.width / bitW
  const sy = mask.height / bitH
  for (let y = 0; y < bitH; y++) {
    const row = y * bitW
    for (let x = 0; x < bitW; x++) {
      if (!mask.bits[row + x]) continue
      sumX += mask.minX + (x + 0.5) * sx
      sumY += mask.minY + (y + 0.5) * sy
      n += 1
    }
  }
  if (n === 0) {
    return { x: mask.minX + mask.width / 2, y: mask.minY + mask.height / 2 }
  }
  return { x: sumX / n, y: sumY / n }
}

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

function ToolIcon({
  name,
}: {
  name: 'plan' | 'measure' | 'marks' | 'marker' | 'resetLast' | 'undo' | 'trash' | 'addPoint'
}) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }
  switch (name) {
    case 'plan':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="M3 9h18M9 3v18" opacity={0.9} />
          <circle cx="15.5" cy="15.5" r="2" fill="currentColor" stroke="none" opacity={0.85} />
        </svg>
      )
    case 'measure':
      // линейка + контур площади
      return (
        <svg {...common}>
          <path d="M4 16.5 12 8.5" />
          <path d="M4 16.5h3M12 8.5v3" />
          <path d="M13 18 16 7h4l2 11Z" opacity={0.95} />
          <circle cx="16" cy="7" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="20" cy="7" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'marks':
      // речь / пин
      return (
        <svg {...common}>
          <path d="M12 21s-6.5-4.35-6.5-9.2A6.5 6.5 0 0 1 12 5a6.5 6.5 0 0 1 6.5 6.8C18.5 16.65 12 21 12 21Z" />
          <circle cx="12" cy="11.2" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'marker':
      return (
        <svg {...common}>
          <path d="M15.5 3.5 20 8l-9.5 9.5H6v-4.5L15.5 3.5Z" />
          <path d="M13.2 5.8 17.7 10.3" />
          <path d="M4 20h16" opacity={0.85} />
        </svg>
      )
    case 'resetLast':
      // Backspace — убрать последнее (зона / измерение)
      return (
        <svg {...common}>
          <path d="M8.5 6.5h11.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H8.5a1.5 1.5 0 0 1-1.05-.44l-4.45-3.56a1.2 1.2 0 0 1 0-1.88l4.45-3.56a1.5 1.5 0 0 1 1.05-.44Z" />
          <path d="M13.5 10.5 17 14M17 10.5 13.5 14" strokeWidth={2.35} />
        </svg>
      )
    case 'undo':
      return (
        <svg {...common}>
          <path d="M9 7H5v4" />
          <path d="M5 11a7 7 0 1 0 1.4 4.2" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l.8 11h6.4L16 7" />
        </svg>
      )
    case 'addPoint':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
  }
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

const MARK_POINT_HIT_PLAN_PX = 22

function markIntersectsRegionPick(mark: DwgPlanMark, pick: RegionPickItem): boolean {
  if (mark.space !== pick.space) return false
  if (pick.outline.length < 3) return false
  if (mark.shape.type === 'point') {
    return pointInPolygon({ x: mark.shape.x, y: mark.shape.y }, pick.outline)
  }
  if (mark.shape.type === 'stroke') {
    const pts = mark.shape.points
    if (pts.length === 0) return false
    if (pointInPolygon(markCentroid(mark), pick.outline)) return true
    return pts.some((p) => pointInPolygon(p, pick.outline))
  }
  if (mark.shape.outline.length < 3) return false
  const mc = markCentroid(mark)
  if (pointInPolygon(mc, pick.outline)) return true
  if (pointInPolygon(regionCentroid(pick.outline), mark.shape.outline)) return true
  return mark.shape.outline.some((p) => pointInPolygon(p, pick.outline))
}

const MARK_POINT_HIT_SCREEN_PX = 28

function findMarkAtPoint(
  marks: readonly DwgPlanMark[],
  point: Point2D,
  space: DwgPlanMarkSpace,
  hitPlanPx = MARK_POINT_HIT_PLAN_PX,
): DwgPlanMark | null {
  // planMarks уже newest-first — идём с начала, чтобы попасть в верхний штрих.
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!
    if (mark.space !== space) continue
    if (mark.shape.type === 'point') {
      if (Math.hypot(mark.shape.x - point.x, mark.shape.y - point.y) <= hitPlanPx) {
        return mark
      }
      continue
    }
    if (mark.shape.type === 'stroke') {
      const hitR = Math.max(hitPlanPx * 1.35, 8)
      const pts = mark.shape.points
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j]!
        if (Math.hypot(p.x - point.x, p.y - point.y) <= hitR) return mark
        const next = pts[j + 1]
        if (!next) continue
        // Попадание в отрезок линии — удобнее тапнуть по букве/штриху.
        const dx = next.x - p.x
        const dy = next.y - p.y
        const len2 = dx * dx + dy * dy
        if (len2 < 1e-6) continue
        let t = ((point.x - p.x) * dx + (point.y - p.y) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        const cx = p.x + t * dx
        const cy = p.y + t * dy
        if (Math.hypot(cx - point.x, cy - point.y) <= hitR) return mark
      }
      continue
    }
    if (mark.shape.outline.length >= 3 && pointInPolygon(point, mark.shape.outline)) {
      return mark
    }
  }
  return null
}

function markHitPlanPx(scale: number): number {
  const s = scale > 0.0001 ? scale : 1
  return Math.max(10 / s, MARK_POINT_HIT_SCREEN_PX / s)
}

function formatMarkDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Нижняя панель на телефоне: peek или фиксированный лист со скроллом внутри. */
function MobileMeasureSheet({
  open,
  onToggle,
  peekLabel,
  peekValue,
  toolbar,
  children,
  className = '',
  bodyRef,
}: {
  open: boolean
  onToggle: () => void
  peekLabel: string
  peekValue: string
  toolbar?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyRef?: React.Ref<HTMLDivElement>
}) {
  const scrollFocusIntoBody = (t: HTMLElement) => {
    window.requestAnimationFrame(() => {
      t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
  }

  return (
    <div
      className={`${styles.mobileMeasureSheet} ${open ? styles.mobileMeasureSheetOpen : styles.mobileMeasureSheetClosed} ${className}`}
      aria-live="polite"
      data-testid="dwg-mobile-sheet"
      data-open={open ? 'true' : 'false'}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={styles.mobileSheetHead}
        aria-expanded={open}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <span className={styles.mobileSheetHandleBar} aria-hidden />
        <span className={styles.mobileSheetHeadMain}>
          <span className={styles.mobileSheetPeek}>
            <span className={styles.mobileSheetPeekLabel}>{peekLabel}</span>
            <span className={styles.mobileSheetPeekValue}>{peekValue}</span>
          </span>
          <span className={styles.mobileSheetChevron}>{open ? 'Свернуть' : 'Открыть'}</span>
        </span>
      </button>
      {open ? (
        <div
          ref={bodyRef}
          className={styles.mobileSheetBody}
          onFocusCapture={(e) => {
            const t = e.target
            if (!(t instanceof HTMLElement)) return
            if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') return
            scrollFocusIntoBody(t)
          }}
        >
          {toolbar ? <div className={styles.mobileSheetToolbar}>{toolbar}</div> : null}
          {children}
        </div>
      ) : null}
    </div>
  )
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
  regionPicks?: RegionPickItem[]
  /** Выбранные заливки для статуса — подсветка на плане. */
  selectedRegionIds?: readonly string[]
  planMarks?: DwgPlanMark[]
  focusedMarkId?: string | null
  snapWorldPoints?: Point2D[]
  snapSegments?: readonly DxfSnapSegment[]
  onPlanPixelClick?: (pixel: Point2D) => void
  onPlanPixelInsert?: (insertIndex: number, pixel: Point2D) => void
  onWorldPointInsert?: (insertIndex: number, point: Point2D) => void
  onMarkPlace?: (point: Point2D, space: 'plan' | 'world') => void
  onPlanRegionPick?: (payload: {
    pixels: Point2D[]
    holes: Point2D[][]
    area: number
    perimeter: number
    maskBBox?: { minX: number; minY: number; maxX: number; maxY: number }
    pixelCount?: number
    maskOverlay?: RegionMaskOverlay
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
  onWorldMeasureClick: (point: Point2D) => void
  selectedVertex?: MeasureVertexRef | null
  onVertexSelect?: (vertex: MeasureVertexRef | null) => void
  onPlanPixelMove?: (index: number, pixel: Point2D) => void
  onWorldPointMove?: (index: number, point: Point2D) => void
  onRegionOutlineMove?: (regionId: string, index: number, point: Point2D) => void
  onRegionOutlineInsert?: (regionId: string, insertIndex: number, point: Point2D) => void
  onVertexDelete?: (vertex: MeasureVertexRef) => void
  touchLarge?: boolean
  /** Pan/pinch — свернуть нижние панели на телефоне. */
  onNavigate?: () => void
  /** Готовый штрих маркера (координаты плана/мира). */
  onMarkerStrokeComplete?: (points: Point2D[]) => void
  onMarkerDrawingChange?: (drawing: boolean) => void
  /** Инкремент — отменить текущие чернила (Сбросить). */
  markerInkCancel?: number
  /** Короткий тап маркером — комментарий к уже нарисованному. */
  onMarkerTap?: (point: Point2D) => void
  showEdgeDimensions?: boolean
  insUnits?: number
  pixelsPerUnit?: number
  /** Клик по плану сразу выделяет заливку (не ставит точку). */
  fillByClick?: boolean
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

function smoothStrokePath(points: readonly Point2D[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]!
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} l 0.01 0`
  }
  if (points.length === 2) {
    const a = points[0]!
    const b = points[1]!
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  }
  let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const n = points[i + 1]!
    const mx = (p.x + n.x) / 2
    const my = (p.y + n.y) / 2
    d += ` Q ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
  }
  const last = points[points.length - 1]!
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`
  return d
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
  selectedRegionIds = [],
  planMarks = [],
  focusedMarkId = null,
  snapWorldPoints = [],
  snapSegments = [],
  onPlanPixelClick,
  onPlanPixelInsert,
  onWorldPointInsert,
  onMarkPlace,
  onPlanRegionPick,
  onWorldRegionPick,
  getDxfDocument,
  mode,
  lengthPoints,
  lengthMeasure,
  areaPoints,
  onWorldMeasureClick,
  selectedVertex = null,
  onVertexSelect,
  onPlanPixelMove,
  onWorldPointMove,
  onRegionOutlineMove,
  onRegionOutlineInsert,
  onVertexDelete,
  touchLarge = false,
  onNavigate,
  onMarkerStrokeComplete,
  onMarkerDrawingChange,
  markerInkCancel = 0,
  onMarkerTap,
  showEdgeDimensions = false,
  insUnits = 6,
  pixelsPerUnit = 0,
  fillByClick = false,
}: MeasureOverlayProps) {
  const areaClosed = areaPoints.length >= 3
  const svgRef = useRef<SVGSVGElement>(null)
  const markerCanvasRef = useRef<HTMLCanvasElement>(null)
  const regionMaskCanvasRef = useRef<HTMLCanvasElement>(null)
  const markerInkRef = useRef<{
    points: Point2D[]
    lastX: number
    lastY: number
    active: boolean
  } | null>(null)
  const onMarkerStrokeCompleteRef = useRef(onMarkerStrokeComplete)
  const onMarkerDrawingChangeRef = useRef(onMarkerDrawingChange)
  const markerInkCancelPrevRef = useRef(markerInkCancel)
  const [vt, setVt] = useState<ViewTransform | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [viewTick, setViewTick] = useState(0)
  const [holdRing, setHoldRing] = useState<Point2D | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const [pickFlash, setPickFlash] = useState<string | null>(null)
  const pickFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashPickMessage = (text: string) => {
    if (pickFlashTimerRef.current) clearTimeout(pickFlashTimerRef.current)
    setPickFlash(text)
    pickFlashTimerRef.current = setTimeout(() => {
      setPickFlash(null)
      pickFlashTimerRef.current = null
    }, 2400)
  }
  const [maskLayerImages, setMaskLayerImages] = useState<
    Array<{ id: string; href: string; minX: number; minY: number; width: number; height: number }>
  >([])
  const onNavigateRef = useRef(onNavigate)
  useLayoutEffect(() => {
    onMarkerStrokeCompleteRef.current = onMarkerStrokeComplete
    onMarkerDrawingChangeRef.current = onMarkerDrawingChange
    onNavigateRef.current = onNavigate
  })
  const dragThreshold = touchLarge ? DRAG_THRESHOLD_TOUCH_PX : DRAG_THRESHOLD_PX
  const longPressMs = touchLarge ? LONG_PRESS_TOUCH_MS : LONG_PRESS_MS
  const longPressMovePx = touchLarge ? LONG_PRESS_MOVE_TOUCH_PX : LONG_PRESS_MOVE_PX
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    lastT: number
    vx: number
    vy: number
    moved: boolean
    /** Удержание дошло до таймера — точку на отпускании не ставим. */
    longPressFired: boolean
    /** Заливка по удержанию уже сработала. */
    longPressPicked: boolean
    /** После щипка — только pan, без рисования маркера / точки. */
    panOnly?: boolean
  } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef(new PinchTracker())
  const pinchGestureRef = useRef(false)
  const vertexDragRef = useRef<{
    pointerId: number
    target: 'polyline' | 'region'
    space: 'plan' | 'world'
    regionId?: string
    index: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const vertexTapRef = useRef<{ key: string; t: number } | null>(null)

  const vertexHitR = touchLarge ? 24 : VERTEX_HIT_RADIUS_PX
  const edgeHandleHitR = touchLarge ? 16 : 9
  const edgeHandleDotR = touchLarge ? 5 : 3.5
  const edgeInsertHitPx = touchLarge ? 20 : EDGE_INSERT_HIT_PX
  const vertexDotR = touchLarge ? 7 : 5
  const vertexRingR = touchLarge ? 13 : 10

  const handleVertexTap = (vDrag: NonNullable<typeof vertexDragRef.current>) => {
    const vertex: MeasureVertexRef = {
      space: vDrag.space,
      index: vDrag.index,
      regionId: vDrag.regionId,
    }
    const key = `${vDrag.regionId ?? ''}:${vDrag.space}:${vDrag.index}`
    const now = Date.now()
    const wasSelected = isVertexSelected({
      space: vDrag.space,
      index: vDrag.index,
      regionId: vDrag.regionId,
    })
    const last = vertexTapRef.current
    if (
      touchLarge &&
      wasSelected &&
      last?.key === key &&
      now - last.t < VERTEX_DOUBLE_TAP_MS &&
      onVertexDelete
    ) {
      onVertexDelete(vertex)
      vertexTapRef.current = null
      onVertexSelect?.(null)
      return
    }
    onVertexSelect?.(wasSelected ? null : vertex)
    vertexTapRef.current = { key, t: now }
  }

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    setHoldRing(null)
  }

  const planInteract = Boolean(syncPlan)
  const planDraw = planInteract && scaleReady && Boolean(pngMapping)
  const markerMode = mode === 'marker'
  const longPressEnabled =
    !markerMode &&
    mode !== null &&
    ((planDraw && Boolean(onPlanRegionPick)) || (!planInteract && Boolean(onWorldRegionPick)))

  const liveRasterView = () => rasterRef?.current?.getViewState() ?? rasterView
  const liveStage = () => rasterRef?.current?.getStageElement() ?? null

  const resolvePlanPixelFromScreen = (
    sx: number,
    sy: number,
    opts?: { previousPixel?: Point2D; orthoSnap?: boolean; snapToGeometry?: boolean },
  ): Point2D | null => {
    const view = liveRasterView()
    if (!view || !pngMapping || !(syncPlan && scaleReady)) return null
    return planClickToImagePixel(sx, sy, view, pngMapping, snapWorldPoints, {
      previousPixel: opts?.previousPixel,
      orthoSnap: opts?.orthoSnap,
      snapToGeometry: opts?.snapToGeometry,
      snapSegments,
    })
  }

  const resolveWorldPointFromScreen = (clientX: number, clientY: number): Point2D | null => {
    const canvas = wrapRef.current?.querySelector('canvas') ?? null
    const viewer = cadRef.current?.getViewer()
    if (!canvas || !viewer) return null
    return worldPointFromMouse(canvas, viewer.getViewTransform(), clientX, clientY)
  }

  const applyVertexDragAt = (clientX: number, clientY: number, drag: NonNullable<typeof vertexDragRef.current>) => {
    const svg = svgRef.current
    if (!svg) return
    const stage = liveStage()
    const { x: sx, y: sy } = pointerInOverlay(svg, stage, clientX, clientY)
    if (drag.target === 'region' && drag.regionId) {
      if (drag.space === 'plan') {
        const pixel = resolvePlanPixelFromScreen(sx, sy)
        if (pixel) onRegionOutlineMove?.(drag.regionId, drag.index, pixel)
      } else {
        const world = resolveWorldPointFromScreen(clientX, clientY)
        if (world) onRegionOutlineMove?.(drag.regionId, drag.index, world)
      }
      return
    }
    if (drag.space === 'plan') {
      const pixel = resolvePlanPixelFromScreen(sx, sy)
      if (pixel) onPlanPixelMove?.(drag.index, pixel)
      return
    }
    const world = resolveWorldPointFromScreen(clientX, clientY)
    if (world) onWorldPointMove?.(drag.index, world)
  }

  const isVertexSelected = (opts: { space: 'plan' | 'world'; index: number; regionId?: string }) => {
    if (!selectedVertex) return false
    if (selectedVertex.regionId || opts.regionId) {
      return selectedVertex.regionId === opts.regionId && selectedVertex.index === opts.index
    }
    return selectedVertex.space === opts.space && selectedVertex.index === opts.index
  }

  const failPickFlash = (fallback = 'Не удалось выделить — кликните в центр цветной зоны') => {
    const reason = String(lastPickDebug.reason ?? '')
    const hint =
      reason === 'bg'
        ? 'Клик по фону — ткните внутрь цвета'
        : reason === 'tiny' || reason === 'disconnected' || reason === 'stripped'
          ? 'Цвет пёстрый — ткните в середину зоны'
          : reason === 'spill' || reason === 'hatch-too-large'
            ? 'Зона слишком большая для заливки'
            : reason === 'circle-mask' || reason === 'circle-shape'
              ? 'Это не заливка участка'
              : reason
                ? `Не удалось выделить (${reason})`
                : fallback
    flashPickMessage(hint)
    if (typeof console !== 'undefined') {
      console.debug('[measure-fill]', lastPickDebug)
    }
  }

  const tryPickRegionAt = (sx: number, sy: number): boolean => {
    try {
      const view = liveRasterView()
      // Не ждём planDraw: для flood достаточно view + картинки (+ meta если есть).
      if (planInteract && view && onPlanRegionPick) {
        const img = rasterRef?.current?.getImageElement() ?? null
        if (img?.naturalWidth) {
          const mapping: PngWorldMapping =
            pngMapping ??
            ({
              originX: 0,
              originY: 0,
              pixelsPerUnit: 1,
              offsetX: 0,
              offsetY: 0,
              imgH: view.imgH || img.naturalHeight,
            } satisfies PngWorldMapping)
          const pngRegion = pickPlanRegionAtScreen(img, view, mapping, sx, sy, {
            dxfDoc: getDxfDocument?.() ?? null,
          })
          if (pngRegion && pngRegion.pixels.length >= 3) {
            onPlanRegionPick({
              pixels: pngRegion.pixels,
              holes: pngRegion.holes,
              area: pngRegion.area,
              perimeter: pngRegion.perimeter,
              maskBBox: pngRegion.maskBBox,
              pixelCount: pngRegion.pixelCount,
              maskOverlay: pngRegion.maskOverlay
                ? {
                    ...pngRegion.maskOverlay,
                    bits: Uint8Array.from(pngRegion.maskOverlay.bits),
                  }
                : undefined,
            })
            flashPickMessage(`Заливка: ${formatArea(pngRegion.area)}`)
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              navigator.vibrate(12)
            }
            return true
          }
          failPickFlash()
          return false
        }
        flashPickMessage('План ещё грузится — подождите')
        return false
      }

      if (!planInteract && onWorldRegionPick && getDxfDocument) {
        const doc = getDxfDocument()
        const viewer = cadRef.current?.getViewer()
        const liveVt = viewer?.getViewTransform() ?? vt
        if (!doc || !liveVt) {
          failPickFlash()
          return false
        }
        const [wx, wy] = screenToWorld(liveVt, sx, sy)
        const hit = findRegionAtWorldPoint(doc, { x: wx, y: wy })
        if (!hit || hit.vertices.length < 3) {
          failPickFlash()
          return false
        }
        onWorldRegionPick({
          vertices: hit.vertices,
          holes: hit.holes,
          area: hit.area,
          perimeter: hit.perimeter,
        })
        flashPickMessage(`Заливка: ${formatArea(hit.area)}`)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(12)
        }
        return true
      }
      failPickFlash()
      return false
    } catch (err) {
      if (typeof console !== 'undefined') console.debug('[measure-fill] error', err)
      failPickFlash()
      return false
    }
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
  }, [planInteract, rasterView])

  useEffect(() => {
    if (!planInteract) return
    let raf = 0
    let lastKey = ''
    const tick = () => {
      const v = rasterRef?.current?.getViewState() ?? rasterView
      if (v) {
        const key = `${v.x}|${v.y}|${v.scale}|${v.stageW}|${v.stageH}`
        if (key !== lastKey) {
          lastKey = key
          setViewTick((n) => n + 1)
          setSize((s) =>
            s.w === v.stageW && s.h === v.stageH ? s : { w: v.stageW, h: v.stageH },
          )
        }
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [planInteract, rasterRef, rasterView])

  useEffect(() => () => clearLongPress(), [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (planInteract) {
        const stage = rasterRef?.current?.getStageElement() ?? null
        const { x, y } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        rasterRef?.current?.zoomAt(x, y, factor)
        return
      }
      const canvas = wrapRef.current?.querySelector('canvas') ?? null
      const viewer = cadRef.current?.getViewer()
      if (!canvas || !viewer) return
      const sp = screenPointFromMouse(canvas, e.clientX, e.clientY)
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      viewer.handleZoom(sp.x, sp.y, factor)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [planInteract, cadRef, rasterRef, wrapRef, size.w, size.h])

  // iOS: удержание не должно открывать «Копировать» / синее выделение.
  useEffect(() => {
    const host = markerCanvasRef.current?.parentElement
    const svg = svgRef.current
    const targets = [host, svg].filter((el): el is HTMLElement | SVGSVGElement => Boolean(el))
    if (targets.length === 0) return
    const block = (e: Event) => {
      e.preventDefault()
    }
    const clearSel = () => {
      try {
        window.getSelection()?.removeAllRanges()
      } catch {
        /* ignore */
      }
    }
    for (const el of targets) {
      el.addEventListener('selectstart', block)
      el.addEventListener('gesturestart', block as EventListener)
      el.addEventListener('dragstart', block)
      el.addEventListener('touchstart', clearSel, { passive: true })
    }
    return () => {
      for (const el of targets) {
        el.removeEventListener('selectstart', block)
        el.removeEventListener('gesturestart', block as EventListener)
        el.removeEventListener('dragstart', block)
        el.removeEventListener('touchstart', clearSel)
      }
    }
  }, [size.w, size.h, planInteract])

  useEffect(() => {
    if (markerInkCancel === markerInkCancelPrevRef.current) return
    markerInkCancelPrevRef.current = markerInkCancel
    const ink = markerInkRef.current
    markerInkRef.current = null
    if (ink) onMarkerDrawingChangeRef.current?.(false)
    const canvas = markerCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [markerInkCancel])

  const getCanvas = () => wrapRef.current?.querySelector('canvas') ?? null

  const regionMaskKey = regionPicks
    .map((r, i) => `${r.id}:${r.maskOverlay ? `${r.maskOverlay.width}x${r.maskOverlay.height}:${r.pixelCount ?? 0}` : '0'}:${selectedRegionIds.includes(r.id) || (selectedRegionIds.length === 0 && i === regionPicks.length - 1) ? 'f' : ''}`)
    .join('|')

  // Маска заливки — canvas (те же coords, что PNG) + SVG <image> как страховка.
  useLayoutEffect(() => {
    const canvas = regionMaskCanvasRef.current
    const clearCanvas = () => {
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    if (!planInteract || (mode !== 'measure' && mode !== 'marks')) {
      clearCanvas()
      setMaskLayerImages((prev) => (prev.length ? [] : prev))
      return
    }
    const view = liveRasterView()
    if (!view || view.stageW < 1 || view.stageH < 1) {
      clearCanvas()
      setMaskLayerImages((prev) => (prev.length ? [] : prev))
      return
    }
    const dpr = rasterDevicePixelRatio()
    const pw = Math.max(1, Math.round(view.stageW * dpr))
    const ph = Math.max(1, Math.round(view.stageH * dpr))
    if (canvas) {
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
        canvas.style.width = `${view.stageW}px`
        canvas.style.height = `${view.stageH}px`
      }
    }
    const paintLayers: Array<{
      minX: number
      minY: number
      width: number
      height: number
      bits: Uint8Array
      bitW?: number
      bitH?: number
      rgba: [number, number, number, number]
    }> = []
    const svgLayers: Array<{
      id: string
      href: string
      minX: number
      minY: number
      width: number
      height: number
    }> = []
    regionPicks.forEach((region, index) => {
      const mask = region.maskOverlay
      if (!mask || mask.width < 1 || mask.height < 1) return
      const palette = REGION_PALETTE[index % REGION_PALETTE.length]
      const focus =
        selectedRegionIds.length > 0
          ? selectedRegionIds.includes(region.id)
          : index === regionPicks.length - 1
      const rgba = palette.fill.match(/rgba?\(([^)]+)\)/)
      const parts = rgba
        ? rgba[1]!.split(',').map((s) => Number.parseFloat(s.trim()))
        : [14, 165, 233, 0.55]
      const bits =
        mask.bits instanceof Uint8Array
          ? mask.bits
          : Uint8Array.from(mask.bits as ArrayLike<number>)
      const { bitW, bitH } = maskOverlayBitSize(mask)
      if (bits.length < bitW * bitH) return
      const alpha = Math.min(0.88, Math.max(0.58, (parts[3] ?? 0.55) * (focus ? 1.35 : 1.12)))
      paintLayers.push({
        minX: mask.minX,
        minY: mask.minY,
        width: mask.width,
        height: mask.height,
        bits,
        bitW,
        bitH,
        rgba: [parts[0] ?? 14, parts[1] ?? 165, parts[2] ?? 233, alpha],
      })
      const tmp = document.createElement('canvas')
      tmp.width = bitW
      tmp.height = bitH
      const tctx = tmp.getContext('2d')
      if (!tctx) return
      const img = tctx.createImageData(bitW, bitH)
      const pa = Math.round(alpha * 255)
      const pr = parts[0] ?? 14
      const pg = parts[1] ?? 165
      const pb = parts[2] ?? 233
      for (let i = 0; i < bitW * bitH; i++) {
        if (!bits[i]) continue
        const o = i * 4
        img.data[o] = pr
        img.data[o + 1] = pg
        img.data[o + 2] = pb
        img.data[o + 3] = pa
      }
      tctx.putImageData(img, 0, 0)
      svgLayers.push({
        id: region.id,
        href: tmp.toDataURL('image/png'),
        minX: mask.minX,
        minY: mask.minY,
        width: mask.width,
        height: mask.height,
      })
    })
    if (paintLayers.length === 0) {
      clearCanvas()
      setMaskLayerImages((prev) => (prev.length ? [] : prev))
      return
    }
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) paintRegionMaskOverlays(ctx, view, paintLayers, dpr)
    }
    setMaskLayerImages(svgLayers)
    // viewTick / regionMaskKey — pan/zoom и смена выделения
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionMaskKey, planInteract, mode, viewTick])

  // Не возвращаем null: иначе пустой overlay блокирует pan (RasterViewer отключает свои handlers).
  const stageEl = liveStage()
  const readyW = size.w > 0 ? size.w : Math.max(1, stageEl?.clientWidth ?? 1)
  const readyH = size.h > 0 ? size.h : Math.max(1, stageEl?.clientHeight ?? 1)
  if (!planInteract && !vt) {
    return (
      <div
        className={styles.measureOverlayHost}
        style={{ pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    )
  }

  const mapping = planDraw && pngMapping ? pngMapping : null
  const viewForPlan = planDraw ? liveRasterView() : null
  const planClosed = planPixels.length >= 3
  const measurePointCount = planDraw ? planPixels.length : areaPoints.length
  const showLengthGeom = (mode === 'measure' || mode === 'marks') && measurePointCount === 2
  const showAreaGeom = (mode === 'measure' || mode === 'marks') && measurePointCount >= 3
  /** Пока контур не замкнут (меньше 3 точек), маркеры только для отображения — не перехватывают клик. */
  const planVertexPointerEvents = planClosed ? 'auto' : 'none'
  const worldClosed = areaPoints.length >= 3
  const worldVertexPointerEvents = worldClosed ? 'auto' : 'none'

  const overlayW = size.w > 0 ? size.w : readyW
  const overlayH = size.h > 0 ? size.h : readyH

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
    ? planPixels.length >= 2
      ? planScreenPolyline(planPixels.slice(0, 2))
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
    mode === 'measure' || mode === 'marks'
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
          const c = region.maskOverlay ? maskOverlayCentroid(region.maskOverlay) : regionCentroid(region.outline)
          const labelScreen =
            region.space === 'plan' && viewForPlan
              ? imagePixelToScreen(viewForPlan, c.x, c.y)
              : vt
                ? worldToScreen(vt, c.x, c.y)
                : ([0, 0] as [number, number])
          const isDraftFocus =
            selectedRegionIds.length > 0
              ? selectedRegionIds.includes(region.id)
              : index === regionPicks.length - 1
          const hasMask = Boolean(region.maskOverlay)
          // Маска на regionMaskCanvas. Path-fill поверх снова рисует «клин» —
          // при mask у path оставляем только обводку/номер.
          const solidFill =
            !hasMask &&
            (region.pixelCount != null && region.pixelCount > 0
              ? (() => {
                  const ratio = Math.abs(polygonArea(region.outline)) / region.pixelCount
                  return ratio >= 0.55 && ratio <= 1.45
                })()
              : region.outline.length >= 4)
          return {
            id: region.id,
            index,
            d: `${ringPath} Z${holePaths}`,
            palette,
            labelX: labelScreen[0],
            labelY: labelScreen[1],
            isDraftFocus,
            solidFill,
            hasMask,
          }
        })
      : []

  const regionEdgeLabels =
    mode === 'measure'
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

  const drawPlanPixels =
    planDraw && (mode === 'measure' || mode === 'marks') ? planPixels : []
  const drawWorldPoints =
    (mode === 'measure' || mode === 'marks') && !planDraw
      ? areaPoints.length > 0
        ? areaPoints
        : lengthMeasure
          ? lengthMeasure.points
          : lengthPoints
      : []
  const manualOutlineDraft = planDraw ? planPixels.length > 0 : areaPoints.length > 0
  const editRegion =
    (mode === 'measure' || mode === 'marks') &&
    regionPicks.length > 0 &&
    !manualOutlineDraft
      ? regionPicks[regionPicks.length - 1]!
      : null
  const editRegionDraw =
    editRegion &&
    ((editRegion.space === 'plan' && planDraw) || (editRegion.space === 'world' && !planDraw && vt))
  const editRegionVertices =
    editRegionDraw && editRegion && editRegion.outline.length <= MAX_REGION_EDIT_VERTICES
      ? editRegion.outline
      : []

  const markOverlays = planMarks.map((mark) => {
    const meta = markKindMeta(mark.kind)
    const label = formatDwgPlanMarkLabel(mark, { short: true })
    const labelW = Math.max(72, Math.min(160, 18 + label.length * 7.2))
    const focused = mark.id === focusedMarkId
    if (mark.shape.type === 'point') {
      const screen =
        mark.space === 'plan' && viewForPlan
          ? imagePixelToScreen(viewForPlan, mark.shape.x, mark.shape.y)
          : mark.space === 'world' && vt
            ? worldToScreen(vt, mark.shape.x, mark.shape.y)
            : null
      if (!screen) return null
      return {
        id: mark.id,
        kind: 'point' as const,
        x: screen[0],
        y: screen[1],
        color: meta.color,
        fill: meta.fill,
        label,
        focused,
        text: mark.text,
      }
    }
    if (mark.shape.type === 'stroke') {
      const screenPts = mark.shape.points
        .map((p) => {
          if (mark.space === 'plan' && viewForPlan) {
            const [x, y] = imagePixelToScreen(viewForPlan, p.x, p.y)
            return { x, y }
          }
          if (mark.space === 'world' && !planDraw && vt) {
            const [x, y] = worldToScreen(vt, p.x, p.y)
            return { x, y }
          }
          return null
        })
        .filter((p): p is Point2D => p != null)
      if (screenPts.length < 1) return null
      const c = markCentroid(mark)
      const labelScreen =
        mark.space === 'plan' && viewForPlan
          ? imagePixelToScreen(viewForPlan, c.x, c.y)
          : mark.space === 'world' && vt
            ? worldToScreen(vt, c.x, c.y)
            : ([0, 0] as [number, number])
      return {
        id: mark.id,
        kind: 'stroke' as const,
        d: smoothStrokePath(screenPts),
        color: meta.color,
        fill: meta.fill,
        label: mark.text.trim() ? mark.text.trim() : label,
        labelW: Math.max(72, Math.min(180, 18 + (mark.text.trim() || label).length * 7.2)),
        labelX: labelScreen[0],
        labelY: labelScreen[1],
        focused,
        text: mark.text,
      }
    }
    const path =
      mark.space === 'plan' && planDraw
        ? planScreenPath(mark.shape.outline)
        : mark.space === 'world' && !planDraw
          ? worldScreenPath(mark.shape.outline)
          : ''
    if (!path) return null
    const c = markCentroid(mark)
    const labelScreen =
      mark.space === 'plan' && viewForPlan
        ? imagePixelToScreen(viewForPlan, c.x, c.y)
        : mark.space === 'world' && vt
          ? worldToScreen(vt, c.x, c.y)
          : ([0, 0] as [number, number])
    return {
      id: mark.id,
      kind: 'zone' as const,
      d: `${path} Z`,
      color: meta.color,
      fill: meta.fill,
      label,
      labelW,
      labelX: labelScreen[0],
      labelY: labelScreen[1],
      focused,
      text: mark.text,
    }
  })

  const syncMarkerCanvas = () => {
    const canvas = markerCanvasRef.current
    if (!canvas || size.w < 1 || size.h < 1) return null
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const pw = Math.max(1, Math.round(size.w * dpr))
    const ph = Math.max(1, Math.round(size.h * dpr))
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
      canvas.style.width = `${size.w}px`
      canvas.style.height = `${size.h}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  const clearMarkerCanvas = () => {
    const canvas = markerCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const redrawMarkerInk = (points: readonly Point2D[]) => {
    const ctx = syncMarkerCanvas()
    if (!ctx || points.length < 1) return
    clearMarkerCanvas()
    const synced = syncMarkerCanvas()
    if (!synced) return
    const width = touchLarge ? 9 : 7
    const draw = (strokeStyle: string, lineWidth: number) => {
      synced.lineCap = 'round'
      synced.lineJoin = 'round'
      synced.strokeStyle = strokeStyle
      synced.lineWidth = lineWidth
      synced.beginPath()
      synced.moveTo(points[0]!.x, points[0]!.y)
      if (points.length === 1) {
        synced.lineTo(points[0]!.x + 0.01, points[0]!.y)
      } else if (points.length === 2) {
        synced.lineTo(points[1]!.x, points[1]!.y)
      } else {
        for (let i = 1; i < points.length - 1; i++) {
          const p = points[i]!
          const n = points[i + 1]!
          synced.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2)
        }
        const last = points[points.length - 1]!
        synced.lineTo(last.x, last.y)
      }
      synced.stroke()
    }
    draw('rgba(8, 12, 20, 0.45)', width + 3)
    draw('rgba(255, 255, 255, 0.96)', width)
  }

  const beginMarkerInk = (sx: number, sy: number) => {
    syncMarkerCanvas()
    markerInkRef.current = { points: [{ x: sx, y: sy }], lastX: sx, lastY: sy, active: true }
    onMarkerDrawingChangeRef.current?.(true)
    redrawMarkerInk([{ x: sx, y: sy }])
  }

  const extendMarkerInk = (sx: number, sy: number) => {
    const ink = markerInkRef.current
    if (!ink?.active) return
    const dist = Math.hypot(sx - ink.lastX, sy - ink.lastY)
    if (dist < 0.4) return
    const steps = Math.max(1, Math.min(6, Math.ceil(dist / 2.5)))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = ink.lastX + (sx - ink.lastX) * t
      const y = ink.lastY + (sy - ink.lastY) * t
      ink.points.push({ x, y })
      ink.lastX = x
      ink.lastY = y
    }
    redrawMarkerInk(ink.points)
  }

  const finishMarkerInk = (commit: boolean) => {
    const ink = markerInkRef.current
    markerInkRef.current = null
    onMarkerDrawingChangeRef.current?.(false)
    if (!ink || !commit || ink.points.length < 2) {
      clearMarkerCanvas()
      return
    }
    const screenPts = simplifyPolylinePoints(ink.points, 1.15, 700)
    const stage = liveStage()
    const view = liveRasterView()
    const svg = svgRef.current
    const svgRect = svg?.getBoundingClientRect()
    const wrapCanvas = wrapRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    const wrapRect = wrapCanvas?.getBoundingClientRect()
    const planPts: Point2D[] = []
    for (const p of screenPts) {
      let pt: Point2D | null = null
      if (planDraw && mapping && view) {
        pt = planClickToImagePixel(p.x, p.y, view, mapping, [], {
          snapToGeometry: false,
          orthoSnap: false,
        })
      } else if (!planInteract) {
        // Векторный чертёж: экранные точки оверлея → мир через canvas CAD.
        const rect = wrapRect ?? svgRect
        const w = wrapCanvas?.clientWidth || stage?.clientWidth || size.w
        const h = wrapCanvas?.clientHeight || stage?.clientHeight || size.h
        if (rect && w > 0 && h > 0) {
          const clientX = rect.left + (p.x / Math.max(1, size.w || w)) * rect.width
          const clientY = rect.top + (p.y / Math.max(1, size.h || h)) * rect.height
          pt = resolveWorldPointFromScreen(clientX, clientY)
        }
      }
      if (!pt) continue
      const last = planPts[planPts.length - 1]
      if (last && Math.hypot(last.x - pt.x, last.y - pt.y) < 0.25) continue
      planPts.push(pt)
    }
    clearMarkerCanvas()
    const saved = simplifyPolylinePoints(planPts, 0.55, 480)
    if (saved.length >= 2) onMarkerStrokeCompleteRef.current?.(saved)
  }

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

  const screenPointForRegionVertex = (region: RegionPickItem, p: Point2D): [number, number] => {
    if (region.space === 'plan') return screenPointForPlanPixel(p)
    return screenPointForWorld(p)
  }

  const tryInsertRegionVertexAt = (sx: number, sy: number): boolean => {
    if (!editRegion || !editRegionDraw || !onRegionOutlineInsert) return false
    if (editRegion.outline.length >= MAX_REGION_EDIT_VERTICES) return false
    const toScreen = (p: Point2D): [number, number] => screenPointForRegionVertex(editRegion!, p)
    const hit = findClosestEdgeInsertScreen(
      editRegion.outline,
      sx,
      sy,
      toScreen,
      edgeInsertHitPx,
    )
    if (!hit) return false
    onRegionOutlineInsert(editRegion.id, hit.insertIndex, hit.point)
    onVertexSelect?.({
      space: editRegion.space,
      index: hit.insertIndex,
      regionId: editRegion.id,
    })
    return true
  }

  const tryInsertPolylineVertexAt = (sx: number, sy: number): boolean => {
    if (mode !== 'measure' && mode !== 'marks') return false
    if (planDraw && planPixels.length >= 2 && onPlanPixelInsert) {
      const hit = findClosestEdgeInsertScreen(
        planPixels,
        sx,
        sy,
        (p) => screenPointForPlanPixel(p),
        edgeInsertHitPx,
        planPixels.length >= 3,
      )
      if (hit) {
        onPlanPixelInsert(hit.insertIndex, hit.point)
        onVertexSelect?.({ space: 'plan', index: hit.insertIndex })
        return true
      }
    }
    if (!planDraw && areaPoints.length >= 2 && onWorldPointInsert) {
      const hit = findClosestEdgeInsertScreen(
        areaPoints,
        sx,
        sy,
        (p) => screenPointForWorld(p),
        edgeInsertHitPx,
        areaPoints.length >= 3,
      )
      if (hit) {
        onWorldPointInsert(hit.insertIndex, hit.point)
        onVertexSelect?.({ space: 'world', index: hit.insertIndex })
        return true
      }
    }
    return false
  }

  const vertexDeleteBtn = (opts: {
    key: string
    sx: number
    sy: number
    vertex: MeasureVertexRef
  }) => {
    if (!touchLarge || !onVertexDelete) return null
    if (!isVertexSelected(opts.vertex)) return null
    const dx = 22
    const dy = -22
    return (
      <g
        key={opts.key}
        className={styles.vertexDeleteHit}
        pointerEvents="auto"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          onVertexDelete(opts.vertex)
        }}
      >
        <circle cx={opts.sx + dx} cy={opts.sy + dy} r={16} className={styles.vertexDeleteBg} />
        <text
          x={opts.sx + dx}
          y={opts.sy + dy + 1}
          className={styles.vertexDeleteX}
          textAnchor="middle"
          dominantBaseline="central"
        >
          ×
        </text>
      </g>
    )
  }

  const resolveMarkerPoint = (
    sx: number,
    sy: number,
    clientX: number,
    clientY: number,
  ): Point2D | null => {
    if (planDraw && mapping && viewForPlan) {
      return planClickToImagePixel(sx, sy, viewForPlan, mapping, [], {
        snapToGeometry: false,
        orthoSnap: false,
      })
    }
    if (!planInteract) {
      return resolveWorldPointFromScreen(clientX, clientY)
    }
    return null
  }

  const regionEdgeHandles =
    editRegion &&
    editRegionDraw &&
    editRegionVertices.length >= 2 &&
    selectedVertex?.regionId === editRegion.id
      ? editRegionVertices.map((p, i) => {
          const next = editRegionVertices[(i + 1) % editRegionVertices.length]!
          const [sx, sy] = screenPointForRegionVertex(editRegion, p)
          const [nx, ny] = screenPointForRegionVertex(editRegion, next)
          return {
            key: `${editRegion.id}-edge-${i}`,
            mx: (sx + nx) / 2,
            my: (sy + ny) / 2,
            insertIndex: i + 1,
            point: {
              x: (p.x + next.x) / 2,
              y: (p.y + next.y) / 2,
            },
          }
        })
      : []

  const maskScreenLayers =
    planDraw && viewForPlan
      ? maskLayerImages.map((layer) => {
          const [x, y] = imagePixelToScreen(viewForPlan, layer.minX, layer.minY)
          const [, y1] = imagePixelToScreen(viewForPlan, layer.minX, layer.minY + layer.height)
          const [x1] = imagePixelToScreen(viewForPlan, layer.minX + layer.width, layer.minY)
          return {
            ...layer,
            x,
            y,
            w: Math.max(1, x1 - x),
            h: Math.max(1, y1 - y),
          }
        })
      : []

  return (
    <div
      className={styles.measureOverlayHost}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={regionMaskCanvasRef} className={styles.regionMaskCanvas} aria-hidden />
      <canvas ref={markerCanvasRef} className={styles.markerInkCanvas} aria-hidden />
    <svg
      ref={svgRef}
      className={styles.measureOverlay}
      viewBox={`0 0 ${overlayW} ${overlayH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ cursor: grabbing ? 'grabbing' : markerMode ? 'crosshair' : 'crosshair' }}
      onContextMenu={(e) => {
        // Не даём системному меню съесть жест «удержание → заливка».
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return
        e.preventDefault()
        e.stopPropagation()
        try {
          window.getSelection()?.removeAllRanges()
        } catch {
          /* ignore */
        }
        // Размер ещё не синхронизирован — хотя бы pan.
        if (size.w < 1 && planInteract) {
          rasterRef?.current?.stopMotion?.()
        }
        const svg = svgRef.current
        if (!svg) return
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        pinchRef.current.down(e.pointerId, { x: sx, y: sy })
        if (pinchRef.current.isPinching()) {
          clearLongPress()
          dragRef.current = null
          setGrabbing(false)
          // Сразу помечаем щипок: иначе при отпускании пальцев сработает «тап» и встанет точка замера.
          pinchGestureRef.current = true
          rasterRef?.current?.stopMotion?.()
          if (markerInkRef.current) {
            const ink = markerInkRef.current
            const pathLen = ink.points.reduce((acc, p, i) => {
              if (i === 0) return 0
              const prev = ink.points[i - 1]!
              return acc + Math.hypot(p.x - prev.x, p.y - prev.y)
            }, 0)
            finishMarkerInk(ink.points.length >= 8 && pathLen >= 28)
          }
          // Не сворачиваем панели во время щипка — иначе stage прыгает и зум ломается.
        } else {
          clearLongPress()
          const now = performance.now()
          dragRef.current = {
            pointerId: e.pointerId,
            startX: sx,
            startY: sy,
            lastX: sx,
            lastY: sy,
            lastT: now,
            vx: 0,
            vy: 0,
            moved: false,
            longPressFired: false,
            longPressPicked: false,
          }
          if (markerMode) {
            beginMarkerInk(sx, sy)
          } else if (longPressEnabled && e.button === 0) {
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
              if (dragRef.current) {
                // Даже если участок не найден — это было удержание, не тап.
                dragRef.current.longPressFired = true
                dragRef.current.longPressPicked = picked
              }
            }, longPressMs)
          }
        }
        ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const svg = svgRef.current
        if (!svg) return
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)

        const vDrag = vertexDragRef.current
        if (vDrag && vDrag.pointerId === e.pointerId) {
          e.preventDefault()
          e.stopPropagation()
          if (!vDrag.moved) {
            const total = Math.hypot(sx - vDrag.startX, sy - vDrag.startY)
            if (total < VERTEX_DRAG_THRESHOLD_PX) return
            vDrag.moved = true
            clearLongPress()
            dragRef.current = null
            setGrabbing(false)
          }
          applyVertexDragAt(e.clientX, e.clientY, vDrag)
          return
        }

        const pinch = pinchRef.current.move(e.pointerId, { x: sx, y: sy })
        if (pinch) {
          e.preventDefault()
          e.stopPropagation()
          pinchGestureRef.current = true
          clearLongPress()
          dragRef.current = null
          setGrabbing(false)
          // Не onNavigate здесь — ресайз stage во время щипка ломает якорь зума.
          if (planInteract) {
            rasterRef?.current?.pinchBy?.(pinch)
          } else {
            const viewer = cadRef.current?.getViewer()
            if (viewer) {
              if (Math.abs(pinch.factor - 1) >= 0.001) {
                viewer.handleZoom(pinch.center.x, pinch.center.y, pinch.factor)
              }
              if (pinch.panX || pinch.panY) viewer.handlePan(pinch.panX, pinch.panY)
            }
          }
          return
        }
        if (pinchRef.current.isPinching()) {
          e.preventDefault()
          e.stopPropagation()
          return
        }

        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return
        const dx = sx - drag.lastX
        const dy = sy - drag.lastY
        if (!drag.moved) {
          const total = Math.hypot(sx - drag.startX, sy - drag.startY)
          if (total > longPressMovePx && longPressTimerRef.current) {
            clearLongPress()
          }
          const gate = markerMode ? 0.8 : dragThreshold
          if (total < gate) return
          clearLongPress()
          drag.moved = true
          setGrabbing(!markerMode)
          // Не сворачиваем нижнюю панель во время рисования — иначе stage прыгает и штрих уезжает.
          if (!markerMode) onNavigateRef.current?.()
          rasterRef?.current?.stopMotion?.()
        }
        const now = performance.now()
        const dt = Math.max(1, now - drag.lastT)
        drag.vx = dx / dt
        drag.vy = dy / dt
        drag.lastT = now
        drag.lastX = sx
        drag.lastY = sy
        e.preventDefault()
        e.stopPropagation()
        if (markerMode && !drag.panOnly) {
          extendMarkerInk(sx, sy)
          return
        }
        if (planInteract) {
          rasterRef?.current?.panBy(dx, dy, { rubber: true })
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

        const vDrag = vertexDragRef.current
        if (vDrag && vDrag.pointerId === e.pointerId) {
          if (!vDrag.moved) {
            handleVertexTap(vDrag)
          }
          vertexDragRef.current = null
          try {
            ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
          } catch {
            /* already released */
          }
          return
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
          // Второй палец: сохраняем штрих, если уже есть осмысленный росчерк.
          if (markerInkRef.current) {
            const ink = markerInkRef.current
            const pathLen = ink.points.reduce((acc, p, i) => {
              if (i === 0) return 0
              const prev = ink.points[i - 1]!
              return acc + Math.hypot(p.x - prev.x, p.y - prev.y)
            }, 0)
            finishMarkerInk(ink.points.length >= 8 && pathLen >= 28)
          }
          // Один палец остался после щипка — только pan, без тапа/точки/комментария.
          const left = pinchRef.current.remaining()
          if (left) {
            const now = performance.now()
            dragRef.current = {
              pointerId: left.id,
              startX: left.point.x,
              startY: left.point.y,
              lastX: left.point.x,
              lastY: left.point.y,
              lastT: now,
              vx: 0,
              vy: 0,
              // moved: true — отпускание этого пальца не должно ставить точку / открывать комментарий.
              moved: true,
              longPressFired: false,
              longPressPicked: false,
              panOnly: true,
            }
            // pinchGestureRef держим true, пока не уйдут все пальцы — иначе «хвост» щипка = тап.
          } else if (pinchRef.current.pointerCount() === 0) {
            pinchGestureRef.current = false
          }
          if (pinchRef.current.pointerCount() === 0) {
            if (planInteract) rasterRef?.current?.panBy(0, 0)
            onNavigateRef.current?.()
          }
          return
        }

        if (!drag || drag.pointerId !== e.pointerId) return
        const vx = drag.vx
        const vy = drag.vy
        const didPan = drag.moved
        const panOnly = Boolean(drag.panOnly)
        dragRef.current = null
        setGrabbing(false)
        try {
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
        clearLongPress()
        if (didPan) {
          if (markerMode && !panOnly) {
            finishMarkerInk(true)
            return
          }
          if (planInteract && Math.hypot(vx, vy) >= FLING_MIN_SPEED) {
            rasterRef?.current?.fling?.(vx, vy)
          } else if (planInteract) {
            rasterRef?.current?.panBy(0, 0)
          }
          return
        }
        if (e.button !== 0) return
        const svg = e.currentTarget as SVGSVGElement
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        if (markerMode) {
          // Тап без росчерка — комментарий к уже нарисованному; чернила сбрасываем.
          if (markerInkRef.current) finishMarkerInk(false)
          const tapPt = resolveMarkerPoint(sx, sy, e.clientX, e.clientY)
          if (tapPt) onMarkerTap?.(tapPt)
          return
        }

        // Удержание: заливка (повтор при промахе на таймере). Точку не ставим.
        if (drag.longPressFired) {
          if (!drag.longPressPicked) {
            tryPickRegionAt(drag.startX, drag.startY)
          }
          return
        }

        // Режим «Заливка»: клик только выделяет зону (точки не ставим).
        if (fillByClick && (mode === 'measure' || mode === 'marks')) {
          tryPickRegionAt(sx, sy)
          return
        }

        // Shift — заливка даже в режиме точек. Ctrl/Cmd — орто-привязка.
        if (
          (mode === 'measure' || mode === 'marks') &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey
        ) {
          tryPickRegionAt(sx, sy)
          return
        }

        // Короткий тап: точка измерения или метка.
        if (!manualOutlineDraft && tryInsertRegionVertexAt(sx, sy)) return
        if (tryInsertPolylineVertexAt(sx, sy)) return
        onVertexSelect?.(null)
        const view = liveRasterView()
        if (planDraw && mapping && view) {
          const pixel = planClickToImagePixel(sx, sy, view, mapping, snapWorldPoints, {
            previousPixel: planPixels.length > 0 ? planPixels[planPixels.length - 1] : undefined,
            orthoSnap: e.ctrlKey || e.metaKey,
            snapToGeometry: e.ctrlKey || e.metaKey,
            snapSegments,
          })
          if (mode === 'marks') {
            onMarkPlace?.(pixel, 'plan')
            return
          }
          onPlanPixelClick?.(pixel)
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
        if (mode === 'marks') {
          onMarkPlace?.(world, 'world')
          return
        }
        onWorldMeasureClick(world)
      }}
      onPointerCancel={(e) => {
        clearLongPress()
        const wasPinch = pinchGestureRef.current || pinchRef.current.isPinching()
        if (e.pointerId != null) pinchRef.current.up(e.pointerId)
        if (markerInkRef.current) {
          const ink = markerInkRef.current
          const pathLen = ink.points.reduce((acc, p, i) => {
            if (i === 0) return 0
            const prev = ink.points[i - 1]!
            return acc + Math.hypot(p.x - prev.x, p.y - prev.y)
          }, 0)
          finishMarkerInk(ink.points.length >= 8 && pathLen >= 28)
        }
        vertexDragRef.current = null
        if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
        setGrabbing(false)
        try {
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }

        // Как на pointerup: оставшийся палец после щипка → только pan.
        if (wasPinch) {
          pinchGestureRef.current = true
          const left = pinchRef.current.remaining()
          if (left) {
            const now = performance.now()
            dragRef.current = {
              pointerId: left.id,
              startX: left.point.x,
              startY: left.point.y,
              lastX: left.point.x,
              lastY: left.point.y,
              lastT: now,
              vx: 0,
              vy: 0,
              moved: true,
              longPressFired: false,
              longPressPicked: false,
              panOnly: true,
            }
          } else if (pinchRef.current.pointerCount() === 0) {
            pinchRef.current.clear()
            pinchGestureRef.current = false
            if (planInteract) rasterRef?.current?.panBy(0, 0)
            onNavigateRef.current?.()
          }
          return
        }

        if (pinchRef.current.pointerCount() === 0) {
          pinchRef.current.clear()
          pinchGestureRef.current = false
          if (planInteract) rasterRef?.current?.panBy(0, 0)
        }
      }}
      onDoubleClick={(e) => {
        if (markerMode || mode !== 'measure') return
        e.preventDefault()
        e.stopPropagation()
        clearLongPress()
        const svg = svgRef.current
        if (!svg) return
        const stage = liveStage()
        const { x: sx, y: sy } = pointerInOverlay(svg, stage, e.clientX, e.clientY)
        tryPickRegionAt(sx, sy)
      }}
    >
      {maskScreenLayers.map((layer) => (
        <image
          key={`mask-${layer.id}`}
          href={layer.href}
          xlinkHref={layer.href}
          x={layer.x}
          y={layer.y}
          width={layer.w}
          height={layer.h}
          preserveAspectRatio="none"
          pointerEvents="none"
          opacity={0.95}
        />
      ))}
      {fillByClick && regionPicks.length === 0 && !pickFlash ? (
        <g pointerEvents="none">
          <rect
            x={overlayW / 2 - 170}
            y={18}
            width={340}
            height={36}
            rx={10}
            fill="rgba(10, 16, 28, 0.72)"
          />
          <text
            x={overlayW / 2}
            y={40}
            textAnchor="middle"
            fill="rgba(255,255,255,0.92)"
            fontSize={13}
            fontWeight={700}
          >
            Кликните цветную заливку на плане
          </text>
        </g>
      ) : null}
      {pickFlash ? (
        <g pointerEvents="none">
          <rect
            x={overlayW / 2 - 180}
            y={18}
            width={360}
            height={36}
            rx={10}
            fill="rgba(10, 16, 28, 0.88)"
          />
          <text
            x={overlayW / 2}
            y={40}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={13}
            fontWeight={700}
          >
            {pickFlash}
          </text>
        </g>
      ) : null}
      {holdRing ? (
        <g className={styles.holdRing} pointerEvents="none">
          <circle cx={holdRing.x} cy={holdRing.y} r={28} className={styles.holdRingOuter} />
          <circle cx={holdRing.x} cy={holdRing.y} r={14} className={styles.holdRingInner} />
        </g>
      ) : null}
      {markOverlays.map((item) =>
        item ? (
          item.kind === 'zone' ? (
            <g
              key={item.id}
              pointerEvents="none"
              className={item.focused ? styles.markZoneFocused : styles.markZone}
            >
              <path d={item.d} fill={item.fill} stroke="none" fillRule="evenodd" opacity={0.92} />
              <path
                d={item.d}
                fill="none"
                stroke="rgba(10, 16, 28, 0.94)"
                strokeWidth={item.focused ? 8 : 6}
                strokeLinejoin="round"
                fillRule="evenodd"
              />
              <path
                d={item.d}
                fill="none"
                stroke={item.color}
                strokeWidth={item.focused ? 4.5 : 3.5}
                strokeDasharray="14 8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fillRule="evenodd"
              />
              <g transform={`translate(${item.labelX.toFixed(2)} ${item.labelY.toFixed(2)})`}>
                <rect
                  className={styles.markZoneLabelBg}
                  x={-item.labelW / 2}
                  y={-12}
                  width={item.labelW}
                  height={24}
                  rx={7}
                  stroke={item.color}
                />
                <text
                  className={styles.markZoneLabelText}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={item.color}
                >
                  {item.label}
                </text>
              </g>
            </g>
          ) : item.kind === 'stroke' ? (
            <g
              key={item.id}
              pointerEvents="none"
              className={item.focused ? styles.markStrokeFocused : styles.markStroke}
            >
              <path
                d={item.d}
                fill="none"
                stroke="rgba(10, 16, 28, 0.88)"
                strokeWidth={item.focused ? 12 : 10}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={item.d}
                fill="none"
                stroke={item.color}
                strokeWidth={item.focused ? 7.5 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
              {item.text.trim() ? (
                <g transform={`translate(${item.labelX.toFixed(2)} ${item.labelY.toFixed(2)})`}>
                  <rect
                    className={styles.markZoneLabelBg}
                    x={-item.labelW / 2}
                    y={-12}
                    width={item.labelW}
                    height={24}
                    rx={7}
                    stroke={item.color}
                  />
                  <text
                    className={styles.markZoneLabelText}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255, 255, 255, 0.96)"
                  >
                    {item.label}
                  </text>
                </g>
              ) : null}
            </g>
          ) : (
            <g
              key={item.id}
              pointerEvents="none"
              className={item.focused ? styles.markPointFocused : styles.markPoint}
            >
              <circle
                cx={item.x}
                cy={item.y}
                r={item.focused ? 18 : 14}
                fill="none"
                stroke="rgba(10, 16, 28, 0.9)"
                strokeWidth={item.focused ? 5 : 4}
              />
              <circle
                cx={item.x}
                cy={item.y}
                r={item.focused ? 18 : 14}
                fill="none"
                stroke={item.color}
                strokeWidth={item.focused ? 3 : 2.5}
                strokeDasharray="8 5"
              />
              <circle
                cx={item.x}
                cy={item.y}
                r={item.focused ? 10 : 8}
                fill={item.fill}
                stroke={item.color}
                strokeWidth={2.5}
              />
              <circle cx={item.x} cy={item.y} r={3.5} fill={item.color} />
              <text
                className={styles.markPointLabelText}
                x={item.x}
                y={item.y - (item.focused ? 26 : 22)}
                textAnchor="middle"
                fill={item.color}
              >
                {item.label}
              </text>
            </g>
          )
        ) : null,
      )}
      {regionPaths.map((item) =>
        item ? (
          <g key={item.id} pointerEvents="none">
            <path
              d={item.d}
              fill={item.solidFill ? item.palette.fill : 'none'}
              stroke="none"
              fillRule="evenodd"
              opacity={item.isDraftFocus ? 1 : 0.9}
            />
            <path
              d={item.d}
              fill="none"
              stroke={item.isDraftFocus ? '#0b1222' : 'rgba(10, 16, 28, 0.5)'}
              strokeWidth={item.isDraftFocus ? 3.25 : 2}
              fillRule="evenodd"
            />
            <path
              d={item.d}
              className={item.isDraftFocus ? styles.draftZoneMarch : undefined}
              fill="none"
              stroke={item.palette.stroke}
              strokeWidth={item.isDraftFocus ? 2.75 : 2}
              strokeDasharray={item.isDraftFocus ? '10 5' : undefined}
              strokeLinejoin="round"
              fillRule="evenodd"
              opacity={1}
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
              fill="#ffffff"
              fontSize={12}
              fontWeight={800}
            >
              {item.index + 1}
            </text>
          </g>
        ) : null,
      )}
      {showEdgeDimensions
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
      {showAreaGeom && areaFill ? (
        <g pointerEvents="none">
          <polygon
            points={areaFill}
            fill="rgba(56, 189, 248, 0.28)"
            stroke="rgba(10, 16, 28, 0.75)"
            strokeWidth={3.5}
          />
          <polygon
            points={areaFill}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            strokeDasharray="9 5"
            className={styles.draftZoneMarch}
          />
        </g>
      ) : null}
      {showAreaGeom && areaPolyline ? (
        <polyline
          points={areaPolyline}
          fill="none"
          stroke="rgba(56, 189, 248, 0.95)"
          strokeWidth={2}
          strokeDasharray={(planDraw ? planClosed : areaClosed) ? undefined : '6 4'}
        />
      ) : null}
      {showLengthGeom && lengthLine ? (
        <polyline
          points={lengthLine}
          fill="none"
          stroke="rgba(251, 191, 36, 0.95)"
          strokeWidth={2}
        />
      ) : null}
      {(mode === 'measure' || mode === 'marks') && !showAreaGeom && !showLengthGeom && areaPolyline ? (
        <polyline
          points={areaPolyline}
          fill="none"
          stroke="rgba(251, 191, 36, 0.75)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      ) : null}
      {drawPlanPixels.length <= 48
        ? drawPlanPixels.map((p, i) => {
            const [sx, sy] = screenPointForPlanPixel(p)
            const selected = isVertexSelected({ space: 'plan', index: i })
            return (
              <g
                key={`plan-v-${i}`}
                className={`${styles.vertexHandle} ${selected ? styles.vertexSelected : ''}`}
                pointerEvents={planVertexPointerEvents}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  e.stopPropagation()
                  clearLongPress()
                  dragRef.current = null
                  vertexDragRef.current = {
                    pointerId: e.pointerId,
                    target: 'polyline',
                    space: 'plan',
                    index: i,
                    startX: sx,
                    startY: sy,
                    moved: false,
                  }
                  ;(svgRef.current ?? (e.currentTarget as SVGSVGElement)).setPointerCapture(
                    e.pointerId,
                  )
                }}
              >
                {selected ? (
                  <circle
                    cx={sx}
                    cy={sy}
                    r={vertexRingR}
                    className={styles.vertexSelectedRing}
                  />
                ) : null}
                <circle cx={sx} cy={sy} r={vertexHitR} className={styles.vertexHit} />
                <circle
                  cx={sx}
                  cy={sy}
                  r={vertexDotR}
                  className={showLengthGeom ? styles.lengthVertex : styles.areaVertex}
                />
                {vertexDeleteBtn({
                  key: `plan-del-${i}`,
                  sx,
                  sy,
                  vertex: { space: 'plan', index: i },
                })}
              </g>
            )
          })
        : null}
      {drawWorldPoints.map((p, i) => {
        const [sx, sy] = screenPointForWorld(p)
        const selected = isVertexSelected({ space: 'world', index: i })
        return (
          <g
            key={`world-v-${i}`}
            className={`${styles.vertexHandle} ${selected ? styles.vertexSelected : ''}`}
            pointerEvents={worldVertexPointerEvents}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              clearLongPress()
              dragRef.current = null
              vertexDragRef.current = {
                pointerId: e.pointerId,
                target: 'polyline',
                space: 'world',
                index: i,
                startX: sx,
                startY: sy,
                moved: false,
              }
              ;(svgRef.current ?? (e.currentTarget as SVGSVGElement)).setPointerCapture(e.pointerId)
            }}
          >
            {selected ? (
              <circle cx={sx} cy={sy} r={vertexRingR} className={styles.vertexSelectedRing} />
            ) : null}
            <circle cx={sx} cy={sy} r={vertexHitR} className={styles.vertexHit} />
            <circle
              cx={sx}
              cy={sy}
              r={vertexDotR}
              className={showLengthGeom ? styles.lengthVertex : styles.areaVertex}
            />
            {vertexDeleteBtn({
              key: `world-del-${i}`,
              sx,
              sy,
              vertex: { space: 'world', index: i },
            })}
          </g>
        )
      })}
      {editRegion && editRegionDraw
        ? regionEdgeHandles.map((edge) => (
            <g
              key={edge.key}
              className={styles.edgeHandle}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                clearLongPress()
                dragRef.current = null
                if (editRegion.outline.length >= MAX_REGION_EDIT_VERTICES) return
                onRegionOutlineInsert?.(editRegion.id, edge.insertIndex, edge.point)
                onVertexSelect?.({
                  space: editRegion.space,
                  index: edge.insertIndex,
                  regionId: editRegion.id,
                })
              }}
            >
              <circle cx={edge.mx} cy={edge.my} r={edgeHandleHitR} className={styles.edgeHandleHit} />
              <circle cx={edge.mx} cy={edge.my} r={edgeHandleDotR} className={styles.edgeHandleDot} />
            </g>
          ))
        : null}
      {editRegion && editRegionDraw
        ? editRegionVertices.map((p, i) => {
            const [sx, sy] = screenPointForRegionVertex(editRegion, p)
            const selected = isVertexSelected({
              space: editRegion.space,
              index: i,
              regionId: editRegion.id,
            })
            return (
              <g
                key={`region-v-${editRegion.id}-${i}`}
                className={`${styles.vertexHandle} ${selected ? styles.vertexSelected : ''}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  e.stopPropagation()
                  clearLongPress()
                  dragRef.current = null
                  vertexDragRef.current = {
                    pointerId: e.pointerId,
                    target: 'region',
                    space: editRegion.space,
                    regionId: editRegion.id,
                    index: i,
                    startX: sx,
                    startY: sy,
                    moved: false,
                  }
                  ;(svgRef.current ?? (e.currentTarget as SVGSVGElement)).setPointerCapture(
                    e.pointerId,
                  )
                }}
              >
                {selected ? (
                  <circle cx={sx} cy={sy} r={vertexRingR} className={styles.vertexSelectedRing} />
                ) : null}
                <circle cx={sx} cy={sy} r={vertexHitR} className={styles.vertexHit} />
                <circle cx={sx} cy={sy} r={vertexDotR} className={styles.areaVertex} />
                {vertexDeleteBtn({
                  key: `region-del-${editRegion.id}-${i}`,
                  sx,
                  sy,
                  vertex: { space: editRegion.space, index: i, regionId: editRegion.id },
                })}
              </g>
            )
          })
        : null}
    </svg>
    </div>
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
  siteId,
  fileId,
  siteName: siteNameProp,
}: Props) {
  const hasRaster = Boolean(pngUrl)
  const dxfReady = dxfText.trim().length > 0
  const planExpected = preferPlan && pngState !== 'failed'
  const measurePreferred = pngState === 'failed' || (!preferPlan && !hasRaster)
  const siteDisplayName = siteNameProp?.trim() || (siteId ? resolveSiteDisplayName(siteId) : '')
  const handoverFolderHint = siteDisplayName ? ckkbHandoverFolderName(siteDisplayName) : null
  const marksStorageReady = Boolean(siteId && fileId)
  const [tool, setTool] = useState<DwgViewerTool | null>(
    measurePreferred && dxfReady ? 'measure' : null,
  )
  const [lengthPoints, setLengthPoints] = useState<Point2D[]>([])
  const [lengthMeasure, setLengthMeasure] = useState<LengthMeasure | null>(null)
  const [areaPoints, setAreaPoints] = useState<Point2D[]>([])
  const [planPixels, setPlanPixels] = useState<Point2D[]>([])
  const [selectedVertex, setSelectedVertex] = useState<MeasureVertexRef | null>(null)
  const [regionPicks, setRegionPicks] = useState<RegionPickItem[]>([])
  /** На растре клик = заливка; «Точки» переключает на полилинию. */
  const [fillByClick, setFillByClick] = useState(true)
  /** Какие заливки получат статус при сохранении (одна или несколько). */
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([])
  const [planMarks, setPlanMarks] = useState<DwgPlanMark[]>([])
  const [focusedMarkId, setFocusedMarkId] = useState<string | null>(null)
  const [markFilterKinds, setMarkFilterKinds] = useState<DwgPlanMarkKind[] | 'all'>('all')
  const [markFilterPeriod, setMarkFilterPeriod] = useState<'today' | 'week' | 'all'>('all')
  const [markFilterDateFrom, setMarkFilterDateFrom] = useState('')
  const [markFilterDateTo, setMarkFilterDateTo] = useState('')
  const [marksPanelExpanded, setMarksPanelExpanded] = useState(false)
  const [markerDrawing, setMarkerDrawing] = useState(false)
  const [markerInkCancel, setMarkerInkCancel] = useState(0)
  const [markerCommentEdit, setMarkerCommentEdit] = useState<{
    id: string
    text: string
  } | null>(null)
  const [markerTextInput, setMarkerTextInput] = useState('')
  const [markerSaving, setMarkerSaving] = useState(false)
  const [zoneStatusNote, setZoneStatusNote] = useState('')
  const [zoneStatusKind, setZoneStatusKind] = useState<DwgPlanMarkKind | null>(null)
  const [zoneStatusNoteRequired, setZoneStatusNoteRequired] = useState(false)
  const [zoneStatusFlash, setZoneStatusFlash] = useState<string | null>(null)
  const [zoneStatusAttachments, setZoneStatusAttachments] = useState<File[]>([])
  const [zoneStatusSaving, setZoneStatusSaving] = useState(false)
  const [materialKind, setMaterialKind] = useState<
    'none' | 'asphalt' | 'soil' | 'crushedStone' | 'sand'
  >('none')
  const [asphaltBinderCm, setAsphaltBinderCm] = useState(6)
  const [asphaltWearingCm, setAsphaltWearingCm] = useState(4)
  const [asphaltMixId, setAsphaltMixId] = useState<AsphaltMixId>(DEFAULT_ASPHALT_WEARING_MIX)
  const [soilThicknessCm, setSoilThicknessCm] = useState(10)
  const [crushedStoneCm, setCrushedStoneCm] = useState(DEFAULT_LAYER_THICKNESS_CM)
  const [crushedStoneFraction, setCrushedStoneFraction] = useState<CrushedStoneFraction>(
    DEFAULT_CRUSHED_STONE_FRACTION,
  )
  const [sandCm, setSandCm] = useState(DEFAULT_LAYER_THICKNESS_CM)
  /** Компактный UI: телефон / узкий экран */
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 719px)').matches : false,
  )
  const [isLandscapePhone, setIsLandscapePhone] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-height: 520px) and (orientation: landscape)').matches
      : false,
  )
  const [regionDetailsOpen, setRegionDetailsOpen] = useState(false)
  const [measureDetailsOpen, setMeasureDetailsOpen] = useState(false)
  const [mobileMeasureSheetOpen, setMobileMeasureSheetOpen] = useState(false)
  const regionPickCountRef = useRef(0)
  const stageShellRef = useRef<HTMLDivElement | null>(null)
  const chromeRootRef = useRef<HTMLDivElement | null>(null)
  const mobileSheetBodyRef = useRef<HTMLDivElement | null>(null)
  const measurePointCountPrevRef = useRef(0)
  const parsedDocRef = useRef<DxfDocument | null>(null)
  const [snapWorldPoints, setSnapWorldPoints] = useState<Point2D[]>([])
  const [snapSegments, setSnapSegments] = useState<DxfSnapSegment[]>([])
  const [drawingInsUnits, setDrawingInsUnits] = useState(6)
  const [rasterView, setRasterView] = useState<RasterViewState | null>(null)
  const handleRasterViewChange = useCallback((state: RasterViewState) => {
    setRasterView(state)
  }, [])

  const measurePngMapping: PngWorldMapping | null = pngWorldMeta
    ? pngMetaToMapping(pngWorldMeta, rasterView ?? rasterRef.current?.getViewState() ?? null)
    : null
  const measureScaleReady = !hasRaster || Boolean(measurePngMapping)
  const planInsUnits =
    pngWorldMeta?.insUnits != null && Number.isFinite(pngWorldMeta.insUnits)
      ? pngWorldMeta.insUnits
      : drawingInsUnits

  /** Размер текущего PNG-плана: в его пикселях живут координаты plan-отметок. */
  const planImgW = rasterView?.imgW ?? 0
  const planImgH = rasterView?.imgH ?? 0

  /**
   * measurePngMapping пересчитывается на каждый рендер, поэтому для отметок
   * держим стабильную копию: иначе эффекты синхронизации перезапускались бы без конца.
   */
  const planMapPpu = measurePngMapping?.pixelsPerUnit ?? 0
  const planMapOriginX = measurePngMapping?.originX ?? 0
  const planMapOriginY = measurePngMapping?.originY ?? 0
  const planMapOffsetX = measurePngMapping?.offsetX ?? 0
  const planMapOffsetY = measurePngMapping?.offsetY ?? 0
  const planMapImgH = measurePngMapping?.imgH ?? 0
  const planMarkMap = useMemo<DwgPlanMarkMap | null>(() => {
    const map = {
      originX: planMapOriginX,
      originY: planMapOriginY,
      pixelsPerUnit: planMapPpu,
      offsetX: planMapOffsetX,
      offsetY: planMapOffsetY,
      imgH: planMapImgH,
    }
    return isUsablePlanMap(map) ? map : null
  }, [planMapOriginX, planMapOriginY, planMapPpu, planMapOffsetX, planMapOffsetY, planMapImgH])

  /** Пишем в отметку привязку к плану — иначе после перерисовки плана она съедет. */
  const planSizeStamp = useCallback(
    (space: DwgPlanMarkSpace): Pick<DwgPlanMark, 'planW' | 'planH' | 'planMap'> => {
      if (space !== 'plan' || planImgW <= 0 || planImgH <= 0) return {}
      const stamp: Pick<DwgPlanMark, 'planW' | 'planH' | 'planMap'> = {
        planW: planImgW,
        planH: planImgH,
      }
      if (planMarkMap) stamp.planMap = planMarkMap
      return stamp
    },
    [planImgW, planImgH, planMarkMap],
  )

  const reloadPlanMarks = useCallback(() => {
    if (!siteId || !fileId) {
      setPlanMarks([])
      return
    }
    const stored = listDwgPlanMarks(siteId, fileId)
    // План могли перерисовать или заменить — приводим координаты к текущему.
    setPlanMarks(
      planImgW > 0 && planImgH > 0
        ? rescalePlanMarksForImage(stored, planImgW, planImgH, { map: planMarkMap }).marks
        : stored,
    )
  }, [siteId, fileId, planImgW, planImgH, planMarkMap])

  useEffect(() => {
    if (!siteId || !fileId) {
      setPlanMarks([])
      return
    }
    reloadPlanMarks()
    let cancelled = false
    void syncDwgPlanMarksFromServer(siteId).then(() => {
      if (!cancelled) reloadPlanMarks()
    })
    const poll = window.setInterval(() => {
      void syncDwgPlanMarksFromServer(siteId).then(() => {
        if (!cancelled) reloadPlanMarks()
      })
    }, 3_000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [reloadPlanMarks, siteId, fileId])

  const onLayersLoadedRef = useRef(onLayersLoaded)
  useEffect(() => {
    onLayersLoadedRef.current = onLayersLoaded
  }, [onLayersLoaded])

  useEffect(() => {
    setLengthPoints([])
    setLengthMeasure(null)
    setAreaPoints([])
    setPlanPixels([])
    setRegionPicks([])
    setSnapWorldPoints([])
    setSnapSegments([])
    setFocusedMarkId(null)
    if (!dxfText.trim()) {
      parsedDocRef.current = null
      return
    }
    try {
      const doc = parseDxf(dxfText)
      parsedDocRef.current = doc
      setSnapWorldPoints(collectDxfSnapPoints(doc))
      setSnapSegments(collectDxfSnapSegments(doc))
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
      if (doc) {
        setSnapWorldPoints(collectDxfSnapPoints(doc))
        setSnapSegments(collectDxfSnapSegments(doc))
      }
      if (doc?.header?.insUnits != null) setDrawingInsUnits(doc.header.insUnits)
    }
    onLayersLoadedRef.current(entityCount)
  }, [cadRef])

  const clearPolylineMeasure = useCallback(() => {
    setLengthPoints([])
    setLengthMeasure(null)
    setAreaPoints([])
    setPlanPixels([])
    setSelectedVertex(null)
  }, [])

  const clearDraftZoneForm = useCallback(() => {
    setRegionDetailsOpen(false)
    setZoneStatusKind(null)
    setZoneStatusNote('')
    setZoneStatusAttachments([])
    setZoneStatusNoteRequired(false)
    setZoneStatusFlash(null)
    setMaterialKind('none')
    setSelectedVertex(null)
  }, [])

  const selectPlan = useCallback(() => {
    setTool(null)
    setSelectedVertex(null)
    setMarkerDrawing(false)
    setMarkerCommentEdit(null)
    // Не сбрасываем замеры и не форсим fit — как свободный просмотр в CAD.
  }, [])

  const selectMeasureTool = useCallback(() => {
    if (!(hasRaster || dxfReady)) return
    setTool('measure')
    clearPolylineMeasure()
    // На цветном плане по умолчанию клик = заливка (то, что пользователь ждёт).
    setFillByClick(hasRaster)
    // region picks keep until «Сбросить»
  }, [clearPolylineMeasure, dxfReady, hasRaster])

  const selectMarksTool = useCallback(() => {
    if (!marksStorageReady) return
    if (!(hasRaster || dxfReady)) return
    setTool('marks')
    clearPolylineMeasure()
    setRegionPicks([])
    clearDraftZoneForm()
    setSelectedVertex(null)
    setMarkerDrawing(false)
    setMarkerCommentEdit(null)
    // На телефоне — только peek, чтобы чертёж не сжимался сразу.
    setMarksPanelExpanded(false)
  }, [clearDraftZoneForm, clearPolylineMeasure, dxfReady, hasRaster, marksStorageReady])

  const selectMarkerTool = useCallback(() => {
    if (!marksStorageReady) return
    if (!(hasRaster || dxfReady)) return
    setTool('marker')
    clearPolylineMeasure()
    setSelectedVertex(null)
    setMarkerDrawing(false)
    setMarkerCommentEdit(null)
    setMarksPanelExpanded(false)
    setMobileMeasureSheetOpen(false)
  }, [clearPolylineMeasure, dxfReady, hasRaster, marksStorageReady])

  const persistMarkerStroke = useCallback(
    (pts: Point2D[], text = '') => {
      if (!siteId || !fileId || pts.length < 2) return
      const markNumber = nextDwgPlanMarkNumber(siteId)
      // Сразу в localStorage + UI, без ожидания сети — штрих не мигает после canvas.
      upsertDwgPlanMark({
        siteId,
        fileId,
        kind: 'marker',
        space: hasRaster ? 'plan' : 'world',
        shape: { type: 'stroke', points: pts },
        text,
        author: loadLocalSession()?.fullName ?? 'Пользователь',
        n: markNumber,
        ...planSizeStamp(hasRaster ? 'plan' : 'world'),
      })
      reloadPlanMarks()
      void persistDwgPlanMarks(siteId)
    },
    [fileId, hasRaster, planSizeStamp, reloadPlanMarks, siteId],
  )

  const commitMarkerStroke = useCallback(
    (pts: Point2D[]) => {
      persistMarkerStroke(pts, '')
    },
    [persistMarkerStroke],
  )
  const onMarkerTap = useCallback(
    (point: Point2D) => {
      const space: DwgPlanMarkSpace = hasRaster ? 'plan' : 'world'
      const view = rasterRef.current?.getViewState()
      const scale = view?.scale && view.scale > 0 ? view.scale : 1
      const hit = findMarkAtPoint(
        planMarks.filter((m) => m.kind === 'marker'),
        point,
        space,
        markHitPlanPx(scale),
      )
      if (!hit) return
      setFocusedMarkId(hit.id)
      setMarkerTextInput(hit.text)
      setMarkerCommentEdit({ id: hit.id, text: hit.text })
    },
    [hasRaster, planMarks, rasterRef],
  )

  const cancelMarkerComment = useCallback(() => {
    setMarkerCommentEdit(null)
    setMarkerTextInput('')
  }, [])

  const saveMarkerComment = useCallback(async () => {
    if (!markerCommentEdit || !siteId || !fileId || markerSaving) return
    const existing = planMarks.find((m) => m.id === markerCommentEdit.id)
    if (!existing) {
      setMarkerCommentEdit(null)
      return
    }
    setMarkerSaving(true)
    try {
      await upsertDwgPlanMarkAndSync({
        ...existing,
        text: markerTextInput.trim(),
        author: existing.author || loadLocalSession()?.fullName || 'Пользователь',
      })
      // Локально уже записано — обновляем UI даже если сеть упала.
      reloadPlanMarks()
      setMarkerCommentEdit(null)
      setMarkerTextInput('')
    } finally {
      setMarkerSaving(false)
    }
  }, [fileId, markerCommentEdit, markerSaving, markerTextInput, planMarks, reloadPlanMarks, siteId])

  const collapseMobileSheets = useCallback(() => {
    setMobileMeasureSheetOpen(false)
    setMarksPanelExpanded(false)
  }, [])

  const removeRegionPick = useCallback((id: string) => {
    setRegionPicks((prev) => prev.filter((r) => r.id !== id))
    setSelectedRegionIds((prev) => prev.filter((x) => x !== id))
  }, [])

  const toggleRegionForStatus = useCallback((id: string) => {
    setSelectedRegionIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }, [])

  const selectAllRegionsForStatus = useCallback(() => {
    setSelectedRegionIds(regionPicks.map((r) => r.id))
  }, [regionPicks])

  const getDxfDocument = useCallback(() => parsedDocRef.current, [])

  const markAuthor = () => loadLocalSession()?.fullName ?? 'Пользователь'

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

  useEffect(() => {
    setSelectedRegionIds((prev) => {
      const ids = regionPicks.map((r) => r.id)
      if (ids.length === 0) return []
      const valid = prev.filter((id) => ids.includes(id))
      const newest = ids[ids.length - 1]!
      // Новая заливка — выбираем её (удобно ставить статус по одной).
      if (!prev.includes(newest) && ids.length >= prev.length) {
        const wasSubset = prev.every((id) => ids.includes(id))
        if (wasSubset && ids.length > prev.length) return [newest]
      }
      if (valid.length > 0) return valid
      return [newest]
    })
  }, [regionPicks])

  const metricsForRegionOutline = useCallback(
    (space: 'plan' | 'world', outline: Point2D[], pixelCount?: number) => {
      if (space === 'plan') {
        const ppu = measurePngMapping?.pixelsPerUnit ?? 0
        if (ppu <= 0) return { area: 0, perimeter: 0 }
        const area =
          pixelCount != null && pixelCount > 0
            ? pixelCount / (ppu * ppu)
            : planPixelArea(outline, ppu)
        return {
          area,
          perimeter: planPixelPerimeter(outline, ppu, true),
        }
      }
      return {
        area: polygonArea(outline),
        perimeter: polygonPerimeter(outline, true),
      }
    },
    [measurePngMapping?.pixelsPerUnit],
  )

  const onPlanRegionPick = useCallback(
    (payload: {
      pixels: Point2D[]
      holes: Point2D[][]
      area: number
      perimeter: number
      maskBBox?: { minX: number; minY: number; maxX: number; maxY: number }
      pixelCount?: number
      maskOverlay?: RegionMaskOverlay
    }) => {
      if (payload.pixels.length < 3) return
      setSelectedVertex(null)
      clearPolylineMeasure()
      appendRegionPick({
        space: 'plan',
        outline: payload.pixels,
        holes: payload.holes,
        area: payload.area,
        perimeter: payload.perimeter,
        pixelCount: payload.pixelCount,
        maskOverlay: payload.maskOverlay,
      })
    },
    [appendRegionPick, clearPolylineMeasure],
  )

  const onWorldRegionPick = useCallback(
    (payload: {
      vertices: Point2D[]
      holes: Point2D[][]
      area: number
      perimeter: number
    }) => {
      if (payload.vertices.length < 3) return
      setSelectedVertex(null)
      clearPolylineMeasure()
      appendRegionPick({
        space: 'world',
        outline: payload.vertices,
        holes: payload.holes,
        area: payload.area,
        perimeter: payload.perimeter,
      })
    },
    [appendRegionPick, clearPolylineMeasure],
  )

  const moveRegionOutlinePoint = useCallback(
    (regionId: string, index: number, point: Point2D) => {
      setRegionPicks((prev) =>
        prev.map((region) => {
          if (region.id !== regionId) return region
          if (index < 0 || index >= region.outline.length) return region
          const outline = [...region.outline]
          outline[index] = point
          const metrics = metricsForRegionOutline(region.space, outline)
          return {
            ...region,
            outline,
            pixelCount: undefined,
            maskOverlay: undefined,
            area: metrics.area,
            perimeter: metrics.perimeter,
          }
        }),
      )
    },
    [metricsForRegionOutline],
  )

  const insertRegionOutlinePoint = useCallback(
    (regionId: string, insertIndex: number, point: Point2D) => {
      setRegionPicks((prev) =>
        prev.map((region) => {
          if (region.id !== regionId) return region
          if (region.outline.length >= MAX_REGION_EDIT_VERTICES) return region
          const idx = Math.max(0, Math.min(insertIndex, region.outline.length))
          const outline = [...region.outline]
          outline.splice(idx, 0, point)
          const metrics = metricsForRegionOutline(region.space, outline)
          return {
            ...region,
            outline,
            pixelCount: undefined,
            maskOverlay: undefined,
            area: metrics.area,
            perimeter: metrics.perimeter,
          }
        }),
      )
    },
    [metricsForRegionOutline],
  )

  const syncLengthFromPoints = useCallback((pts: Point2D[], mapping: PngWorldMapping | null) => {
    if (pts.length === 2) {
      if (mapping) {
        const w0 = planPixelToWorld(mapping, pts[0])
        const w1 = planPixelToWorld(mapping, pts[1])
        setLengthMeasure(measureBetween(w0, w1))
        setLengthPoints([w0, w1])
      } else {
        setLengthMeasure(measureBetween(pts[0], pts[1]))
        setLengthPoints([pts[0], pts[1]])
      }
      return
    }
    setLengthMeasure(null)
    if (pts.length < 2) setLengthPoints([])
  }, [])

  const resetLastMeasure = useCallback(() => {
    if (tool === 'marker') {
      if (markerCommentEdit) {
        setMarkerCommentEdit(null)
        setMarkerTextInput('')
        return
      }
      if (markerDrawing) {
        setMarkerInkCancel((n) => n + 1)
        setMarkerDrawing(false)
        return
      }
      const lastMarker = planMarks.find((m) => m.kind === 'marker')
      if (lastMarker && siteId && fileId) {
        void deleteDwgPlanMarkAndSync(siteId, fileId, lastMarker.id).then(() => {
          reloadPlanMarks()
        })
      }
      return
    }
    if (hasRaster && (tool === 'measure' || tool === 'marks') && planPixels.length > 0) {
      setPlanPixels((prev) => {
        const next = prev.slice(0, -1)
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
      if (planPixels.length <= 1) clearDraftZoneForm()
      else setSelectedVertex(null)
      return
    }
    if (areaPoints.length > 0) {
      setAreaPoints((prev) => {
        const next = prev.slice(0, -1)
        syncLengthFromPoints(next, null)
        return next
      })
      if (areaPoints.length <= 1) clearDraftZoneForm()
      else setSelectedVertex(null)
      return
    }
    if (regionPicks.length > 0) {
      setRegionPicks((prev) => {
        const next = prev.slice(0, -1)
        if (next.length === 0) clearDraftZoneForm()
        else setSelectedVertex(null)
        return next
      })
      return
    }
    if (lengthMeasure || lengthPoints.length > 0) {
      clearPolylineMeasure()
      clearDraftZoneForm()
    }
  }, [
    areaPoints.length,
    clearDraftZoneForm,
    clearPolylineMeasure,
    fileId,
    hasRaster,
    lengthMeasure,
    lengthPoints.length,
    markerDrawing,
    markerCommentEdit,
    measurePngMapping,
    planMarks,
    planPixels.length,
    regionPicks.length,
    reloadPlanMarks,
    siteId,
    syncLengthFromPoints,
    tool,
  ])

  const onPlanPixelClick = useCallback(
    (pixel: Point2D) => {
      const ppu = measurePngMapping?.pixelsPerUnit
      if (!ppu || !measurePngMapping) return
      setSelectedVertex(null)
      setPlanPixels((prev) => {
        const next = [...prev, pixel]
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
    },
    [measurePngMapping, syncLengthFromPoints],
  )

  const insertPlanPixel = useCallback(
    (insertIndex: number, pixel: Point2D) => {
      if (!measurePngMapping) return
      setPlanPixels((prev) => {
        if (prev.length < 2) return prev
        const idx = Math.max(1, Math.min(insertIndex, prev.length))
        const next = [...prev]
        next.splice(idx, 0, pixel)
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
      setSelectedVertex({ space: 'plan', index: insertIndex })
    },
    [measurePngMapping, syncLengthFromPoints],
  )

  const insertWorldPoint = useCallback(
    (insertIndex: number, point: Point2D) => {
      setAreaPoints((prev) => {
        if (prev.length < 2) return prev
        const idx = Math.max(1, Math.min(insertIndex, prev.length))
        const next = [...prev]
        next.splice(idx, 0, point)
        syncLengthFromPoints(next, null)
        return next
      })
      setSelectedVertex({ space: 'world', index: insertIndex })
    },
    [syncLengthFromPoints],
  )

  const movePlanPixel = useCallback(
    (index: number, pixel: Point2D) => {
      if (!measurePngMapping) return
      setPlanPixels((prev) => {
        if (index < 0 || index >= prev.length) return prev
        const next = [...prev]
        next[index] = pixel
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
    },
    [measurePngMapping, syncLengthFromPoints],
  )

  const moveWorldPoint = useCallback(
    (index: number, point: Point2D) => {
      setAreaPoints((prev) => {
        if (index < 0 || index >= prev.length) return prev
        const next = [...prev]
        next[index] = point
        syncLengthFromPoints(next, null)
        return next
      })
    },
    [syncLengthFromPoints],
  )

  const undoLastMeasurePoint = useCallback(() => {
    if (hasRaster && (tool === 'measure' || tool === 'marks')) {
      setPlanPixels((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice(0, -1)
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
    } else {
      setAreaPoints((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice(0, -1)
        syncLengthFromPoints(next, null)
        return next
      })
    }
    setSelectedVertex(null)
  }, [hasRaster, tool, measurePngMapping, syncLengthFromPoints])

  const removeMeasureVertex = useCallback(
    (vertex: MeasureVertexRef) => {
      if (vertex.regionId) {
        setRegionPicks((prev) =>
          prev.flatMap((region) => {
            if (region.id !== vertex.regionId) return [region]
            if (region.outline.length <= 3) return [region]
            const outline = region.outline.filter((_, i) => i !== vertex.index)
            const metrics = metricsForRegionOutline(region.space, outline)
            return [
              {
                ...region,
                outline,
                pixelCount: undefined,
                maskOverlay: undefined,
                area: metrics.area,
                perimeter: metrics.perimeter,
              },
            ]
          }),
        )
      } else if (vertex.space === 'plan') {
        setPlanPixels((prev) => {
          if (vertex.index < 0 || vertex.index >= prev.length) return prev
          const next = prev.filter((_, i) => i !== vertex.index)
          syncLengthFromPoints(next, measurePngMapping)
          return next
        })
      } else {
        setAreaPoints((prev) => {
          if (vertex.index < 0 || vertex.index >= prev.length) return prev
          const next = prev.filter((_, i) => i !== vertex.index)
          syncLengthFromPoints(next, null)
          return next
        })
      }
      setSelectedVertex(null)
    },
    [measurePngMapping, metricsForRegionOutline, syncLengthFromPoints],
  )

  const addMeasureVertex = useCallback(() => {
    const activeRegion = regionPicks.length > 0 ? regionPicks[regionPicks.length - 1]! : null
    const manualDraft = planPixels.length > 0 || areaPoints.length > 0

    if (!manualDraft && activeRegion && regionPicks.length > 0) {
      if (activeRegion.outline.length >= MAX_REGION_EDIT_VERTICES) return
      const outline = activeRegion.outline
      let insertIndex = 0
      let point: Point2D

      if (selectedVertex?.regionId === activeRegion.id) {
        const i = selectedVertex.index
        const a = outline[i]!
        const b = outline[(i + 1) % outline.length]!
        insertIndex = i + 1
        point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      } else {
        let bestLen = -1
        let bestI = 0
        for (let i = 0; i < outline.length; i++) {
          const a = outline[i]!
          const b = outline[(i + 1) % outline.length]!
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          if (len > bestLen) {
            bestLen = len
            bestI = i
          }
        }
        const a = outline[bestI]!
        const b = outline[(bestI + 1) % outline.length]!
        insertIndex = bestI + 1
        point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }

      insertRegionOutlinePoint(activeRegion.id, insertIndex, point)
      setSelectedVertex({
        space: activeRegion.space,
        index: insertIndex,
        regionId: activeRegion.id,
      })
      return
    }

    if (!selectedVertex || selectedVertex.regionId) return

    if (selectedVertex.space === 'plan') {
      setPlanPixels((prev) => {
        if (selectedVertex.index >= prev.length - 1) return prev
        const a = prev[selectedVertex.index]!
        const b = prev[selectedVertex.index + 1]!
        const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const next = [...prev]
        next.splice(selectedVertex.index + 1, 0, point)
        syncLengthFromPoints(next, measurePngMapping)
        return next
      })
      setSelectedVertex({ space: 'plan', index: selectedVertex.index + 1 })
      return
    }

    setAreaPoints((prev) => {
      if (selectedVertex.index >= prev.length - 1) return prev
      const a = prev[selectedVertex.index]!
      const b = prev[selectedVertex.index + 1]!
      const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const next = [...prev]
      next.splice(selectedVertex.index + 1, 0, point)
      syncLengthFromPoints(next, null)
      return next
    })
    setSelectedVertex({ space: 'world', index: selectedVertex.index + 1 })
  }, [
    insertRegionOutlinePoint,
    measurePngMapping,
    areaPoints.length,
    planPixels.length,
    regionPicks,
    selectedVertex,
    syncLengthFromPoints,
  ])

  const onWorldMeasureClick = useCallback(
    (point: Point2D) => {
      setSelectedVertex(null)
      setAreaPoints((prev) => {
        const next = [...prev, point]
        syncLengthFromPoints(next, null)
        return next
      })
    },
    [syncLengthFromPoints],
  )

  useEffect(() => {
    if (!tool) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      e.preventDefault()
      if (selectedVertex) {
        removeMeasureVertex(selectedVertex)
      } else {
        undoLastMeasurePoint()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, selectedVertex, removeMeasureVertex, undoLastMeasurePoint])

  const applyZoneStatus = useCallback(() => {
      if (!siteId || !fileId) return
      if (!zoneStatusKind) return
      if (zoneStatusSaving) return
      const kind = zoneStatusKind
      const note = zoneStatusNote.trim()
      if ((kind === 'issue' || kind === 'note') && !note) {
        setZoneStatusNoteRequired(true)
        return
      }
      setZoneStatusNoteRequired(false)

      const units =
        pngWorldMeta?.insUnits != null && Number.isFinite(pngWorldMeta.insUnits)
          ? pngWorldMeta.insUnits
          : drawingInsUnits

      const ppu = measurePngMapping?.pixelsPerUnit ?? 0
      type MarkDraft = Omit<DwgPlanMark, 'id' | 'createdAtIso' | 'updatedAtIso' | 'deletedAtIso'>
      const drafts: MarkDraft[] = []
      let savedRegionIds: string[] = []

      if (planPixels.length >= 3 && ppu > 0) {
        const areaM2 = drawingAreaToSquareMeters(planPixelArea(planPixels, ppu), units)
        drafts.push({
          siteId,
          fileId,
          kind,
          space: 'plan',
          shape: { type: 'zone', outline: planPixels, areaM2 },
          text: note,
          author: markAuthor(),
          ...planSizeStamp('plan'),
        })
      } else if (regionPicks.length > 0) {
        const selected = regionPicks.filter((r) => selectedRegionIds.includes(r.id))
        const targets = selected.length > 0 ? selected : [regionPicks[regionPicks.length - 1]!]
        savedRegionIds = targets.map((r) => r.id)
        for (const region of targets) {
          const areaM2 = drawingAreaToSquareMeters(region.area, units)
          drafts.push({
            siteId,
            fileId,
            kind,
            space: region.space,
            shape: { type: 'zone', outline: region.outline, areaM2 },
            text: note,
            author: markAuthor(),
            ...planSizeStamp(region.space),
          })
        }
      } else if (areaPoints.length >= 3) {
        const areaM2 = drawingAreaToSquareMeters(polygonArea(areaPoints), drawingInsUnits)
        drafts.push({
          siteId,
          fileId,
          kind,
          space: 'world',
          shape: { type: 'zone', outline: areaPoints, areaM2 },
          text: note,
          author: markAuthor(),
        })
      }

      if (drafts.length === 0) return

      const filesToUpload = kindNeedsHandoverDoc(kind) ? [...zoneStatusAttachments] : []
      setZoneStatusSaving(true)

      void (async () => {
        const statusLabel = markKindMeta(kind).label
        const userNote = note
        let attachmentIds: string[] | undefined
        let folderLabel: string | null = null
        let docsOk = true
        let lastMark: DwgPlanMark | null = null
        let allOk = true
        const numbers: number[] = []

        for (let i = 0; i < drafts.length; i++) {
          const draft = { ...drafts[i]! }
          const markId = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}`
          const markNumber = nextDwgPlanMarkNumber(siteId)
          const areaM2 =
            draft.shape.type === 'zone' && draft.shape.areaM2 != null
              ? draft.shape.areaM2
              : undefined

          if (!draft.text.trim() && areaM2 != null) {
            draft.text = `Участок ${Math.round(areaM2 * 10) / 10} м²`
          }

          if (i === 0 && filesToUpload.length > 0) {
            const uploaded = await uploadCkkbHandoverDocs(
              siteId,
              filesToUpload,
              siteDisplayName || undefined,
              {
                statusLabel,
                areaM2,
                note: userNote || undefined,
                planName: drawingName,
                markId,
                markNumber,
                author: draft.author,
                siteName: siteDisplayName || undefined,
              },
            )
            attachmentIds = uploaded.fileIds
            folderLabel = uploaded.folderName
            docsOk = uploaded.ok
          } else if (i === 0 && kindNeedsHandoverDoc(kind) && filesToUpload.length === 0) {
            try {
              const uploaded = await uploadCkkbHandoverDocs(siteId, [], siteDisplayName || undefined)
              folderLabel = uploaded.folderName
            } catch {
              /* папка не обязательна */
            }
          }

          if (attachmentIds && attachmentIds.length > 0) draft.attachmentIds = attachmentIds

          const { mark, ok } = await upsertDwgPlanMarkAndSync({
            ...draft,
            id: markId,
            n: markNumber,
          })
          if (!ok) allOk = false
          lastMark = mark
          numbers.push(mark.n ?? markNumber)
        }

        reloadPlanMarks()
        if (lastMark) setFocusedMarkId(lastMark.id)
        clearPolylineMeasure()
        if (savedRegionIds.length > 0) {
          const saved = new Set(savedRegionIds)
          setRegionPicks((prev) => prev.filter((r) => !saved.has(r.id)))
          setSelectedRegionIds((prev) => prev.filter((id) => !saved.has(id)))
        } else {
          setRegionPicks([])
          setSelectedRegionIds([])
        }
        setZoneStatusNote('')
        setZoneStatusKind(null)
        setZoneStatusAttachments([])
        setZoneStatusSaving(false)

        const numLabel =
          numbers.length === 1 ? `№${numbers[0]}` : `${numbers.length} зон (№${numbers.join(', №')})`
        const parts = [
          allOk
            ? `Сохранено: ${numLabel} ${statusLabel}`
            : `Сохранено на устройстве: ${numLabel} ${statusLabel}`,
        ]
        if (filesToUpload.length > 0 && folderLabel) {
          parts.push(
            docsOk ? `фото/акт → «${folderLabel}»` : `файлы локально → «${folderLabel}»`,
          )
        } else if (folderLabel && kindNeedsHandoverDoc(kind)) {
          parts.push(`папка «${folderLabel}»`)
        }
        setZoneStatusFlash(parts.join(' · '))
        window.setTimeout(() => setZoneStatusFlash(null), 3200)
      })().catch(() => {
        setZoneStatusSaving(false)
        setZoneStatusFlash('Не удалось сохранить. Попробуйте ещё раз.')
        window.setTimeout(() => setZoneStatusFlash(null), 2800)
      })
    },
    [
      areaPoints,
      drawingInsUnits,
      drawingName,
      fileId,
      measurePngMapping?.pixelsPerUnit,
      planPixels,
      planSizeStamp,
      pngWorldMeta?.insUnits,
      regionPicks,
      reloadPlanMarks,
      selectedRegionIds,
      siteDisplayName,
      siteId,
      zoneStatusAttachments,
      zoneStatusKind,
      zoneStatusNote,
      zoneStatusSaving,
      clearPolylineMeasure,
    ],
  )

  const focusMarkOnPlan = useCallback(
    (mark: DwgPlanMark) => {
      setFocusedMarkId(mark.id)
      const c = markCentroid(mark)
      if (mark.space === 'plan' && hasRaster) {
        const view = rasterRef.current?.getViewState()
        if (!view) return
        const [sx, sy] = imagePixelToScreen(view, c.x, c.y)
        rasterRef.current?.panBy(view.stageW / 2 - sx, view.stageH / 2 - sy)
        return
      }
      if (mark.space === 'world') {
        const viewer = cadRef.current?.getViewer()
        const canvas = wrapRef.current?.querySelector('canvas')
        if (!viewer || !canvas) return
        const vt = viewer.getViewTransform()
        const [sx, sy] = worldToScreen(vt, c.x, c.y)
        viewer.handlePan(canvas.clientWidth / 2 - sx, canvas.clientHeight / 2 - sy)
      }
    },
    [cadRef, hasRaster, rasterRef, wrapRef],
  )

  const onMarkPlace = useCallback(
    (point: Point2D, space: DwgPlanMarkSpace) => {
      const view = rasterRef.current?.getViewState()
      const scale = view?.scale && view.scale > 0 ? view.scale : 1
      const hit = findMarkAtPoint(planMarks, point, space, markHitPlanPx(scale))
      if (hit) {
        focusMarkOnPlan(hit)
        return
      }
      if (space === 'plan') onPlanPixelClick(point)
      else onWorldMeasureClick(point)
    },
    [focusMarkOnPlan, onPlanPixelClick, onWorldMeasureClick, planMarks, rasterRef],
  )

  const deleteMark = useCallback(
    (id: string) => {
      if (!siteId || !fileId) return
      if (focusedMarkId === id) setFocusedMarkId(null)
      void deleteDwgPlanMarkAndSync(siteId, fileId, id).then(() => {
        reloadPlanMarks()
      })
    },
    [fileId, focusedMarkId, reloadPlanMarks, siteId],
  )

  const canPlan = planExpected || hasRaster
  const measuring = tool !== null
  const measureOnPlan = measuring && hasRaster
  const planClosed = planPixels.length >= 3
  const areaClosed = measureOnPlan ? planClosed : areaPoints.length >= 3
  const regionClosed = regionPicks.length > 0
  const manualDraftActive = measureOnPlan ? planPixels.length > 0 : areaPoints.length > 0
  const activeEditRegion =
    regionClosed && !manualDraftActive ? regionPicks[regionPicks.length - 1]! : null
  const showVertexTools =
    measuring && (activeEditRegion != null || manualDraftActive || selectedVertex != null)
  const canDeleteVertex = Boolean(
    selectedVertex &&
      (!selectedVertex.regionId ||
        (activeEditRegion &&
          selectedVertex.regionId === activeEditRegion.id &&
          activeEditRegion.outline.length > 3)),
  )
  const canAddVertex = Boolean(
    (activeEditRegion && activeEditRegion.outline.length < MAX_REGION_EDIT_VERTICES) ||
      (selectedVertex &&
        !selectedVertex.regionId &&
        (selectedVertex.space === 'plan'
          ? selectedVertex.index < planPixels.length - 1
          : selectedVertex.index < areaPoints.length - 1)),
  )
  const showRegionDetails = regionDetailsOpen

  const toggleMeasureDetails = useCallback(() => {
    if (isNarrowViewport || isLandscapePhone) setMobileMeasureSheetOpen(true)
    setMeasureDetailsOpen((open) => !open)
  }, [isLandscapePhone, isNarrowViewport])

  const toggleMaterialCalc = useCallback(() => {
    setMobileMeasureSheetOpen(true)
    setRegionDetailsOpen((open) => {
      const next = !open
      if (next && materialKind === 'none') setMaterialKind('asphalt')
      return next
    })
    window.requestAnimationFrame(() => {
      const body = mobileSheetBodyRef.current
      const target =
        body?.querySelector('#region-readout-material, #area-readout-details') ??
        body?.querySelector(`.${styles.materialCalcTitle}`)
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  }, [materialKind])
  const isMobileLayout = isNarrowViewport || isLandscapePhone
  const measurePointCount = measureOnPlan ? planPixels.length : areaPoints.length

  useEffect(() => {
    if (regionPicks.length === 0 && measurePointCount < 3) {
      setMeasureDetailsOpen(false)
    }
  }, [regionPicks.length, measurePointCount])

  useEffect(() => {
    const mobileMq = window.matchMedia('(max-width: 719px)')
    const landMq = window.matchMedia('(max-height: 520px) and (orientation: landscape)')
    const sync = () => {
      const mobile = mobileMq.matches
      setIsNarrowViewport(mobile)
      setIsLandscapePhone(landMq.matches)
      if (!mobile && !landMq.matches) setRegionDetailsOpen(false)
    }
    sync()
    mobileMq.addEventListener('change', sync)
    landMq.addEventListener('change', sync)
    return () => {
      mobileMq.removeEventListener('change', sync)
      landMq.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    const prev = regionPickCountRef.current
    regionPickCountRef.current = regionPicks.length
    if (regionPicks.length === 0) {
      if (isMobileLayout && tool === 'measure') setRegionDetailsOpen(false)
      return
    }
    if (regionPicks.length > prev && isMobileLayout) {
      setRegionDetailsOpen(false)
      setMobileMeasureSheetOpen(true)
    }
  }, [regionPicks.length, isMobileLayout, tool])

  const areaClosedPrevRef = useRef(false)
  useEffect(() => {
    const wasClosed = areaClosedPrevRef.current
    areaClosedPrevRef.current = areaClosed
    if (tool === 'measure' && areaClosed && !wasClosed && isMobileLayout && !regionClosed) {
      setRegionDetailsOpen(false)
      setMobileMeasureSheetOpen(true)
    }
    if (tool === 'measure' && !areaClosed && isMobileLayout && !regionClosed) {
      setRegionDetailsOpen(false)
    }
  }, [areaClosed, isMobileLayout, regionClosed, tool])

  useEffect(() => {
    const prev = measurePointCountPrevRef.current
    measurePointCountPrevRef.current = measurePointCount
    if (!isMobileLayout || tool !== 'measure') return
    if (measurePointCount === 2 && prev < 2) setMobileMeasureSheetOpen(true)
    if (measurePointCount >= 3 && prev < 3 && !regionClosed) setMobileMeasureSheetOpen(true)
  }, [isMobileLayout, measurePointCount, regionClosed, tool])

  useEffect(() => {
    if (!isMobileLayout) return
    // При смене режима — только полоска peek, без авто-раскрытия на полэкрана.
    if (tool === 'marks' || tool === 'marker') setMarksPanelExpanded(false)
  }, [isMobileLayout, tool])

  useEffect(() => {
    if (!isMobileLayout || !regionDetailsOpen) return
    window.requestAnimationFrame(() => {
      const body = mobileSheetBodyRef.current
      const target = body?.querySelector(`.${styles.materialBody}, .${styles.materialKindRow}`)
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  }, [isMobileLayout, materialKind, regionDetailsOpen])

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
  const regionRows = useMemo(
    () =>
      regionPicks.map((r, index) => ({
        id: r.id,
        index,
        area: drawingAreaToSquareMeters(r.area, unitsForMeasure),
        perimeter: drawingLengthToMeters(r.perimeter, unitsForMeasure),
        color: REGION_PALETTE[index % REGION_PALETTE.length].stroke,
        selected: selectedRegionIds.includes(r.id),
      })),
    [regionPicks, selectedRegionIds, unitsForMeasure],
  )
  const selectedRegionCount = regionRows.filter((r) => r.selected).length
  const zoneStatusTargetHint =
    regionRows.length > 1
      ? selectedRegionCount === regionRows.length
        ? `Статус для всех ${regionRows.length} зон`
        : selectedRegionCount === 1
          ? `Статус только для зоны ${
              (regionRows.find((r) => r.selected)?.index ?? 0) + 1
            }`
          : `Статус для ${selectedRegionCount} зон`
      : null
  const zoneStatusSaveLabel =
    regionRows.length > 1 && selectedRegionCount > 1
      ? `OK · ${selectedRegionCount}`
      : undefined

  const regionStatusList =
    regionRows.length > 1 ? (
      <div className={styles.regionSelectBlock}>
        <div className={styles.regionSelectHead}>
          <span className={styles.regionSelectTitle}>Зоны</span>
          <button
            type="button"
            className={styles.regionSelectAllBtn}
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectAllRegionsForStatus}
            disabled={selectedRegionCount === regionRows.length}
          >
            Все
          </button>
        </div>
        <ul className={styles.regionListCompact}>
          {regionRows.map((row) => (
            <li
              key={row.id}
              className={`${styles.regionListCompactItem} ${
                row.selected ? styles.regionListCompactItemSelected : ''
              }`}
            >
              <button
                type="button"
                className={styles.regionSelectMain}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => toggleRegionForStatus(row.id)}
                aria-pressed={row.selected}
                title={
                  row.selected
                    ? `Зона ${row.index + 1} выбрана — ещё раз, чтобы снять`
                    : `Добавить зону ${row.index + 1} к статусу`
                }
              >
                <span
                  className={styles.regionBadge}
                  style={{ background: row.color }}
                  aria-hidden
                >
                  {row.index + 1}
                </span>
                <span className={styles.regionSelectMetrics}>
                  {formatArea(row.area)} · {formatLinear(row.perimeter)}
                </span>
                {row.selected ? (
                  <span className={styles.regionSelectCheck} aria-hidden>
                    ✓
                  </span>
                ) : (
                  <span className={styles.regionSelectCheckMute} aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={styles.regionRemove}
                aria-label={`Удалить заливку ${row.index + 1}`}
                onClick={() => removeRegionPick(row.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {zoneStatusTargetHint ? (
          <p className={styles.regionSelectHint}>{zoneStatusTargetHint}</p>
        ) : null}
      </div>
    ) : null
  const regionAreaSum = regionRows.reduce((s, r) => s + r.area, 0)
  const regionPerimeterSum = regionRows.reduce((s, r) => s + r.perimeter, 0)
  const orderAreaM2 =
    manualDraftActive && areaClosed
      ? areaValue
      : regionClosed
        ? regionAreaSum
        : areaClosed
          ? areaValue
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
  const measureActive = tool === 'measure'
  const marksActive = tool === 'marks'
  const markerActive = tool === 'marker'
  const filteredPlanMarks = filterDwgPlanMarks(planMarks, {
    kinds: markFilterKinds,
    period: markFilterDateFrom || markFilterDateTo ? 'all' : markFilterPeriod,
    dateFrom: markFilterDateFrom || undefined,
    dateTo: markFilterDateTo || undefined,
  })
  /** Список: при выборе участков на плане — только отметки внутри них. */
  const marksInList =
    marksActive && regionPicks.length > 0
      ? filteredPlanMarks.filter((mark) =>
          regionPicks.some((pick) => markIntersectsRegionPick(mark, pick)),
        )
      : filteredPlanMarks
  const markDateFilterActive = Boolean(markFilterDateFrom || markFilterDateTo)
  /** На плане всегда все отметки по фильтру типа/даты — выделение участка список не скрывает. */
  const overlayPlanMarks =
    marksActive || markerActive
      ? filteredPlanMarks
      : filteredPlanMarks.filter((m) => m.kind === 'marker' || m.shape.type === 'stroke')
  const canApplyZoneStatus =
    marksStorageReady && (regionPicks.length > 0 || planPixels.length >= 3 || areaPoints.length >= 3)
  const zoneStatusProps = canApplyZoneStatus
    ? {
        enabled: true as const,
        selectedKind: zoneStatusKind,
        onSelectKind: (kind: DwgPlanMarkKind) => {
          if (isMobileLayout) setMobileMeasureSheetOpen(true)
          setZoneStatusKind(kind)
          setZoneStatusNoteRequired(false)
          if (!kindNeedsHandoverDoc(kind)) setZoneStatusAttachments([])
          if (kindNeedsHandoverDoc(kind)) {
            window.requestAnimationFrame(() => {
              const body = mobileSheetBodyRef.current
              const docs = body?.querySelector(`.${styles.zoneStatusDocs}`)
              if (docs instanceof HTMLElement) {
                docs.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              }
            })
          }
        },
        note: zoneStatusNote,
        onNoteChange: (text: string) => {
          setZoneStatusNote(text)
          if (text.trim()) setZoneStatusNoteRequired(false)
        },
        noteRequired: zoneStatusNoteRequired,
        attachments: zoneStatusAttachments,
        onAttachmentsChange: setZoneStatusAttachments,
        handoverFolderHint,
        saving: zoneStatusSaving,
        onSave: applyZoneStatus,
        flash: zoneStatusFlash,
        materialCalcOpen: regionDetailsOpen,
        onToggleMaterialCalc: toggleMaterialCalc,
        saveLabel: zoneStatusSaveLabel,
      }
    : undefined
  const hasMeasureData =
    (measureActive &&
      (planPixels.length > 0 ||
        lengthPoints.length > 0 ||
        Boolean(lengthMeasure) ||
        areaPoints.length > 0 ||
        regionPicks.length > 0)) ||
    (marksActive &&
      (regionPicks.length > 0 ||
        planPixels.length > 0 ||
        lengthPoints.length > 0 ||
        Boolean(lengthMeasure) ||
        areaPoints.length > 0)) ||
    (markerActive &&
      (markerDrawing ||
        markerCommentEdit != null ||
        planMarks.some((m) => m.kind === 'marker')))
  const showReset = measuring && hasMeasureData
  const markerStrokeCount = planMarks.filter((m) => m.kind === 'marker').length
  const markerMarksList = planMarks.filter((m) => m.kind === 'marker')
  const canUndoLastPoint =
    (measureActive || marksActive) && (measureOnPlan ? planPixels.length > 0 : areaPoints.length > 0)
  const toolsReady = hasRaster || dxfReady
  const showRaster = hasRaster
  const showVectorVisible = measuring && dxfReady && !hasRaster && pngState !== 'loading'
  // Пока ждём PNG — только экран загрузки, без «полуконтуров» и лишних подписей.
  const showPlanLoading = planExpected && !hasRaster && !measuring && pngState === 'loading'

  useEffect(() => {
    if (pngState === 'failed' && dxfReady && !hasRaster && tool === null) {
      setTool('measure')
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
        regionPicks={regionPicks}
        selectedRegionIds={selectedRegionIds}
        planMarks={overlayPlanMarks}
        focusedMarkId={focusedMarkId}
        snapWorldPoints={snapWorldPoints}
        snapSegments={snapSegments}
        onPlanPixelClick={onPlanPixelClick}
        onPlanPixelInsert={insertPlanPixel}
        onWorldPointInsert={insertWorldPoint}
        onMarkPlace={onMarkPlace}
        onPlanRegionPick={onPlanRegionPick}
        onWorldRegionPick={onWorldRegionPick}
        getDxfDocument={getDxfDocument}
        mode={tool}
        lengthPoints={lengthPoints}
        lengthMeasure={lengthMeasure}
        areaPoints={areaPoints}
        onWorldMeasureClick={onWorldMeasureClick}
        selectedVertex={selectedVertex}
        onVertexSelect={setSelectedVertex}
        onPlanPixelMove={movePlanPixel}
        onWorldPointMove={moveWorldPoint}
        onRegionOutlineMove={moveRegionOutlinePoint}
        onRegionOutlineInsert={insertRegionOutlinePoint}
        onVertexDelete={removeMeasureVertex}
        touchLarge={isMobileLayout}
        onNavigate={isMobileLayout ? collapseMobileSheets : undefined}
        onMarkerStrokeComplete={markerActive ? commitMarkerStroke : undefined}
        onMarkerDrawingChange={markerActive ? setMarkerDrawing : undefined}
        markerInkCancel={markerInkCancel}
        onMarkerTap={markerActive ? onMarkerTap : undefined}
        showEdgeDimensions={measureDetailsOpen}
        insUnits={unitsForMeasure}
        pixelsPerUnit={ppu}
        fillByClick={fillByClick && measureOnPlan}
      />
    ) : null

  const materialCalcOnlyPanel = (
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
      crushedStoneCm={crushedStoneCm}
      onCrushedStoneCm={setCrushedStoneCm}
      crushedStoneFraction={crushedStoneFraction}
      onCrushedStoneFraction={setCrushedStoneFraction}
      sandCm={sandCm}
      onSandCm={setSandCm}
      asphaltOrder={asphaltOrder}
      soilOrder={soilOrder}
      crushedStoneOrder={crushedStoneOrder}
      sandOrder={sandOrder}
      hideMaterialOrder={false}
    />
  )

  const showRegionReadout =
    (measureActive || marksActive) && regionClosed && !manualDraftActive
  const showAreaReadout =
    (measureActive || marksActive) &&
    measurePointCount >= 3 &&
    (!regionClosed || manualDraftActive)
  const showLengthReadout =
    (measureActive || marksActive) &&
    measurePointCount === 2 &&
    lengthReadout &&
    (!regionClosed || manualDraftActive)
  const mobileMeasureReadoutVisible = showRegionReadout || showAreaReadout || showLengthReadout
  const toggleMobileMeasureSheet = useCallback(() => {
    setMobileMeasureSheetOpen((open) => !open)
  }, [])
  const regionPeekArea = formatArea(
    regionRows.length > 1 ? regionAreaSum : (regionRows[regionRows.length - 1]?.area ?? 0),
  )
  const regionPeekPerimeter = formatLinear(
    regionRows.length > 1 ? regionPerimeterSum : (regionRows[regionRows.length - 1]?.perimeter ?? 0),
  )
  const regionPeekValue =
    regionRows.length > 1
      ? `${regionPeekArea} · ${regionPeekPerimeter} · ${regionRows.length} заливок`
      : `${regionPeekArea} · ${regionPeekPerimeter}`
  const areaPeekValue = `${formatArea(areaValue)} · ${formatLinear(perimeterValue)}`
  const canShowMeasureDetails = showRegionReadout || showAreaReadout
  useEffect(() => {
    if (!isMobileLayout) setMobileMeasureSheetOpen(false)
  }, [isMobileLayout])

  useEffect(() => {
    setMobileMeasureSheetOpen(false)
  }, [tool])

  useEffect(() => {
    if (tool !== 'marks' && tool !== 'marker') setMarksPanelExpanded(false)
  }, [tool])

  useEffect(() => {
    if (!mobileMeasureReadoutVisible) setMobileMeasureSheetOpen(false)
  }, [mobileMeasureReadoutVisible])

  useEffect(() => {
    if (!isMobileLayout) {
      chromeRootRef.current?.style.removeProperty('--mobile-kb-inset')
      stageShellRef.current?.style.removeProperty('--mobile-kb-inset')
      stageShellRef.current?.style.removeProperty('--mobile-sheet-open-h')
      return
    }
    const vv = window.visualViewport
    if (!vv) return
    const syncKb = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      const value = inset > 8 ? `${Math.round(inset)}px` : null
      for (const el of [chromeRootRef.current, stageShellRef.current]) {
        if (!el) continue
        if (value) el.style.setProperty('--mobile-kb-inset', value)
        else el.style.removeProperty('--mobile-kb-inset')
      }
      const stage = stageShellRef.current
      if (stage) {
        const landscape = window.matchMedia('(max-height: 520px) and (orientation: landscape)').matches
        const openH = landscape ? 'min(42dvh, 220px)' : 'min(46dvh, 420px)'
        stage.style.setProperty('--mobile-sheet-open-h', openH)
      }
    }
    syncKb()
    vv.addEventListener('resize', syncKb)
    vv.addEventListener('scroll', syncKb)
    window.addEventListener('orientationchange', syncKb)
    const chromeRoot = chromeRootRef.current
    const stageShell = stageShellRef.current
    return () => {
      vv.removeEventListener('resize', syncKb)
      vv.removeEventListener('scroll', syncKb)
      window.removeEventListener('orientationchange', syncKb)
      chromeRoot?.style.removeProperty('--mobile-kb-inset')
      stageShell?.style.removeProperty('--mobile-kb-inset')
      stageShell?.style.removeProperty('--mobile-sheet-open-h')
    }
  }, [isMobileLayout, mobileMeasureSheetOpen, marksPanelExpanded, markerCommentEdit])

  const mobileDockVisible =
    isMobileLayout && (mobileMeasureReadoutVisible || marksActive || markerActive)
  const mobileDockExpanded =
    isMobileLayout &&
    (mobileMeasureSheetOpen || ((marksActive || markerActive) && marksPanelExpanded))

  const mobileSheetToolbar = (
    <>
      {canUndoLastPoint ? (
        <button
          type="button"
          className={styles.mobileSheetToolBtn}
          onPointerDown={(e) => e.preventDefault()}
          onClick={undoLastMeasurePoint}
        >
          <ToolIcon name="undo" />
          Назад
        </button>
      ) : null}
      {canShowMeasureDetails ? (
        <button
          type="button"
          className={`${styles.mobileSheetToolBtn} ${measureDetailsOpen ? styles.mobileSheetToolBtnActive : ''}`}
          aria-pressed={measureDetailsOpen}
          onPointerDown={(e) => e.preventDefault()}
          onClick={toggleMeasureDetails}
        >
          Детали
        </button>
      ) : null}
      {showReset ? (
        <button
          type="button"
          className={styles.mobileSheetToolBtn}
          onPointerDown={(e) => e.preventDefault()}
          onClick={resetLastMeasure}
        >
          <ToolIcon name="resetLast" />
          Сбросить
        </button>
      ) : null}
    </>
  )

  const marksPeekValue =
    regionPicks.length > 0 && marksInList.length !== filteredPlanMarks.length
      ? `${marksInList.length} / ${filteredPlanMarks.length}`
      : `${marksInList.length}`

  return (
    <div
      ref={chromeRootRef}
      className={`${styles.chromeRoot} ${isMobileLayout ? styles.chromeRootMobile : ''}`}
    >
      <div className={`${styles.toolbar} ${isMobileLayout ? styles.toolbarMobile : ''}`} role="toolbar" aria-label="Инструменты чертежа">
        {isMobileLayout ? (
          <div className={styles.mobileToolStack}>
            <div
              className={`${styles.toolSeg} ${canPlan ? styles.toolSegModes : styles.toolSegThree}`}
              role="tablist"
              aria-label="Режим просмотра"
            >
              {canPlan ? (
                <button
                  type="button"
                  role="tab"
                  className={`${styles.toolSegBtn} ${planActive ? styles.toolSegBtnActive : ''}`}
                  aria-selected={planActive}
                  title="Просмотр плана — перемещение и подгонка по экрану"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={selectPlan}
                >
                  <ToolIcon name="plan" />
                  <span>План</span>
                </button>
              ) : null}
              <button
                type="button"
                role="tab"
                className={`${styles.toolSegBtn} ${measureActive ? styles.toolSegBtnActive : ''}`}
                aria-selected={measureActive}
                disabled={!toolsReady}
                title="Измерить"
                onPointerDown={(e) => e.preventDefault()}
                onClick={selectMeasureTool}
              >
                <ToolIcon name="measure" />
                <span>Замер</span>
              </button>
              {measureActive && measureOnPlan ? (
                <button
                  type="button"
                  role="tab"
                  className={`${styles.toolSegBtn} ${fillByClick ? styles.toolSegBtnActive : ''}`}
                  aria-selected={fillByClick}
                  title="Клик по цветной зоне — выделить заливку"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setFillByClick(true)}
                >
                  <span>Заливка</span>
                </button>
              ) : null}
              {measureActive && measureOnPlan ? (
                <button
                  type="button"
                  role="tab"
                  className={`${styles.toolSegBtn} ${!fillByClick ? styles.toolSegBtnActive : ''}`}
                  aria-selected={!fillByClick}
                  title="Клик ставит точки длины/площади"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setFillByClick(false)}
                >
                  <span>Точки</span>
                </button>
              ) : null}
              <button
                type="button"
                role="tab"
                className={`${styles.toolSegBtn} ${marksActive ? styles.toolSegBtnActive : ''}`}
                aria-selected={marksActive}
                disabled={!toolsReady || !marksStorageReady}
                title={
                  !marksStorageReady
                    ? 'Отметки недоступны для этого файла'
                    : 'Отметки на плане'
                }
                onPointerDown={(e) => e.preventDefault()}
                onClick={selectMarksTool}
              >
                <ToolIcon name="marks" />
                <span>Метки</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`${styles.toolSegBtn} ${markerActive ? styles.toolSegBtnActive : ''} ${styles.toolSegBtnMarker}`}
                aria-selected={markerActive}
                disabled={!toolsReady || !marksStorageReady}
                title={
                  !marksStorageReady
                    ? 'Маркер недоступен для этого файла'
                    : 'Белый фломастер — рисовать и писать на плане'
                }
                onPointerDown={(e) => e.preventDefault()}
                onClick={selectMarkerTool}
              >
                <ToolIcon name="marker" />
                <span>Маркер</span>
              </button>
            </div>
            <button
              type="button"
              className={`${styles.mobileUndoBtn} ${showReset ? styles.mobileUndoBtnReady : ''}`}
              disabled={!measuring || !showReset}
              title={
                !measuring
                  ? 'Сначала выберите режим'
                  : showReset
                    ? markerActive
                      ? 'Убрать последнюю зарисовку'
                      : 'Шаг назад — убрать последнюю точку, заливку или зарисовку'
                    : 'Пока нечего отменять'
              }
              onPointerDown={(e) => e.preventDefault()}
              onClick={resetLastMeasure}
            >
              <ToolIcon name="resetLast" />
              <span>Назад</span>
            </button>
          </div>
        ) : (
          <>
        <div className={styles.toolGroup}>
          {canPlan ? (
            <button
              type="button"
              className={`${styles.toolBtn} ${planActive ? styles.toolBtnActive : ''}`}
              aria-pressed={planActive}
              title="Просмотр плана — перемещение и подгонка по экрану"
              onPointerDown={(e) => e.preventDefault()}
              onClick={selectPlan}
            >
              <ToolIcon name="plan" />
              <span>Просмотр</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.toolBtn} ${measureActive ? styles.toolBtnActive : ''}`}
            aria-pressed={measureActive}
            disabled={!toolsReady}
            title={
              !toolsReady
                ? 'Дождитесь загрузки чертежа'
                : measureOnPlan
                  ? fillByClick
                    ? 'Клик по цветной зоне — заливка. Кнопка «Точки» — длина/площадь'
                    : 'Клик — точки. Кнопка «Заливка» — выделение зоны'
                  : 'Тап — точки (длина/площадь). Удержание — заливка'
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectMeasureTool}
          >
            <ToolIcon name="measure" />
            <span>Измерить</span>
          </button>
          {measureActive && measureOnPlan ? (
            <button
              type="button"
              className={`${styles.toolBtn} ${fillByClick ? styles.toolBtnActive : ''}`}
              aria-pressed={fillByClick}
              title="Клик по цветной зоне — выделить заливку"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setFillByClick(true)}
            >
              <span>Заливка</span>
            </button>
          ) : null}
          {measureActive && measureOnPlan ? (
            <button
              type="button"
              className={`${styles.toolBtn} ${!fillByClick ? styles.toolBtnActive : ''}`}
              aria-pressed={!fillByClick}
              title="Клик ставит точки длины/площади"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setFillByClick(false)}
            >
              <span>Точки</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.toolBtn} ${marksActive ? styles.toolBtnActive : ''}`}
            aria-pressed={marksActive}
            disabled={!toolsReady || !marksStorageReady}
            title={
              !marksStorageReady
                ? 'Отметки недоступны для этого файла'
                : !toolsReady
                  ? 'Дождитесь загрузки чертежа'
                  : 'Тап — точки, Shift/удержание/двойной клик — заливка. Отметки'
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectMarksTool}
          >
            <ToolIcon name="marks" />
            <span>Отметки</span>
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${markerActive ? styles.toolBtnActive : ''} ${styles.toolBtnMarker}`}
            aria-pressed={markerActive}
            disabled={!toolsReady || !marksStorageReady}
            title={
              !marksStorageReady
                ? 'Маркер недоступен для этого файла'
                : !toolsReady
                  ? 'Дождитесь загрузки чертежа'
                  : 'Белый фломастер: рисуйте и пишите по плану. Тап по линии — комментарий'
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={selectMarkerTool}
          >
            <ToolIcon name="marker" />
            <span>Маркер</span>
          </button>
        </div>
        {canUndoLastPoint ? (
          <>
            <span className={styles.toolSep} aria-hidden />
            <button
              type="button"
              className={styles.toolBtnGhost}
              title="Убрать последнюю точку"
              onPointerDown={(e) => e.preventDefault()}
              onClick={undoLastMeasurePoint}
            >
              <ToolIcon name="undo" />
              <span>Назад</span>
            </button>
          </>
        ) : null}
        {canShowMeasureDetails ? (
          <>
            <span className={styles.toolSep} aria-hidden />
            <button
              type="button"
              className={`${styles.toolBtnGhost} ${measureDetailsOpen ? styles.toolBtnActive : ''}`}
              aria-pressed={measureDetailsOpen}
              title={measureDetailsOpen ? 'Скрыть размеры сторон на плане' : 'Показать размеры сторон на плане'}
              onPointerDown={(e) => e.preventDefault()}
              onClick={toggleMeasureDetails}
            >
              <span>{measureDetailsOpen ? 'Скрыть детали' : 'Детали'}</span>
            </button>
          </>
        ) : null}
        {showVertexTools && !isMobileLayout ? (
          <>
            <span className={styles.toolSep} aria-hidden />
            <button
              type="button"
              className={styles.toolBtnGhost}
              disabled={!canAddVertex}
              title={
                !canAddVertex
                  ? activeEditRegion
                    ? 'Достигнут лимит точек контура'
                    : 'Выберите точку, между которой вставить новую'
                  : selectedVertex?.regionId || activeEditRegion
                    ? 'Вставить точку на середину стороны'
                    : 'Вставить точку между выбранной и следующей'
              }
              onPointerDown={(e) => e.preventDefault()}
              onClick={addMeasureVertex}
            >
              <ToolIcon name="addPoint" />
              <span>Добавить точку</span>
            </button>
            <button
              type="button"
              className={styles.toolBtnGhost}
              disabled={!canDeleteVertex}
              title={canDeleteVertex ? 'Удалить выбранную точку' : 'Сначала выберите угол контура'}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => selectedVertex && removeMeasureVertex(selectedVertex)}
            >
              <ToolIcon name="trash" />
              <span>Удалить точку</span>
            </button>
          </>
        ) : null}
        {showReset ? (
          <>
            <span className={styles.toolSep} aria-hidden />
            <button
              type="button"
              className={styles.toolBtnGhost}
              title={
                regionPicks.length > 1
                  ? 'Убрать последний участок заливки'
                  : 'Убрать последнее: участок, точку или измерение'
              }
              onPointerDown={(e) => e.preventDefault()}
              onClick={resetLastMeasure}
            >
              <ToolIcon name="resetLast" />
              <span>Сбросить</span>
            </button>
          </>
        ) : null}
          </>
        )}
      </div>

      <div
        ref={stageShellRef}
        className={`${styles.stage} ${isMobileLayout ? styles.stageMobile : ''} ${isLandscapePhone ? styles.stageLandscape : ''} ${mobileDockVisible ? styles.stageDockVisible : ''} ${mobileDockExpanded ? styles.stageSheetExpanded : ''}`}
      >
        <div className={styles.stageCanvas}>
        {isMobileLayout && showVertexTools ? (
          <div className={styles.mobileVertexDock} role="toolbar" aria-label="Точки контура">
            <p className={styles.mobileVertexDockHint}>
              {selectedVertex
                ? 'Точка выбрана. Крестик на плане или «Удалить».'
                : 'Тап по линии — новая точка. Тап по точке — выбрать.'}
            </p>
            <div className={styles.mobileVertexDockActions}>
              <button
                type="button"
                className={styles.mobileVertexDockBtn}
                disabled={!canAddVertex}
                onPointerDown={(e) => e.preventDefault()}
                onClick={addMeasureVertex}
              >
                <ToolIcon name="addPoint" />
                Добавить
              </button>
              <button
                type="button"
                className={`${styles.mobileVertexDockBtn} ${styles.mobileVertexDockBtnDanger}`}
                disabled={!canDeleteVertex}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => selectedVertex && removeMeasureVertex(selectedVertex)}
              >
                <ToolIcon name="trash" />
                Удалить
              </button>
            </div>
          </div>
        ) : null}
        {showPlanLoading ? <div className={styles.planLoading} aria-busy="true" /> : null}

        {showRaster && pngUrl ? (
          <div
            className={`${styles.rasterLayer} ${measureOnPlan ? styles.rasterLayerMeasure : ''}`}
          >
            <DwgRasterViewer
              ref={rasterRef}
              url={pngUrl}
              label={drawingName}
              onBlank={onRasterBlank}
              onViewChange={handleRasterViewChange}
              onNavigate={isMobileLayout ? collapseMobileSheets : undefined}
              hideZoomDock={markerActive || (isMobileLayout && mobileDockExpanded)}
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

        </div>

        {showRegionReadout ? (
          isMobileLayout ? (
            <MobileMeasureSheet
              open={mobileMeasureSheetOpen}
              onToggle={toggleMobileMeasureSheet}
              peekLabel="Участок"
              peekValue={regionPeekValue}
              toolbar={mobileSheetToolbar}
              className={styles.readoutZoneCompact}
              bodyRef={mobileSheetBodyRef}
            >
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>Участок</p>
                <div className={styles.readoutTitleActions}>
                  {regionRows.length > 1 ? (
                    <span className={styles.readoutSubtle}>заливок {regionRows.length}</span>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.readoutToggle} ${measureDetailsOpen ? styles.readoutToggleActive : ''}`}
                    aria-pressed={measureDetailsOpen}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={toggleMeasureDetails}
                  >
                    {measureDetailsOpen ? 'Скрыть' : 'Детали'}
                  </button>
                </div>
              </div>
              <dl className={styles.readoutGrid}>
                <div>
                  <dt>Площадь</dt>
                  <dd>{regionPeekArea}</dd>
                </div>
                <div>
                  <dt>Периметр</dt>
                  <dd>{regionPeekPerimeter}</dd>
                </div>
              </dl>
              {regionStatusList}
              {zoneStatusProps ? (
                <div className={styles.materialCalc}>
                  <DwgZoneStatusSection
                    selectedKind={zoneStatusProps.selectedKind}
                    onSelectKind={zoneStatusProps.onSelectKind}
                    note={zoneStatusProps.note}
                    onNoteChange={zoneStatusProps.onNoteChange}
                    noteRequired={zoneStatusProps.noteRequired}
                    attachments={zoneStatusProps.attachments}
                    onAttachmentsChange={zoneStatusProps.onAttachmentsChange}
                    handoverFolderHint={zoneStatusProps.handoverFolderHint}
                    saving={zoneStatusProps.saving}
                    onSave={zoneStatusProps.onSave}
                    flash={zoneStatusProps.flash}
                    materialCalcOpen={zoneStatusProps.materialCalcOpen}
                    onToggleMaterialCalc={zoneStatusProps.onToggleMaterialCalc}
                    saveLabel={zoneStatusProps.saveLabel}
                    compact
                  />
                </div>
              ) : null}
              {showRegionDetails ? (
                <div id="region-readout-material">{materialCalcOnlyPanel}</div>
              ) : null}
            </MobileMeasureSheet>
          ) : (
            <div
              className={`${styles.readout} ${styles.readoutZoneCompact} ${showRegionDetails ? styles.readoutExpanded : ''}`}
              aria-live="polite"
            >
              <div className={styles.zoneCardHead}>
                <div className={styles.zoneCardHeadMain}>
                  <p className={styles.readoutTitle}>Участок</p>
                  <p className={styles.zoneCardMetrics}>
                    <span>{regionPeekArea}</span>
                    <span className={styles.zoneCardMetricsDot} aria-hidden>
                      ·
                    </span>
                    <span>{regionPeekPerimeter}</span>
                    {regionRows.length > 1 ? (
                      <>
                        <span className={styles.zoneCardMetricsDot} aria-hidden>
                          ·
                        </span>
                        <span className={styles.readoutSubtle}>{regionRows.length} зал.</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${styles.readoutToggle} ${measureDetailsOpen ? styles.readoutToggleActive : ''}`}
                  aria-pressed={measureDetailsOpen}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={toggleMeasureDetails}
                >
                  {measureDetailsOpen ? 'Скрыть' : 'Детали'}
                </button>
              </div>
              {regionStatusList}
              {zoneStatusProps ? (
                <div className={styles.materialCalc}>
                  <DwgZoneStatusSection
                    selectedKind={zoneStatusProps.selectedKind}
                    onSelectKind={zoneStatusProps.onSelectKind}
                    note={zoneStatusProps.note}
                    onNoteChange={zoneStatusProps.onNoteChange}
                    noteRequired={zoneStatusProps.noteRequired}
                    attachments={zoneStatusProps.attachments}
                    onAttachmentsChange={zoneStatusProps.onAttachmentsChange}
                    handoverFolderHint={zoneStatusProps.handoverFolderHint}
                    saving={zoneStatusProps.saving}
                    onSave={zoneStatusProps.onSave}
                    flash={zoneStatusProps.flash}
                    materialCalcOpen={zoneStatusProps.materialCalcOpen}
                    onToggleMaterialCalc={zoneStatusProps.onToggleMaterialCalc}
                    saveLabel={zoneStatusProps.saveLabel}
                    compact
                  />
                </div>
              ) : null}
              {showRegionDetails ? (
                <div id="region-readout-material">{materialCalcOnlyPanel}</div>
              ) : null}
            </div>
          )
        ) : null}

        {showAreaReadout ? (
          isMobileLayout ? (
            <MobileMeasureSheet
              open={mobileMeasureSheetOpen}
              onToggle={toggleMobileMeasureSheet}
              peekLabel="Участок"
              peekValue={areaPeekValue}
              toolbar={mobileSheetToolbar}
              className={styles.readoutZoneCompact}
              bodyRef={mobileSheetBodyRef}
            >
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>Участок</p>
                <button
                  type="button"
                  className={`${styles.readoutToggle} ${measureDetailsOpen ? styles.readoutToggleActive : ''}`}
                  aria-pressed={measureDetailsOpen}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={toggleMeasureDetails}
                >
                  {measureDetailsOpen ? 'Скрыть' : 'Детали'}
                </button>
              </div>
              <dl className={styles.readoutGrid}>
                <div>
                  <dt>Площадь</dt>
                  <dd>{formatArea(areaValue)}</dd>
                </div>
                <div>
                  <dt>Периметр</dt>
                  <dd>{formatLinear(perimeterValue)}</dd>
                </div>
                <div>
                  <dt>Точек</dt>
                  <dd>{measurePointCount}</dd>
                </div>
              </dl>
              {zoneStatusProps ? (
                <div className={styles.materialCalc}>
                  <DwgZoneStatusSection
                    selectedKind={zoneStatusProps.selectedKind}
                    onSelectKind={zoneStatusProps.onSelectKind}
                    note={zoneStatusProps.note}
                    onNoteChange={zoneStatusProps.onNoteChange}
                    noteRequired={zoneStatusProps.noteRequired}
                    attachments={zoneStatusProps.attachments}
                    onAttachmentsChange={zoneStatusProps.onAttachmentsChange}
                    handoverFolderHint={zoneStatusProps.handoverFolderHint}
                    saving={zoneStatusProps.saving}
                    onSave={zoneStatusProps.onSave}
                    flash={zoneStatusProps.flash}
                    materialCalcOpen={zoneStatusProps.materialCalcOpen}
                    onToggleMaterialCalc={zoneStatusProps.onToggleMaterialCalc}
                    saveLabel={zoneStatusProps.saveLabel}
                    compact
                  />
                </div>
              ) : null}
              {showRegionDetails ? (
                <div id="area-readout-details">{materialCalcOnlyPanel}</div>
              ) : null}
            </MobileMeasureSheet>
          ) : (
            <div
              className={`${styles.readout} ${styles.readoutZoneCompact} ${showRegionDetails ? styles.readoutExpanded : ''}`}
              aria-live="polite"
            >
              <div className={styles.zoneCardHead}>
                <div className={styles.zoneCardHeadMain}>
                  <p className={styles.readoutTitle}>Участок</p>
                  <p className={styles.zoneCardMetrics}>
                    <span>{formatArea(areaValue)}</span>
                    <span className={styles.zoneCardMetricsDot} aria-hidden>
                      ·
                    </span>
                    <span>{formatLinear(perimeterValue)}</span>
                    <span className={styles.zoneCardMetricsDot} aria-hidden>
                      ·
                    </span>
                    <span className={styles.readoutSubtle}>{measurePointCount} тчк.</span>
                  </p>
                </div>
                <button
                  type="button"
                  className={`${styles.readoutToggle} ${measureDetailsOpen ? styles.readoutToggleActive : ''}`}
                  aria-pressed={measureDetailsOpen}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={toggleMeasureDetails}
                >
                  {measureDetailsOpen ? 'Скрыть' : 'Детали'}
                </button>
              </div>
              {zoneStatusProps ? (
                <div className={styles.materialCalc}>
                  <DwgZoneStatusSection
                    selectedKind={zoneStatusProps.selectedKind}
                    onSelectKind={zoneStatusProps.onSelectKind}
                    note={zoneStatusProps.note}
                    onNoteChange={zoneStatusProps.onNoteChange}
                    noteRequired={zoneStatusProps.noteRequired}
                    attachments={zoneStatusProps.attachments}
                    onAttachmentsChange={zoneStatusProps.onAttachmentsChange}
                    handoverFolderHint={zoneStatusProps.handoverFolderHint}
                    saving={zoneStatusProps.saving}
                    onSave={zoneStatusProps.onSave}
                    flash={zoneStatusProps.flash}
                    materialCalcOpen={zoneStatusProps.materialCalcOpen}
                    onToggleMaterialCalc={zoneStatusProps.onToggleMaterialCalc}
                    saveLabel={zoneStatusProps.saveLabel}
                    compact
                  />
                </div>
              ) : null}
              {showRegionDetails ? (
                <div id="area-readout-details">{materialCalcOnlyPanel}</div>
              ) : null}
            </div>
          )
        ) : null}

        {showLengthReadout ? (
          isMobileLayout ? (
            <MobileMeasureSheet
              open={mobileMeasureSheetOpen}
              onToggle={toggleMobileMeasureSheet}
              peekLabel="Длина"
              peekValue={lengthReadout ?? '—'}
              toolbar={mobileSheetToolbar}
              bodyRef={mobileSheetBodyRef}
            >
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>Длина</p>
              </div>
              <p className={styles.readoutValue}>{lengthReadout}</p>
              <p className={styles.readoutHint}>Ещё точка — площадь. Удержание — заливка</p>
            </MobileMeasureSheet>
          ) : (
            <div className={`${styles.readout} ${styles.readoutCompact}`} aria-live="polite">
              <div className={styles.readoutTitleRow}>
                <p className={styles.readoutTitle}>Длина</p>
              </div>
              <p className={styles.readoutValue}>{lengthReadout}</p>
              <p className={styles.readoutHint}>Ещё точка — площадь. Удержание — заливка</p>
            </div>
          )
        ) : null}

        {markerActive && isMobileLayout ? (
          <MobileMeasureSheet
            open={marksPanelExpanded}
            onToggle={() => setMarksPanelExpanded((v) => !v)}
            peekLabel="Маркер"
            peekValue={`${markerStrokeCount}`}
            className={styles.marksMobileSheet}
            bodyRef={mobileSheetBodyRef}
            toolbar={
              showReset ? (
                <button
                  type="button"
                  className={styles.mobileSheetToolBtn}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={resetLastMeasure}
                >
                  <ToolIcon name="resetLast" />
                  Сбросить
                </button>
              ) : null
            }
          >
            <p className={styles.readoutHint}>
              Рисуйте и пишите по плану. Тап по зарисовке — комментарий. 2 пальца — сдвиг и зум.
            </p>
            <ul className={styles.marksList}>
              {markerMarksList.length === 0 ? (
                <li className={styles.marksEmpty}>Пока нет зарисовок</li>
              ) : (
                markerMarksList.map((mark) => {
                  const meta = markKindMeta(mark.kind)
                  return (
                    <li key={mark.id}>
                      <button
                        type="button"
                        className={`${styles.markRow} ${focusedMarkId === mark.id ? styles.markRowFocused : ''}`}
                        onClick={() => {
                          setFocusedMarkId(mark.id)
                          setMarkerTextInput(mark.text)
                          setMarkerCommentEdit({ id: mark.id, text: mark.text })
                        }}
                      >
                        <span
                          className={styles.markRowBadge}
                          style={{ background: meta.color }}
                          title={meta.label}
                          aria-hidden
                        />
                        <span className={styles.markRowBody}>
                          <span className={styles.markRowText}>
                            {formatDwgPlanMarkLabel(mark, { short: false })}
                            {mark.text ? ` — ${mark.text}` : ''}
                          </span>
                          <span className={styles.markRowMeta}>
                            {mark.author} · {formatMarkDate(mark.createdAtIso)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.markRowDelete}
                        aria-label="Удалить зарисовку"
                        onClick={() => deleteMark(mark.id)}
                      >
                        ×
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </MobileMeasureSheet>
        ) : null}

        {marksActive && !(isMobileLayout && mobileMeasureReadoutVisible) ? (
          isMobileLayout ? (
            <MobileMeasureSheet
              open={marksPanelExpanded}
              onToggle={() => setMarksPanelExpanded((v) => !v)}
              peekLabel="Отметки"
              peekValue={marksPeekValue}
              className={styles.marksMobileSheet}
              bodyRef={mobileSheetBodyRef}
              toolbar={
                planMarks.length > 0 ? (
                  <button
                    type="button"
                    className={styles.mobileSheetToolBtn}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      void downloadDwgPlanMarksExcel(filteredPlanMarks, {
                        siteName: siteDisplayName || undefined,
                        planName: drawingName,
                      }).then((result) => {
                        if (!result.ok) window.alert(result.reason)
                      })
                    }}
                  >
                    Excel
                  </button>
                ) : null
              }
            >
              <div className={styles.marksFilterRow}>
                  <div className={styles.markKindRow} role="group" aria-label="Фильтр по типу">
                    <button
                      type="button"
                      className={`${styles.markFilterChip} ${markFilterKinds === 'all' ? styles.markFilterChipActive : ''}`}
                      aria-pressed={markFilterKinds === 'all'}
                      onClick={() => setMarkFilterKinds('all')}
                    >
                      Все
                    </button>
                    {DWG_PLAN_MARK_KINDS.map((k) => {
                      const active =
                        markFilterKinds !== 'all' && markFilterKinds.includes(k.id)
                      return (
                        <button
                          key={k.id}
                          type="button"
                          className={`${styles.markFilterChip} ${active ? styles.markFilterChipActive : ''}`}
                          style={
                            {
                              '--mark-color': k.color,
                            } as React.CSSProperties
                          }
                          aria-pressed={active}
                          onClick={() => {
                            setMarkFilterKinds((prev) => {
                              if (prev === 'all') return [k.id]
                              if (prev.includes(k.id)) {
                                const next = prev.filter((id) => id !== k.id)
                                return next.length === 0 ? 'all' : next
                              }
                              return [...prev, k.id]
                            })
                          }}
                        >
                          {DWG_PLAN_MARK_KIND_SHORT[k.id]}
                        </button>
                      )
                    })}
                  </div>
                  <div className={styles.markPeriodRow} role="group" aria-label="Быстрый фильтр по дате">
                    {(
                      [
                        ['all', 'Все'],
                        ['today', 'Сегодня'],
                        ['week', 'Неделя'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`${styles.markFilterChip} ${
                          !markDateFilterActive && markFilterPeriod === id
                            ? styles.markFilterChipActive
                            : ''
                        }`}
                        aria-pressed={!markDateFilterActive && markFilterPeriod === id}
                        onClick={() => {
                          setMarkFilterDateFrom('')
                          setMarkFilterDateTo('')
                          setMarkFilterPeriod(id)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.markDateRow}>
                    <label className={styles.markDateField}>
                      <span>С</span>
                      <input
                        type="date"
                        value={markFilterDateFrom}
                        max={markFilterDateTo || undefined}
                        aria-label="Дата от"
                        onChange={(e) => {
                          setMarkFilterDateFrom(e.target.value)
                          if (e.target.value) setMarkFilterPeriod('all')
                        }}
                      />
                    </label>
                    <label className={styles.markDateField}>
                      <span>По</span>
                      <input
                        type="date"
                        value={markFilterDateTo}
                        min={markFilterDateFrom || undefined}
                        aria-label="Дата до"
                        onChange={(e) => {
                          setMarkFilterDateTo(e.target.value)
                          if (e.target.value) setMarkFilterPeriod('all')
                        }}
                      />
                    </label>
                    {markDateFilterActive ? (
                      <button
                        type="button"
                        className={styles.markDateClear}
                        onClick={() => {
                          setMarkFilterDateFrom('')
                          setMarkFilterDateTo('')
                        }}
                      >
                        Сброс
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul className={styles.marksList}>
                  {marksInList.length === 0 ? (
                    <li className={styles.marksEmpty}>
                      {planMarks.length === 0
                        ? 'Нет отметок'
                        : regionPicks.length > 0
                          ? 'Нет в выбранных участках'
                          : 'Нет по фильтру'}
                    </li>
                  ) : (
                    marksInList.map((mark) => {
                      const meta = markKindMeta(mark.kind)
                      return (
                        <li key={mark.id}>
                          <button
                            type="button"
                            className={`${styles.markRow} ${focusedMarkId === mark.id ? styles.markRowFocused : ''}`}
                            onClick={() => focusMarkOnPlan(mark)}
                          >
                            <span
                              className={styles.markRowBadge}
                              style={{ background: meta.color }}
                              title={meta.label}
                              aria-hidden
                            />
                            <span className={styles.markRowBody}>
                              <span className={styles.markRowText}>
                                {formatDwgPlanMarkLabel(mark, { short: false })}
                                {mark.text ? ` — ${mark.text}` : ''}
                              </span>
                              <span className={styles.markRowMeta}>
                                {mark.author} · {formatMarkDate(mark.createdAtIso)}
                                {mark.shape.type === 'zone' && mark.shape.areaM2 != null
                                  ? ` · ${formatArea(mark.shape.areaM2)}`
                                  : ''}
                                {mark.attachmentIds && mark.attachmentIds.length > 0
                                  ? ` · акт ×${mark.attachmentIds.length}`
                                  : ''}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className={styles.markRowDelete}
                            aria-label="Удалить отметку"
                            onClick={() => deleteMark(mark.id)}
                          >
                            ×
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
            </MobileMeasureSheet>
          ) : (
          <aside className={styles.marksPanel} aria-label="Отметки на плане">
            <div className={styles.marksPanelHeader}>
              <p className={styles.marksPanelTitle}>
                Отметки · {marksInList.length}
                {regionPicks.length > 0 && marksInList.length !== filteredPlanMarks.length
                  ? ` / ${filteredPlanMarks.length}`
                  : filteredPlanMarks.length !== planMarks.length
                    ? ` / ${planMarks.length}`
                    : ''}
              </p>
              <div className={styles.marksPanelHeaderActions}>
                {planMarks.length > 0 ? (
                  <button
                    type="button"
                    className={styles.marksExportBtn}
                    title="Скачать оформленный отчёт Excel"
                    onClick={() => {
                      void downloadDwgPlanMarksExcel(filteredPlanMarks, {
                        siteName: siteDisplayName || undefined,
                        planName: drawingName,
                      }).then((result) => {
                        if (!result.ok) window.alert(result.reason)
                      })
                    }}
                  >
                    Excel
                  </button>
                ) : null}
              </div>
            </div>
            <div className={styles.marksFilterRow}>
              <div className={styles.markKindRow} role="group" aria-label="Фильтр по типу">
                <button
                  type="button"
                  className={`${styles.markFilterChip} ${markFilterKinds === 'all' ? styles.markFilterChipActive : ''}`}
                  aria-pressed={markFilterKinds === 'all'}
                  onClick={() => setMarkFilterKinds('all')}
                >
                  Все
                </button>
                {DWG_PLAN_MARK_KINDS.map((k) => {
                  const active = markFilterKinds !== 'all' && markFilterKinds.includes(k.id)
                  return (
                    <button
                      key={k.id}
                      type="button"
                      className={`${styles.markFilterChip} ${active ? styles.markFilterChipActive : ''}`}
                      style={{ '--mark-color': k.color } as React.CSSProperties}
                      aria-pressed={active}
                      onClick={() => {
                        setMarkFilterKinds((prev) => {
                          if (prev === 'all') return [k.id]
                          if (prev.includes(k.id)) {
                            const next = prev.filter((id) => id !== k.id)
                            return next.length === 0 ? 'all' : next
                          }
                          return [...prev, k.id]
                        })
                      }}
                    >
                      {DWG_PLAN_MARK_KIND_SHORT[k.id]}
                    </button>
                  )
                })}
              </div>
              <div className={styles.markPeriodRow} role="group" aria-label="Быстрый фильтр по дате">
                {(
                  [
                    ['all', 'Все'],
                    ['today', 'Сегодня'],
                    ['week', 'Неделя'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.markFilterChip} ${
                      !markDateFilterActive && markFilterPeriod === id ? styles.markFilterChipActive : ''
                    }`}
                    aria-pressed={!markDateFilterActive && markFilterPeriod === id}
                    onClick={() => {
                      setMarkFilterDateFrom('')
                      setMarkFilterDateTo('')
                      setMarkFilterPeriod(id)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.markDateRow}>
                <label className={styles.markDateField}>
                  <span>С</span>
                  <input
                    type="date"
                    value={markFilterDateFrom}
                    max={markFilterDateTo || undefined}
                    aria-label="Дата от"
                    onChange={(e) => {
                      setMarkFilterDateFrom(e.target.value)
                      if (e.target.value) setMarkFilterPeriod('all')
                    }}
                  />
                </label>
                <label className={styles.markDateField}>
                  <span>По</span>
                  <input
                    type="date"
                    value={markFilterDateTo}
                    min={markFilterDateFrom || undefined}
                    aria-label="Дата до"
                    onChange={(e) => {
                      setMarkFilterDateTo(e.target.value)
                      if (e.target.value) setMarkFilterPeriod('all')
                    }}
                  />
                </label>
                {markDateFilterActive ? (
                  <button
                    type="button"
                    className={styles.markDateClear}
                    onClick={() => {
                      setMarkFilterDateFrom('')
                      setMarkFilterDateTo('')
                    }}
                  >
                    Сброс
                  </button>
                ) : null}
              </div>
            </div>
            <ul className={styles.marksList}>
              {marksInList.length === 0 ? (
                <li className={styles.marksEmpty}>
                  {planMarks.length === 0
                    ? 'Нет отметок'
                    : regionPicks.length > 0
                      ? 'Нет в выбранных участках'
                      : 'Нет по фильтру'}
                </li>
              ) : (
                marksInList.map((mark) => {
                  const meta = markKindMeta(mark.kind)
                  return (
                    <li key={mark.id}>
                      <button
                        type="button"
                        className={`${styles.markRow} ${focusedMarkId === mark.id ? styles.markRowFocused : ''}`}
                        onClick={() => focusMarkOnPlan(mark)}
                      >
                        <span
                          className={styles.markRowBadge}
                          style={{ background: meta.color }}
                          title={meta.label}
                          aria-hidden
                        />
                        <span className={styles.markRowBody}>
                          <span className={styles.markRowText}>
                            {formatDwgPlanMarkLabel(mark, { short: false })}
                            {mark.text ? ` — ${mark.text}` : ''}
                          </span>
                          <span className={styles.markRowMeta}>
                            {mark.author} · {formatMarkDate(mark.createdAtIso)}
                            {mark.shape.type === 'zone' && mark.shape.areaM2 != null
                              ? ` · ${formatArea(mark.shape.areaM2)}`
                              : ''}
                            {mark.attachmentIds && mark.attachmentIds.length > 0
                              ? ` · акт ×${mark.attachmentIds.length}`
                              : ''}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.markRowDelete}
                        aria-label="Удалить отметку"
                        onClick={() => deleteMark(mark.id)}
                      >
                        ×
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </aside>
          )
        ) : null}
      </div>

      {markerCommentEdit ? (
        <div
          className={styles.markerPrompt}
          role="dialog"
          aria-modal="true"
          aria-label="Комментарий к маркеру"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className={styles.markerPromptCard}>
            <p className={styles.markerPromptTitle}>Комментарий к зарисовке</p>
            <p className={styles.markerPromptLead}>
              Что имелось в виду под этой линией или выделением? Можно оставить пустым.
            </p>
            <input
              className={styles.markerPromptInput}
              type="text"
              value={markerTextInput}
              placeholder="Например: стык проверить / зона под плитку"
              autoFocus
              maxLength={240}
              onChange={(e) => setMarkerTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void saveMarkerComment()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelMarkerComment()
                }
              }}
            />
            <div className={styles.markerPromptActions}>
              <button
                type="button"
                className={styles.markerPromptGhost}
                onClick={cancelMarkerComment}
                disabled={markerSaving}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.markerPromptSave}
                onClick={() => void saveMarkerComment()}
                disabled={markerSaving}
              >
                {markerSaving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
