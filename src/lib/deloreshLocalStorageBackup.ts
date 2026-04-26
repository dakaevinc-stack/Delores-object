/**
 * Резервное копирование и восстановление данных приложения в localStorage.
 * Ключи должны совпадать с: sitesRepository, fleetRegistry, vehicleOverrides,
 * siteObjectMedia (авторы), procurementRequest, brigadierReports.
 */

const EXACT_KEYS = [
  'deloresh-user-sites:v1',
  'fleet:registry',
  'deloresh-procurement-authors',
] as const

const KEY_PREFIXES = [
  'fleet:overrides:',
  'deloresh-site-object-media-authors:',
  'deloresh-procurement-requests:',
  'deloresh-brigadier-reports:',
] as const

function isManagedKey(key: string): boolean {
  if ((EXACT_KEYS as readonly string[]).includes(key)) return true
  return KEY_PREFIXES.some((p) => key.startsWith(p))
}

/** Все ключи приложения, для которых в storage есть значение. */
export function listDeloreshLocalStorageKeys(): string[] {
  if (typeof localStorage === 'undefined') return []
  const out = new Set<string>()
  for (const k of EXACT_KEYS) {
    if (localStorage.getItem(k) != null) out.add(k)
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !isManagedKey(k)) continue
    out.add(k)
  }
  return [...out].sort()
}

export function exportDeloreshLocalStorageSnapshot(): Record<string, string> {
  const snap: Record<string, string> = {}
  for (const k of listDeloreshLocalStorageKeys()) {
    const v = localStorage.getItem(k)
    if (v !== null) snap[k] = v
  }
  return snap
}

export type ImportResult = { applied: number; skipped: number; errors: string[] }

/**
 * Записывает только разрешённые ключи из снимка (остальной JSON игнорируется).
 */
export function importDeloreshLocalStorageSnapshot(
  snap: Record<string, string>,
): ImportResult {
  const errors: string[] = []
  let applied = 0
  let skipped = 0
  if (typeof localStorage === 'undefined') {
    return { applied: 0, skipped: 0, errors: ['localStorage недоступен'] }
  }
  for (const [k, v] of Object.entries(snap)) {
    if (typeof v !== 'string') {
      skipped++
      continue
    }
    if (!isManagedKey(k)) {
      skipped++
      continue
    }
    try {
      localStorage.setItem(k, v)
      applied++
    } catch (e) {
      errors.push(`${k}: ${String(e)}`)
    }
  }
  return { applied, skipped, errors }
}

export function downloadDeloreshLocalStorageBackupJson(): void {
  const snap = exportDeloreshLocalStorageSnapshot()
  const body = JSON.stringify(
    {
      _deloreshBackup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      keys: snap,
    },
    null,
    2,
  )
  const blob = new Blob([body], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  a.href = url
  a.download = `deloresh-localStorage-${stamp}.json`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export function parseBackupFileText(json: string): Record<string, string> | null {
  try {
    const data = JSON.parse(json) as unknown
    if (data && typeof data === 'object' && '_deloreshBackup' in data) {
      const keys = (data as { keys?: unknown }).keys
      if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v
        }
        return out
      }
    }
    /* Плоский объект «ключ → строка» без обёртки */
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (k.startsWith('_')) continue
        if (typeof v === 'string') out[k] = v
      }
      return Object.keys(out).length > 0 ? out : null
    }
  } catch {
    return null
  }
  return null
}

export function installDeloreshBackupBridge(): void {
  if (typeof window === 'undefined') return
  try {
    window.DELORESH_BACKUP = {
      keys: () => listDeloreshLocalStorageKeys(),
      exportJson: () =>
        JSON.stringify(
          {
            _deloreshBackup: true,
            version: 1,
            exportedAt: new Date().toISOString(),
            keys: exportDeloreshLocalStorageSnapshot(),
          },
          null,
          2,
        ),
      download: () => downloadDeloreshLocalStorageBackupJson(),
      importJson: (json: string) => {
        const snap = parseBackupFileText(json)
        if (!snap) return { applied: 0, skipped: 0, errors: ['Не удалось разобрать JSON'] }
        return importDeloreshLocalStorageSnapshot(snap)
      },
    }
  } catch {
    /* приватный режим / запрет storage — приложение всё равно должно открыться */
  }
}
