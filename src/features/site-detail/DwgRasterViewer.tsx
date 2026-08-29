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
  maxRasterScaleForStage,
  zoomRasterViewAt,
  type RasterViewState,
} from '../../lib/dwgRasterMeasure'
import { PinchTracker } from '../../lib/touchPinchZoom'
import styles from './DwgRasterViewer.module.css'

export type DwgRasterViewerRef = {
  fit: () => void
  panBy: (dx: number, dy: number) => void
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
}

/** x/y — сдвиг от центра экрана (после translate(-50%, -50%)). */
type View = {
  scale: number
  x: number
  y: number
}

export const DwgRasterViewer = forwardRef<DwgRasterViewerRef, Props>(function DwgRasterViewer(
  { url, label, onBlank, onViewChange, overlay },
  ref,
) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 })
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const dragRef = useRef<{ pid: number; sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  )
  const pinchRef = useRef(new PinchTracker())

  const stageLocalPoint = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: clientX - rect.left, y: clientY - rect.top }
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
    if (!stage || !img?.naturalWidth || !img.naturalHeight) return 48
    return maxRasterScaleForStage(
      img.naturalWidth,
      img.naturalHeight,
      stage.clientWidth,
      stage.clientHeight,
    )
  }, [])

  const clampView = useCallback(
    (next: View): View => {
      const maxScale = getMaxScale()
      if (next.scale <= maxScale) return next
      return { ...next, scale: maxScale }
    },
    [getMaxScale],
  )

  const applyView = useCallback(
    (next: View) => {
      const clamped = clampView(next)
      setView(clamped)
      publishView(clamped)
    },
    [publishView, clampView],
  )

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
    applyView({ scale, x: 0, y: 0 })
    return true
  }, [applyView])

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

  useImperativeHandle(
    ref,
    () => ({
      fit: ensureFit,
      panBy: (dx: number, dy: number) => {
        applyView({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy })
      },
      zoomAt: (mx: number, my: number, factor: number) => {
        const state = getViewState()
        if (!state) return
        applyView(zoomRasterViewAt(state, mx, my, factor, getMaxScale()))
      },
      getViewState,
      getStageElement: () => stageRef.current,
      getImageElement: () => imgRef.current,
    }),
    [applyView, ensureFit, getViewState, getMaxScale],
  )

  useLayoutEffect(() => {
    setReady(false)
    applyView({ scale: 1, x: 0, y: 0 })
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) {
      markReady(img)
    }
  }, [url, markReady, applyView])

  useEffect(() => {
    if (!ready) return
    ensureFit()
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => fitToStage())
    ro.observe(stage)
    return () => ro.disconnect()
  }, [ready, ensureFit, fitToStage])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => {
      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) fitToStage()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [url, fitToStage])

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

  const measureOverlay = Boolean(overlay)

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      aria-label={label}
      onWheel={
        measureOverlay
          ? undefined
          : (e) => {
              e.preventDefault()
              const state = getViewState()
              if (!state) return
              const rect = stageRef.current?.getBoundingClientRect()
              if (!rect) return
              const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
              applyView(
                zoomRasterViewAt(state, e.clientX - rect.left, e.clientY - rect.top, factor, getMaxScale()),
              )
            }
      }
      onPointerDown={
        measureOverlay
          ? undefined
          : (e) => {
              if (e.button !== 0 && e.button !== 1) return
              e.preventDefault()
              const p = stageLocalPoint(e.clientX, e.clientY)
              pinchRef.current.down(e.pointerId, p)
              if (pinchRef.current.pointerCount() === 1) {
                dragRef.current = {
                  pid: e.pointerId,
                  sx: e.clientX,
                  sy: e.clientY,
                  ox: viewRef.current.x,
                  oy: viewRef.current.y,
                }
              } else {
                dragRef.current = null
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
                const state = getViewState()
                if (state) {
                  applyView(
                    zoomRasterViewAt(
                      state,
                      pinch.center.x,
                      pinch.center.y,
                      pinch.factor,
                      getMaxScale(),
                    ),
                  )
                }
                dragRef.current = null
                return
              }
              if (pinchRef.current.isPinching()) return
              const drag = dragRef.current
              if (!drag || drag.pid !== e.pointerId) return
              applyView({
                ...viewRef.current,
                x: drag.ox + (e.clientX - drag.sx),
                y: drag.oy + (e.clientY - drag.sy),
              })
            }
      }
      onPointerUp={
        measureOverlay
          ? undefined
          : (e) => {
              pinchRef.current.up(e.pointerId)
              if (pinchRef.current.pointerCount() === 0) pinchRef.current.clear()
              if (dragRef.current?.pid === e.pointerId) dragRef.current = null
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
              if (pinchRef.current.pointerCount() === 0) pinchRef.current.clear()
              if (dragRef.current?.pid === e.pointerId) dragRef.current = null
            }
      }
      onDoubleClick={measureOverlay ? undefined : () => ensureFit()}
    >
      <img
        ref={imgRef}
        className={styles.img}
        src={url}
        alt=""
        draggable={false}
        data-ready={ready ? 'true' : 'false'}
        style={{
          transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.scale})`,
        }}
        onLoad={handleLoad}
        onError={() => {
          setReady(false)
          onBlank?.()
        }}
      />
      {!ready ? <p className={styles.loading}>Рисуем превью…</p> : null}
      {overlay ? <div className={styles.overlay}>{overlay}</div> : null}
    </div>
  )
})
