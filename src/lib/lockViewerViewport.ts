const VIEWER_VIEWPORT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

const DEFAULT_VIEWPORT =
  'width=device-width, initial-scale=1, viewport-fit=cover'

/**
 * Пока открыт просмотрщик чертежа — запрещаем pinch-zoom страницы Safari.
 * Иначе вместе с зумом плана увеличивается весь UI (кнопки +/−, меню).
 */
export function lockViewerViewport(): () => void {
  if (typeof document === 'undefined') return () => undefined

  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    document.head.appendChild(meta)
  }
  const prev = meta.getAttribute('content') || DEFAULT_VIEWPORT
  meta.setAttribute('content', VIEWER_VIEWPORT)

  const blockGesture = (e: Event) => {
    e.preventDefault()
  }

  document.addEventListener('gesturestart', blockGesture, { passive: false })
  document.addEventListener('gesturechange', blockGesture, { passive: false })
  document.addEventListener('gestureend', blockGesture, { passive: false })

  const vv = window.visualViewport
  const onVv = () => {
    if (!vv || vv.scale <= 1.01) return
    // Попытка «сбросить» визуальный зум: прокрутка к origin.
    try {
      window.scrollTo(0, 0)
      vv.addEventListener?.(
        'scroll',
        () => {
          window.scrollTo(0, 0)
        },
        { once: true },
      )
    } catch {
      /* ignore */
    }
  }
  vv?.addEventListener('resize', onVv)
  vv?.addEventListener('scroll', onVv)
  onVv()

  return () => {
    meta?.setAttribute('content', prev)
    document.removeEventListener('gesturestart', blockGesture)
    document.removeEventListener('gesturechange', blockGesture)
    document.removeEventListener('gestureend', blockGesture)
    vv?.removeEventListener('resize', onVv)
    vv?.removeEventListener('scroll', onVv)
  }
}
