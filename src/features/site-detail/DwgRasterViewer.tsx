import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import {
  clampRasterPan,
  drawRasterPlanFrame,
  maxRasterScaleForStage,
  minRasterScaleForStage,
  rasterDevicePixelRatio,
  zoomRasterViewAt,
  type RasterViewState,
} from '../../lib/dwgRasterMeasure'
import { pointerOnStage } from '../../lib/dwgPlanMeasure'
import { PinchTracker } from '../../lib/touchPinchZoom'
import styles from './DwgRasterViewer.module.css'

export type DwgRasterViewerRef = {
  fit: () => void
  panBy: (dx: number, dy: number, opts?: { rubber?: boolean }) => void
  /** Двухпальцевый zoom+pan одним шагом. */
  pinchBy: (gesture: {
    factor: number
    center: { x: number; y: number }
    panX: number
    panY: number
  }) => void
  /** Инерция после свайпа (px/ms). */
  fling: (vx: number, vy: number) => void
  stopMotion: () => void
  zoomAt: (mx: number, my: number, factor: number) => void
  getViewState: () => RasterViewState | null
  getStageElement: () => HTMLDivElement | null
  getImageElement: () => HTMLImageElement | null
}

type Props = {
  url: string
  label: string
  onBlank?: () => void
  onViewChange?: (state: RasterViewState) => void
  /** Слой измерений поверх PNG — в тех же координатах, что и план */
  overlay?: ReactNode
  /** Pan/pinch начались — свернуть нижние меню на телефоне. */
  onNavigate?: () => void
  /** Скрыть +/- / вписать (например в режиме маркера). */
  hideZoomDock?: boolean
}

/** x/y — сдвиг от центра экрана (после translate(-50%, -50%)). */
type View = {
  scale: number
  x: number
  y: number
}

const FLING_FRICTION = 0.0028
const FLING_MIN_SPEED = 0.045
const RUBBER = 0.38

export const DwgRasterViewer = forwardRef<DwgRasterViewerRef, Props>(function DwgRasterViewer(
  { url, label, onBlank, onViewChange, overlay, onNavigate, hideZoomDock = false },
  ref,
) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 })
  const [ready, setReady] = useState(false)
  const dragRef = useRef<{
    pid: number
    sx: number
    sy: number
    ox: number
    oy: number
    lastT: number
    vx: number
    vy: number
  } | null>(null)
  const pinchRef = useRef(new PinchTracker())
  const interactingRef = useRef(false)
  const pinchActiveRef = useRef(false)
  /** Размер stage на старте щипка — iOS меняет clientHeight mid-gesture и ломает якорь. */
  const pinchStageLockRef = useRef<{ w: number; h: number } | null>(null)
  const publishRafRef = useRef<number | null>(null)
  const motionRafRef = useRef<number | null>(null)
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate

  const stageLocalPoint = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    return pointerOnStage(stage, clientX, clientY)
  }, [])

  const getViewState = useCallback((): RasterViewState | null => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img?.naturalWidth || !img.naturalHeight) return null
    return {
      ...viewRef.current,
      stageW: stage.clientWidth,
      stageH: stage.clientHeight,
      imgW: img.naturalWidth,
      imgH: img.naturalHeight,
    }
  }, [])

  /** Для pinch: фиксируем stageW/H, чтобы iOS-ресайз не срывал якорь. */
  const getPinchViewState = useCallback((): RasterViewState | null => {
    const state = getViewState()
    if (!state) return null
    const locked = pinchStageLockRef.current
    if (!locked) return state
    return { ...state, stageW: locked.w, stageH: locked.h }
  }, [getViewState])

  const beginPinchStageLock = useCallback(() => {
    if (pinchStageLockRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (w >= 8 && h >= 8) pinchStageLockRef.current = { w, h }
  }, [])

  const endPinchStageLock = useCallback(() => {
    pinchStageLockRef.current = null
  }, [])

  const publishView = useCallback(
    (next: View) => {
      viewRef.current = next
      const state = getViewState()
      if (state) onViewChange?.(state)
    },
    [getViewState, onViewChange],
  )

  const getMaxScale = useCallback((): number => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img?.naturalWidth || !img.naturalHeight) return 64
    return maxRasterScaleForStage(
      img.naturalWidth,
      img.naturalHeight,
      stage.clientWidth,
      stage.clientHeight,
      rasterDevicePixelRatio(),
    )
  }, [])

  const getMinScale = useCallback((): number => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img?.naturalWidth || !img.naturalHeight) return 0.02
    return minRasterScaleForStage(
      img.naturalWidth,
      img.naturalHeight,
      stage.clientWidth,
      stage.clientHeight,
    )
  }, [])

  const paintRafRef = useRef<number | null>(null)

  const paintFrame = useCallback(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const img = imgRef.current
    const state = getViewState()
    if (!stage || !canvas || !img?.naturalWidth || !img.naturalHeight || !state) return

    const dpr = rasterDevicePixelRatio()
    const cssW = Math.max(1, stage.clientWidth)
    const cssH = Math.max(1, stage.clientHeight)
    const pxW = Math.max(1, Math.round(cssW * dpr))
    const pxH = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width !== pxW) canvas.width = pxW
    if (canvas.height !== pxH) canvas.height = pxH
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    drawRasterPlanFrame(ctx, img, state, dpr)
  }, [getViewState])

  const schedulePaint = useCallback(() => {
    if (paintRafRef.current != null) return
    paintRafRef.current = window.requestAnimationFrame(() => {
      paintRafRef.current = null
      paintFrame()
    })
  }, [paintFrame])

  const schedulePublish = useCallback(() => {
    if (publishRafRef.current != null) return
    publishRafRef.current = window.requestAnimationFrame(() => {
      publishRafRef.current = null
      publishView(viewRef.current)
    })
  }, [publishView])

  const settlePan = useCallback(
    (next: View, rubber?: number): View => {
      // Во время щипка — те же stageW/H, что в zoom-математике.
      const state = pinchStageLockRef.current ? getPinchViewState() : getViewState()
      if (!state) {
        const maxScale = getMaxScale()
        const minScale = getMinScale()
        const scale = Math.min(maxScale, Math.max(minScale, next.scale))
        return { ...next, scale }
      }
      const maxScale = getMaxScale()
      const minScale = getMinScale()
      const scale = Math.min(maxScale, Math.max(minScale, next.scale))
      const withScale = { ...next, scale }
      const pan = clampRasterPan(
        { ...state, ...withScale },
        withScale.x,
        withScale.y,
        rubber != null ? { rubber } : undefined,
      )
      return { scale, x: pan.x, y: pan.y }
    },
    [getViewState, getPinchViewState, getMaxScale, getMinScale],
  )

  const applyView = useCallback(
    (next: View, opts?: { commit?: boolean; rubber?: number }) => {
      const clamped = settlePan(next, opts?.rubber)
      viewRef.current = clamped
      paintFrame()
      schedulePaint()
      schedulePublish()
      if (opts?.commit) {
        if (publishRafRef.current != null) {
          window.cancelAnimationFrame(publishRafRef.current)
          publishRafRef.current = null
        }
        publishView(clamped)
      }
    },
    [publishView, settlePan, schedulePaint, paintFrame, schedulePublish],
  )

  const stopMotion = useCallback(() => {
    if (motionRafRef.current != null) {
      window.cancelAnimationFrame(motionRafRef.current)
      motionRafRef.current = null
    }
  }, [])

  const fling = useCallback(
    (vx: number, vy: number) => {
      stopMotion()
      const speed = Math.hypot(vx, vy)
      if (speed < FLING_MIN_SPEED) {
        applyView(viewRef.current, { commit: true })
        return
      }
      let last = performance.now()
      let curVx = vx
      let curVy = vy
      const tick = (now: number) => {
        const dt = Math.min(32, Math.max(0, now - last))
        last = now
        const decay = Math.exp(-FLING_FRICTION * dt)
        curVx *= decay
        curVy *= decay
        if (Math.hypot(curVx, curVy) < FLING_MIN_SPEED) {
          motionRafRef.current = null
          applyView(viewRef.current, { commit: true })
          return
        }
        applyView({
          ...viewRef.current,
          x: viewRef.current.x + curVx * dt,
          y: viewRef.current.y + curVy * dt,
        })
        motionRafRef.current = window.requestAnimationFrame(tick)
      }
      motionRafRef.current = window.requestAnimationFrame(tick)
    },
    [applyView, stopMotion],
  )

  useEffect(
    () => () => {
      if (paintRafRef.current != null) window.cancelAnimationFrame(paintRafRef.current)
      if (publishRafRef.current != null) window.cancelAnimationFrame(publishRafRef.current)
      if (motionRafRef.current != null) window.cancelAnimationFrame(motionRafRef.current)
    },
    [],
  )

  useLayoutEffect(() => {
    if (ready) schedulePaint()
  }, [ready, schedulePaint])

  const fitToStage = useCallback((): boolean => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img || !img.naturalWidth || !img.naturalHeight) return false

    const stageW = stage.clientWidth
    const stageH = stage.clientHeight
    if (stageW < 8 || stageH < 8) return false

    const pad = 32
    const sw = stageW - pad * 2
    const sh = stageH - pad * 2
    if (sw <= 0 || sh <= 0) return false

    const scale = Math.min(sw / img.naturalWidth, sh / img.naturalHeight)
    stopMotion()
    applyView({ scale, x: 0, y: 0 }, { commit: true })
    return true
  }, [applyView, stopMotion])

  const ensureFit = useCallback(() => {
    let attempts = 0
    const tick = () => {
      if (fitToStage()) return
      if (++attempts < 48) requestAnimationFrame(tick)
    }
    tick()
  }, [fitToStage])

  const markReady = useCallback(
    (img: HTMLImageElement) => {
      if (!img.naturalWidth || !img.naturalHeight) return
      setReady(true)
      ensureFit()
    },
    [ensureFit],
  )

  const handleLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      markReady(e.currentTarget)
    },
    [markReady],
  )

  const applyPinchGesture = useCallback(
    (pinch: { factor: number; center: { x: number; y: number }; panX: number; panY: number }) => {
      beginPinchStageLock()
      const state = getPinchViewState()
      if (!state) return
      let next: View = viewRef.current
      if (Math.abs(pinch.factor - 1) >= 0.001) {
        next = zoomRasterViewAt(
          { ...state, ...next },
          pinch.center.x,
          pinch.center.y,
          pinch.factor,
          getMaxScale(),
          getMinScale(),
          { clamp: false },
        )
      }
      if (pinch.panX || pinch.panY) {
        next = { ...next, x: next.x + pinch.panX, y: next.y + pinch.panY }
      }
      // Без rubber: иначе на мобиле улетаешь в пустоту вокруг плана.
      applyView(next)
    },
    [applyView, beginPinchStageLock, getPinchViewState, getMaxScale, getMinScale],
  )

  useImperativeHandle(
    ref,
    () => ({
      fit: ensureFit,
      panBy: (dx: number, dy: number, opts?: { rubber?: boolean }) => {
        stopMotion()
        if (dx === 0 && dy === 0 && !opts?.rubber) {
          pinchActiveRef.current = false
          interactingRef.current = false
          endPinchStageLock()
          applyView(viewRef.current, { commit: true })
          return
        }
        applyView(
          { ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy },
          opts?.rubber ? { rubber: RUBBER } : undefined,
        )
      },
      pinchBy: (gesture) => {
        stopMotion()
        interactingRef.current = true
        pinchActiveRef.current = true
        applyPinchGesture(gesture)
      },
      fling,
      stopMotion,
      zoomAt: (mx: number, my: number, factor: number) => {
        stopMotion()
        const state = getViewState()
        if (!state) return
        applyView(zoomRasterViewAt(state, mx, my, factor, getMaxScale(), getMinScale()))
      },
      getViewState,
      getStageElement: () => stageRef.current,
      getImageElement: () => imgRef.current,
    }),
    [
      applyView,
      applyPinchGesture,
      endPinchStageLock,
      ensureFit,
      fling,
      getViewState,
      getMaxScale,
      getMinScale,
      stopMotion,
    ],
  )

  const measureOverlay = Boolean(overlay)
  const didInitialFitRef = useRef(false)

  useLayoutEffect(() => {
    setReady(false)
    didInitialFitRef.current = false
    stopMotion()
    applyView({ scale: 1, x: 0, y: 0 })
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) {
      markReady(img)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только смена url
  }, [url])

  useEffect(() => {
    if (!ready) return
    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true
      ensureFit()
    }
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => {
      // Во время жеста не пересчитываем clamp — иначе якорь щипка плывёт при ресайзе stage.
      if (interactingRef.current || pinchActiveRef.current) {
        schedulePaint()
        return
      }
      const settled = settlePan(viewRef.current)
      viewRef.current = settled
      schedulePaint()
      schedulePublish()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [ready, ensureFit, schedulePaint, schedulePublish, settlePan])

  const handleWheelZoom = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const stage = stageRef.current
      const state = getViewState()
      if (!stage || !state) return
      stopMotion()
      const p = pointerOnStage(stage, clientX, clientY)
      const factor = deltaY < 0 ? 1.12 : 1 / 1.12
      applyView(zoomRasterViewAt(state, p.x, p.y, factor, getMaxScale(), getMinScale()))
    },
    [applyView, getViewState, getMaxScale, getMinScale, stopMotion],
  )

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || overlay) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      handleWheelZoom(e.clientX, e.clientY, e.deltaY)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [overlay, handleWheelZoom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        ensureFit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ensureFit])

  const zoomByFactor = useCallback(
    (factor: number) => {
      const stage = stageRef.current
      const state = getViewState()
      if (!stage || !state) return
      stopMotion()
      applyView(
        zoomRasterViewAt(
          state,
          stage.clientWidth / 2,
          stage.clientHeight / 2,
          factor,
          getMaxScale(),
          getMinScale(),
        ),
        { commit: true },
      )
    },
    [applyView, getViewState, getMaxScale, getMinScale, stopMotion],
  )

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={
        measureOverlay
          ? undefined
          : (e) => {
              if (e.button !== 0 && e.button !== 1) return
              e.preventDefault()
              try {
                window.getSelection()?.removeAllRanges()
              } catch {
                /* ignore */
              }
              stopMotion()
              interactingRef.current = true
              const p = stageLocalPoint(e.clientX, e.clientY)
              pinchRef.current.down(e.pointerId, p)
              if (pinchRef.current.pointerCount() === 1) {
                const now = performance.now()
                dragRef.current = {
                  pid: e.pointerId,
                  sx: e.clientX,
                  sy: e.clientY,
                  ox: viewRef.current.x,
                  oy: viewRef.current.y,
                  lastT: now,
                  vx: 0,
                  vy: 0,
                }
              } else {
                dragRef.current = null
                pinchActiveRef.current = true
                // Не сворачиваем панели во время щипка — иначе stage прыгает и зум ломается.
              }
              stageRef.current?.setPointerCapture(e.pointerId)
            }
      }
      onPointerMove={
        measureOverlay
          ? undefined
          : (e) => {
              const p = stageLocalPoint(e.clientX, e.clientY)
              const pinch = pinchRef.current.move(e.pointerId, p)
              if (pinch) {
                e.preventDefault()
                pinchActiveRef.current = true
                applyPinchGesture(pinch)
                dragRef.current = null
                return
              }
              if (pinchRef.current.isPinching()) {
                e.preventDefault()
                return
              }
              const drag = dragRef.current
              if (!drag || drag.pid !== e.pointerId) return
              e.preventDefault()
              const now = performance.now()
              const dt = Math.max(1, now - drag.lastT)
              const nx = drag.ox + (e.clientX - drag.sx)
              const ny = drag.oy + (e.clientY - drag.sy)
              const dx = nx - viewRef.current.x
              const dy = ny - viewRef.current.y
              drag.vx = dx / dt
              drag.vy = dy / dt
              drag.lastT = now
              if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) {
                onNavigateRef.current?.()
              }
              applyView({ ...viewRef.current, x: nx, y: ny }, { rubber: RUBBER })
            }
      }
      onPointerUp={
        measureOverlay
          ? undefined
          : (e) => {
              pinchRef.current.up(e.pointerId)
              const drag = dragRef.current
              if (drag?.pid === e.pointerId) {
                const vx = drag.vx
                const vy = drag.vy
                dragRef.current = null
                if (pinchRef.current.pointerCount() === 0) {
                  const endedPinch = pinchActiveRef.current
                  pinchActiveRef.current = false
                  endPinchStageLock()
                  pinchRef.current.clear()
                  interactingRef.current = false
                  if (endedPinch) onNavigateRef.current?.()
                  if (Math.hypot(vx, vy) >= FLING_MIN_SPEED) fling(vx, vy)
                  else applyView(viewRef.current, { commit: true })
                } else if (pinchRef.current.pointerCount() === 1) {
                  const left = pinchRef.current.remaining()
                  const stage = stageRef.current
                  if (left && stage) {
                    const rect = stage.getBoundingClientRect()
                    const w = Math.max(1, stage.clientWidth)
                    const h = Math.max(1, stage.clientHeight)
                    const clientX = rect.left + (left.point.x / w) * rect.width
                    const clientY = rect.top + (left.point.y / h) * rect.height
                    dragRef.current = {
                      pid: left.id,
                      sx: clientX,
                      sy: clientY,
                      ox: viewRef.current.x,
                      oy: viewRef.current.y,
                      lastT: performance.now(),
                      vx: 0,
                      vy: 0,
                    }
                  }
                }
              } else if (pinchRef.current.pointerCount() === 0) {
                const endedPinch = pinchActiveRef.current
                pinchActiveRef.current = false
                endPinchStageLock()
                pinchRef.current.clear()
                if (endedPinch) onNavigateRef.current?.()
                if (interactingRef.current) {
                  interactingRef.current = false
                  applyView(viewRef.current, { commit: true })
                }
              } else if (pinchRef.current.pointerCount() === 1 && !dragRef.current) {
                const left = pinchRef.current.remaining()
                const stage = stageRef.current
                if (left && stage) {
                  const rect = stage.getBoundingClientRect()
                  const w = Math.max(1, stage.clientWidth)
                  const h = Math.max(1, stage.clientHeight)
                  dragRef.current = {
                    pid: left.id,
                    sx: rect.left + (left.point.x / w) * rect.width,
                    sy: rect.top + (left.point.y / h) * rect.height,
                    ox: viewRef.current.x,
                    oy: viewRef.current.y,
                    lastT: performance.now(),
                    vx: 0,
                    vy: 0,
                  }
                }
              }
              try {
                stageRef.current?.releasePointerCapture(e.pointerId)
              } catch {
                /* no-op */
              }
            }
      }
      onPointerCancel={
        measureOverlay
          ? undefined
          : (e) => {
              pinchRef.current.up(e.pointerId)
              if (dragRef.current?.pid === e.pointerId) dragRef.current = null
              if (pinchRef.current.pointerCount() === 0) {
                const endedPinch = pinchActiveRef.current
                pinchActiveRef.current = false
                endPinchStageLock()
                pinchRef.current.clear()
                if (endedPinch) onNavigateRef.current?.()
                if (interactingRef.current) {
                  interactingRef.current = false
                  applyView(viewRef.current, { commit: true })
                }
              } else if (pinchRef.current.pointerCount() === 1 && !dragRef.current) {
                const left = pinchRef.current.remaining()
                const stage = stageRef.current
                if (left && stage) {
                  const rect = stage.getBoundingClientRect()
                  const w = Math.max(1, stage.clientWidth)
                  const h = Math.max(1, stage.clientHeight)
                  dragRef.current = {
                    pid: left.id,
                    sx: rect.left + (left.point.x / w) * rect.width,
                    sy: rect.top + (left.point.y / h) * rect.height,
                    ox: viewRef.current.x,
                    oy: viewRef.current.y,
                    lastT: performance.now(),
                    vx: 0,
                    vy: 0,
                  }
                }
              }
              try {
                stageRef.current?.releasePointerCapture(e.pointerId)
              } catch {
                /* no-op */
              }
            }
      }
      onDoubleClick={measureOverlay ? undefined : () => ensureFit()}
    >
      <img
        ref={imgRef}
        className={styles.srcImg}
        src={url}
        alt=""
        draggable={false}
        decoding="async"
        fetchPriority="high"
        onLoad={handleLoad}
        onError={() => {
          setReady(false)
          onBlank?.()
        }}
      />
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-ready={ready ? 'true' : 'false'}
        aria-hidden
      />
      {!ready ? <div className={styles.loading} aria-busy="true" /> : null}
      {overlay ? <div className={styles.overlay}>{overlay}</div> : null}
      {ready && !hideZoomDock ? (
        <div
          className={styles.zoomDock}
          role="group"
          aria-label="Масштаб плана"
          data-testid="dwg-zoom-dock"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.zoomBtn}
            title="Вписать в экран"
            aria-label="Вписать в экран"
            data-testid="dwg-zoom-fit"
            onClick={(e) => {
              e.stopPropagation()
              ensureFit()
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
              <path
                d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            title="Приблизить"
            aria-label="Приблизить"
            data-testid="dwg-zoom-in"
            onClick={(e) => {
              e.stopPropagation()
              zoomByFactor(1.18)
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            title="Отдалить"
            aria-label="Отдалить"
            data-testid="dwg-zoom-out"
            onClick={(e) => {
              e.stopPropagation()
              zoomByFactor(1 / 1.18)
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  )
})
