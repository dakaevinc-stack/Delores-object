import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLocalSession } from '../lib/useLocalSession'
import {
  homeShowsHubs,
  type SiteDutyRole,
} from '../domain/sitePageZone'

/** Без сессии — на главную (форма входа). Водитель — в кабинет. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useLocalSession()
  const location = useLocation()
  if (!session) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  if (
    session.duty === 'driver' &&
    !location.pathname.startsWith('/driver') &&
    !location.pathname.startsWith('/tasks')
  ) {
    return <Navigate to="/driver" replace />
  }
  return children
}

/** Парк и приёмка — только руководству (manager / deputy). */
export function RequireFleetAccess({ children }: { children: ReactNode }) {
  const session = useLocalSession()
  if (!session) return <Navigate to="/" replace />
  if (!homeShowsHubs(session.duty as SiteDutyRole)) {
    return <Navigate to="/" replace />
  }
  return children
}
