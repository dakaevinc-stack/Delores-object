import { useSyncExternalStore } from 'react'
import {
  LOCAL_SESSION_KEY,
  clearLocalSession,
  loadLocalSession,
  saveLocalSession,
  type LocalSession,
} from './localSession'
import { findStaffByCredentials } from '../domain/staffDirectory'
import { saveRememberedLogin } from './rememberedLogin'

const SESSION_CHANGE_EVENT = 'deloresh-local-session-change'

let cachedRaw: string | null | undefined
let cachedSession: LocalSession | null = null

function readCachedSession(): LocalSession | null {
  const raw =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(LOCAL_SESSION_KEY)
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
    if (e.key === null || e.key === LOCAL_SESSION_KEY) {
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

export function signInWithCredentials(login: string, password: string): SignInResult {
  const member = findStaffByCredentials(login, password)
  if (!member) {
    return { ok: false, message: 'Неверный логин или пароль' }
  }
  const session = saveLocalSession({
    login: member.login,
    fullName: member.fullName,
    duty: member.duty,
    dutyLabel: member.dutyLabel,
  })
  saveRememberedLogin(member.login)
  emitSessionChange()
  return { ok: true, session }
}

export function signOutLocalSession(): void {
  clearLocalSession()
  emitSessionChange()
}
