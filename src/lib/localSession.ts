/**
 * Локальная сессия после входа по справочнику сотрудников.
 * Не серверная сессия — MVP до корпоративного auth.
 */

import { STAFF_DIRECTORY } from '../domain/staffDirectory'
import type { SiteDutyRole } from '../domain/sitePageZone'

export const LOCAL_SESSION_KEY = 'deloresh-local-session:v1'

export type LocalSession = {
  readonly login: string
  readonly fullName: string
  readonly duty: SiteDutyRole
  readonly dutyLabel: string
  readonly signedInAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function isDuty(value: unknown): value is SiteDutyRole {
  return (
    value === 'manager' ||
    value === 'deputy' ||
    value === 'pto' ||
    value === 'brigadier' ||
    value === 'supply' ||
    value === 'dispatcher' ||
    value === 'driver'
  )
}

export function loadLocalSession(): LocalSession | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalSession>
    const login = typeof parsed.login === 'string' ? parsed.login.trim() : ''
    if (!login || !isDuty(parsed.duty)) return null

    const staff = STAFF_DIRECTORY.find((m) => m.login === login)
    const fullName =
      staff?.fullName ??
      (typeof parsed.fullName === 'string' && parsed.fullName.trim()
        ? parsed.fullName.trim()
        : login)
    const dutyLabel =
      staff?.dutyLabel ??
      (typeof parsed.dutyLabel === 'string' && parsed.dutyLabel.trim()
        ? parsed.dutyLabel.trim()
        : '')
    if (!dutyLabel) return null

    const signedInAt =
      typeof parsed.signedInAt === 'string' && parsed.signedInAt
        ? parsed.signedInAt
        : new Date().toISOString()
    return {
      login,
      fullName,
      duty: staff?.duty ?? parsed.duty,
      dutyLabel,
      signedInAt,
    }
  } catch {
    return null
  }
}

export function saveLocalSession(input: {
  login: string
  fullName: string
  duty: SiteDutyRole
  dutyLabel: string
}): LocalSession {
  const session: LocalSession = {
    login: input.login.trim(),
    fullName: input.fullName.trim() || input.login.trim(),
    duty: input.duty,
    dutyLabel: input.dutyLabel.trim(),
    signedInAt: new Date().toISOString(),
  }
  if (!session.login || !session.dutyLabel) {
    throw new Error('session fields required')
  }
  if (canUseStorage()) {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
  }
  return session
}

export function clearLocalSession(): void {
  if (!canUseStorage()) return
  localStorage.removeItem(LOCAL_SESSION_KEY)
}

export function sessionInitials(login: string): string {
  const t = login.trim()
  if (!t) return '?'
  const parts = t.split(/[\s._@-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toLocaleUpperCase('ru-RU')
  }
  return t.slice(0, 2).toLocaleUpperCase('ru-RU')
}
