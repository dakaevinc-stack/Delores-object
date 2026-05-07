/**
 * Парсер свободного комментария бригадира в структурные блоки журнала
 * смены: работы (с количеством), что было уложено, состав бригады.
 *
 * Бригадиры пишут комментарии в одном живом стиле, например:
 *   «Выкоп траншеи под бортовой камень — 110 м.п. Устройство щебёночного
 *   основания под БК — 50 м.п. Уложено: труба Ø63 — 370 м.п., труба Ø110
 *   — 112 м.п. Приём материала. Бригада: 2 ИТР, 16 рабочих, 7 ед.
 *   техники.»
 *
 * Парсер:
 *  - режет текст по точкам/восклицательным/вопросительным знакам;
 *  - предложения с префиксом «Уложено:» уходят в `laid` — каждое
 *    запятая-разделённое значение становится отдельным элементом;
 *  - предложение с «Бригада:» парсится в численный состав;
 *  - всё остальное идёт в `works` (с попыткой выделить количество вида
 *    «...— 110 м.п.», иначе только заголовок активности).
 *
 * Если ни один блок не получился (например, бригадир написал нелитературный
 * однострочник без шаблонов) — `hasStructure: false`, и UI показывает
 * исходный текст в плоском виде.
 */

export type BrigadierWorkEntry = {
  activity: string
  /** Количество с единицей измерения, например «110 м.п.», «800 м²». */
  quantity?: string
}

export type BrigadierLaidItem = {
  /** Название материала / изделия, например «труба Ø63». */
  name: string
  /** Количество с единицей, если удалось разобрать. */
  quantity?: string
}

export type BrigadierCrew = {
  itr?: number
  workers?: number
  equipment?: number
  people?: number
  raw: string
}

export type BrigadierCommentSections = {
  works: BrigadierWorkEntry[]
  laid: BrigadierLaidItem[]
  crew: BrigadierCrew | null
  /** Очищенный исходный текст — для fallback-рендера. */
  fallback: string
  /** Хотя бы один структурный блок удалось извлечь. */
  hasStructure: boolean
}

/**
 * Сплиттер по предложениям, который НЕ ломается на сокращениях вроде
 * «м.п.», «ед.», «тыс.» — режем только тогда, когда после точки идёт
 * пробел и заглавная буква нового предложения.
 */
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[А-ЯЁA-Z])/
const TRAILING_PUNCT_RE = /[.,!?;:]+$/
const DASH_SPLIT_RE = /\s+[—–-]\s+/

function trimTrailingPunct(s: string): string {
  return s.replace(TRAILING_PUNCT_RE, '').trim()
}

/**
 * Делит «название — количество» по em-/en-/обычному дефису, окружённому
 * пробелами, чтобы не зацепить дефисы в составных словах вроде «по-новому».
 */
function splitActivityAndQuantity(text: string): { activity: string; quantity?: string } {
  const trimmed = trimTrailingPunct(text.trim())
  if (!trimmed) return { activity: '' }
  const idx = trimmed.search(DASH_SPLIT_RE)
  if (idx < 0) return { activity: trimmed }
  const activity = trimTrailingPunct(trimmed.slice(0, idx).trim())
  const rest = trimTrailingPunct(trimmed.slice(idx).replace(DASH_SPLIT_RE, '').trim())
  if (!activity || !rest) return { activity: trimmed }
  return { activity, quantity: rest }
}

/**
 * «труба Ø63 — 370 м.п.» → { name: 'труба Ø63', quantity: '370 м.п' }
 * «бордюр БР100» → { name: 'бордюр БР100' }
 */
function parseLaidItem(text: string): BrigadierLaidItem {
  const { activity, quantity } = splitActivityAndQuantity(text)
  return { name: activity, quantity }
}

function matchNumber(text: string, regex: RegExp): number | undefined {
  const m = text.match(regex)
  if (!m) return undefined
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) ? n : undefined
}

function parseCrew(raw: string): BrigadierCrew {
  const cleaned = trimTrailingPunct(raw)
  return {
    itr: matchNumber(cleaned, /(\d+)\s*итр/i),
    workers: matchNumber(cleaned, /(\d+)\s*рабоч/i),
    equipment: matchNumber(cleaned, /(\d+)\s*ед\.?\s*техник/i),
    people: matchNumber(cleaned, /(\d+)\s*(?:человек|чел(?=[.,\s]|$))/i),
    raw: cleaned,
  }
}

export function parseBrigadierComment(
  input: string | null | undefined,
): BrigadierCommentSections {
  const fallback = (input ?? '').trim()
  const empty: BrigadierCommentSections = {
    works: [],
    laid: [],
    crew: null,
    fallback,
    hasStructure: false,
  }
  if (!fallback) return empty

  const sentences = fallback
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean)

  const works: BrigadierWorkEntry[] = []
  const laid: BrigadierLaidItem[] = []
  let crew: BrigadierCrew | null = null

  for (const sentence of sentences) {
    const stripped = trimTrailingPunct(sentence)
    if (!stripped) continue

    const laidMatch = stripped.match(/^Уложено\s*:\s*(.+)$/i)
    if (laidMatch) {
      const items = laidMatch[1]
        .split(/\s*,\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map(parseLaidItem)
      laid.push(...items)
      continue
    }

    const crewMatch = stripped.match(/^Бригада\s*:\s*(.+)$/i)
    if (crewMatch) {
      crew = parseCrew(crewMatch[1])
      continue
    }

    works.push(splitActivityAndQuantity(stripped))
  }

  const crewHasNumbers =
    crew !== null &&
    (crew.itr != null || crew.workers != null || crew.equipment != null || crew.people != null)

  const hasStructure =
    works.length > 0 || laid.length > 0 || (crew !== null && crewHasNumbers)

  return { works, laid, crew, fallback, hasStructure }
}
