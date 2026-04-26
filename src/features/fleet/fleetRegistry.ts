import type { FleetCategory, FleetVehicle } from '../../domain/fleet'

/**
 * Локальный реестр парка.
 *
 *   — `added`             — единицы, созданные пользователем (не из mock).
 *   — `removedIds`        — id единиц из базового mock, которые пользователь удалил.
 *   — `customCategories`  — пользовательские классы техники (например, «Автокраны»).
 *
 * Хранение — `localStorage`, чтобы изменения сохранялись между перезагрузками
 * страницы до появления бэкенда. Структура защищена от старых/сломанных
 * значений — парсер молча возвращает пустой реестр при ошибке.
 */
export type FleetRegistry = {
  added: FleetVehicle[]
  removedIds: string[]
  customCategories: FleetCategory[]
}

export const EMPTY_REGISTRY: FleetRegistry = {
  added: [],
  removedIds: [],
  customCategories: [],
}

const KEY = 'fleet:registry'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadRegistry(): FleetRegistry {
  const ls = safeStorage()
  if (!ls) return { ...EMPTY_REGISTRY }
  try {
    const raw = ls.getItem(KEY)
    if (!raw) return { ...EMPTY_REGISTRY }
    const parsed = JSON.parse(raw) as Partial<FleetRegistry>
    return {
      added: Array.isArray(parsed.added) ? parsed.added : [],
      removedIds: Array.isArray(parsed.removedIds) ? parsed.removedIds : [],
      customCategories: Array.isArray(parsed.customCategories)
        ? parsed.customCategories.filter(
            (c): c is FleetCategory =>
              !!c && typeof c.id === 'string' && typeof c.title === 'string',
          )
        : [],
    }
  } catch {
    return { ...EMPTY_REGISTRY }
  }
}

export function saveRegistry(reg: FleetRegistry): void {
  const ls = safeStorage()
  if (!ls) return
  try {
    if (
      reg.added.length === 0 &&
      reg.removedIds.length === 0 &&
      reg.customCategories.length === 0
    ) {
      ls.removeItem(KEY)
      return
    }
    ls.setItem(KEY, JSON.stringify(reg))
  } catch {
    /* quota или приватный режим — не ломаем UI */
  }
}

/** Генерация уникального id для новой единицы. */
export function nextVehicleId(): string {
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 7)
  return `v-new-${ts}-${rnd}`
}

/**
 * Превращает произвольное русское/латинское название в безопасный slug для URL:
 * «Автокраны и манипуляторы» → «avtokrany-i-manipulyatory».
 * Если получилось пусто — генерирует случайный id.
 */
const CYR_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

export function slugifyCategory(name: string): string {
  const lower = name.trim().toLowerCase()
  const transliterated = Array.from(lower)
    .map((ch) => CYR_MAP[ch] ?? ch)
    .join('')
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (slug) return `custom-${slug}`
  const rnd = Math.random().toString(36).slice(2, 7)
  return `custom-${rnd}`
}

/**
 * Сокращённое имя для чипсов и карточек — обрезаем слишком длинные названия,
 * чтобы не ломать вёрстку списков.
 */
export function shortenCategoryTitle(title: string, limit = 22): string {
  const t = title.trim()
  if (t.length <= limit) return t
  return t.slice(0, limit - 1).trimEnd() + '…'
}
