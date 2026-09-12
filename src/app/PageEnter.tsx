import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * Лёгкий вход страницы: fade + 8px up, 220ms.
 * Один раз на смену pathname; уважает prefers-reduced-motion (см. index.css).
 */
export function PageEnter({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  )
}
