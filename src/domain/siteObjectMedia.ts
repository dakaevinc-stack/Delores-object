/**
 * Быстрые материалы с объекта (фото/видео) без полного отчёта бригадира.
 * В демо хранятся в состоянии страницы; позже — загрузка на сервер.
 */

const STORAGE_PREFIX = 'deloresh-site-object-media-authors:'

/** Сколько ФИО держим в памяти браузера (MRU). */
const MAX_REMEMBERED_NAMES = 40

export function loadRememberedAuthorNames(siteId: string): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + siteId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    for (const x of parsed) {
      if (typeof x !== 'string') continue
      const t = x.trim()
      if (t && !out.includes(t)) out.push(t)
    }
    return out
  } catch {
    return []
  }
}

/** Запоминает ФИО для быстрого выбора при следующих визитах на этот объект. */
export function rememberAuthorName(siteId: string, fio: string): void {
  if (typeof localStorage === 'undefined') return
  const t = fio.trim()
  if (!t) return
  try {
    const prev = loadRememberedAuthorNames(siteId).filter((x) => x !== t)
    const next = [t, ...prev].slice(0, MAX_REMEMBERED_NAMES)
    localStorage.setItem(STORAGE_PREFIX + siteId, JSON.stringify(next))
  } catch {
    /* квота, приватный режим */
  }
}

export type SiteObjectMediaItem = {
  id: string
  siteId: string
  kind: 'photo' | 'video'
  name: string
  mime: string
  sizeBytes: number
  /** Object URL на blob из IndexedDB. Живёт до unmount секции / удаления файла. */
  previewUrl: string
  /** Когда файл был снят (из lastModified, fallback — время загрузки). */
  capturedAtIso: string
  /** Когда файл появился в хранилище объекта. */
  uploadedAtIso: string
  /** ФИО того, кто выложил файл. */
  authorCaption: string
}
