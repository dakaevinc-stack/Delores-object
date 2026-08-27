import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Раскрытие/сворачивание без «отброса» страницы вверх.
 * Перед сменой высоты запоминаем положение якоря в viewport;
 * после layout компенсируем scroll, чтобы пользователь остался на месте.
 */
export function useAnchoredExpand<T extends HTMLElement = HTMLElement>(
  defaultExpanded = false,
) {
  const anchorRef = useRef<T | null>(null)
  const pendingTopRef = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(defaultExpanded)

  useLayoutEffect(() => {
    const before = pendingTopRef.current
    if (before == null) return
    pendingTopRef.current = null
    const anchor = anchorRef.current
    if (!anchor) return
    const after = anchor.getBoundingClientRect().top
    const delta = after - before
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta)
    }
  }, [expanded])

  const toggle = useCallback(() => {
    pendingTopRef.current = anchorRef.current?.getBoundingClientRect().top ?? 0
    setExpanded((v) => !v)
  }, [])

  return { expanded, setExpanded, toggle, anchorRef }
}
