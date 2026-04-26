/**
 * Пользовательские объекты (созданные через форму «Добавить объект»).
 * Живут в localStorage и «докладываются» к справочнику `MOCK_CONSTRUCTION_SITES`.
 * Позже этот слой уедет в HTTP-API без изменений в подписчиках.
 */

import { MOCK_CONSTRUCTION_SITES } from '../data/constructionSites.mock'
import type { ConstructionSite } from '../types/constructionSite'

const STORAGE_KEY = 'deloresh-user-sites:v1'

type Listener = () => void
const listeners = new Set<Listener>()

let cachedUserSites: readonly ConstructionSite[] | null = null
let cachedMerged: readonly ConstructionSite[] | null = null

function readFromStorage(): ConstructionSite[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is ConstructionSite =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as ConstructionSite).id === 'string' &&
        typeof (x as ConstructionSite).name === 'string' &&
        !!(x as ConstructionSite).executive,
    )
  } catch {
    return []
  }
}

function persist(next: ConstructionSite[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* квота/приватный режим — пропускаем */
  }
}

function refresh() {
  cachedUserSites = readFromStorage()
  cachedMerged = [...cachedUserSites, ...MOCK_CONSTRUCTION_SITES]
  for (const l of listeners) l()
}

function ensureInitialized() {
  if (cachedUserSites === null) refresh()
}

export function listAllSites(): readonly ConstructionSite[] {
  ensureInitialized()
  return cachedMerged ?? MOCK_CONSTRUCTION_SITES
}

export function listUserSites(): readonly ConstructionSite[] {
  ensureInitialized()
  return cachedUserSites ?? []
}

export function addUserSite(site: ConstructionSite): void {
  ensureInitialized()
  const next = [site, ...(cachedUserSites ?? [])]
  persist(next)
  refresh()
}

export function removeUserSite(id: string): void {
  ensureInitialized()
  const next = (cachedUserSites ?? []).filter((s) => s.id !== id)
  persist(next)
  refresh()
}

export function subscribeSites(listener: Listener): () => void {
  listeners.add(listener)
  ensureInitialized()
  return () => {
    listeners.delete(listener)
  }
}

export function isUserSiteId(id: string): boolean {
  ensureInitialized()
  return !!(cachedUserSites ?? []).find((s) => s.id === id)
}
