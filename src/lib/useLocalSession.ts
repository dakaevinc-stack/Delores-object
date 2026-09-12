import { useSyncExternalStore } from 'react'
import {
  LOCAL_SESSION_KEY,
  clearLocalSession,
  loadLocalSession,
  saveLocalSession,
  type LocalSession,
} from './localSession'
import { loginStaffRemote } from './siteFormsApi'
import { saveRememberedLogin } from './rememberedLogin'
import type { SiteDutyRole } from '../domain/sitePageZone'

const SESSION_CHANGE_EVENT = 'deloresh-local-session-change'

let cachedRaw: string | null | undefined
let cachedSession: LocalSession | null = null

function readCachedSession(): LocalSession | null {
  const raw =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(LOCAL_SESSION_KEY) ??
        localStorage.getItem('deloresh-local-session:v1')
      : null
  if (raw === cachedRaw) return cachedSession
  cachedRaw = raw
  cachedSession = loadLocalSession()
  return cachedSession
}

function invalidateSessionCache() {
  cachedRaw = undefined
  cachedSession = null
}

function emitSessionChange() {
  invalidateSessionCache()
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === null ||
      e.key === LOCAL_SESSION_KEY ||
      e.key === 'deloresh-local-session:v1'
    ) {
      invalidateSessionCache()
      onStoreChange()
    }
  }
  const onLocal = () => {
    invalidateSessionCache()
    onStoreChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(SESSION_CHANGE_EVENT, onLocal)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(SESSION_CHANGE_EVENT, onLocal)
  }
}

function getSnapshot(): LocalSession | null {
  return readCachedSession()
}

function getServerSnapshot(): LocalSession | null {
  return null
}

/** Подписка на локальную сессию (та же вкладка + другие вкладки). */
export function useLocalSession(): LocalSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export type SignInResult =
  | { ok: true; session: LocalSession }
  | { ok: false; message: string }

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

export async function signInWithCredentials(
  login: string,
  password: string,
): Promise<SignInResult> {
  const remote = await loginStaffRemote(login, password)
  if (!remote.ok) {
    return {
      ok: false,
      message:
        remote.reason === 'network'
          ? 'Нет связи с сервером — вход только онлайн'
          : 'Неверный логин или пароль',
    }
  }
  if (!isDuty(remote.duty)) {
    return { ok: false, message: 'Неверная роль на сервере' }
  }
  const session = saveLocalSession({
    login: remote.login,
    fullName: remote.fullName,
    duty: remote.duty,
    dutyLabel: remote.dutyLabel,
    token: remote.token,
  })
  saveRememberedLogin(remote.login)
  emitSessionChange()
  return { ok: true, session }
}

export function signOutLocalSession(): void {
  clearLocalSession()
  emitSessionChange()
}

export function getStaffAuthToken(): string {
  return loadLocalSession()?.token ?? ''
}
