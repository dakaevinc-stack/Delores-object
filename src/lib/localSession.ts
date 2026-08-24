/**
 * Локальный профиль в шапке до подключения корпоративного auth.
 * Это не серверная сессия и не защита маршрутов — только имя на устройстве.
 */

export const LOCAL_SESSION_KEY = 'deloresh-local-session:v1'

export type LocalSession = {
  readonly login: string
  readonly signedInAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function loadLocalSession(): LocalSession | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalSession>
    const login = typeof parsed.login === 'string' ? parsed.login.trim() : ''
    if (!login) return null
    const signedInAt =
      typeof parsed.signedInAt === 'string' && parsed.signedInAt
        ? parsed.signedInAt
        : new Date().toISOString()
    return { login, signedInAt }
  } catch {
    return null
  }
}

export function saveLocalSession(login: string): LocalSession {
  const session: LocalSession = {
    login: login.trim(),
    signedInAt: new Date().toISOString(),
  }
  if (!session.login) {
    throw new Error('login required')
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
