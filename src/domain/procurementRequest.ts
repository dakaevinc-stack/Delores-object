import { MEASUREMENT_UNITS, type MeasurementUnitId, unitLabel } from './brigadierReport'
export {
  PROCUREMENT_CATEGORIES,
  PROCUREMENT_MATERIAL_PRESETS,
  findProcurementCategory,
  findProcurementPreset,
  searchProcurementPresets,
  groupProcurementPresets,
} from './procurementCatalog'
export type {
  ProcurementCategory,
  ProcurementCategoryId,
  ProcurementPreset,
} from './procurementCatalog'

/** Разрешаем переиспользовать единицы из доменной модели бригадира. */
export { MEASUREMENT_UNITS, unitLabel }
export type { MeasurementUnitId }

/**
 * Идентификатор пресета материала.
 *
 * Раньше это был узкий union из 5 значений. Сейчас каталог расширен
 * (см. procurementCatalog.ts) и набирается ~30 позиций — поэтому тип
 * стал просто `string`. Все проверки идут через `findProcurementPreset`,
 * который отдаёт null для неизвестных id и умеет матчить устаревшие
 * id (curb/pipes/sand/asphalt/crushed-stone) на новые позиции.
 */
export type ProcurementMaterialPresetId = string

/** Черновик строки внутри формы. Сохраняем как строки — удобно для контролируемых input. */
export type ProcurementLineDraft = {
  id: string
  presetId: ProcurementMaterialPresetId | null
  title: string
  unitId: MeasurementUnitId
  quantity: string
}

export type ProcurementLine = {
  presetId: ProcurementMaterialPresetId | null
  title: string
  unitId: MeasurementUnitId
  quantity: number
}

/** Статус заявки для снабжения (виден на карточке по цвету). */
export type ProcurementRequestStatus = 'pending' | 'accepted' | 'rejected'

export const PROCUREMENT_STATUS_LABELS: Record<ProcurementRequestStatus, string> = {
  pending: 'В обработке',
  accepted: 'Принято',
  rejected: 'Отказано',
}

export type ProcurementRequest = {
  id: string
  /** Короткий идентификатор для подписи файла, шапки и т.п. */
  shortCode: string
  siteId: string
  siteName: string
  createdAtIso: string
  createdBy: string
  note: string
  items: readonly ProcurementLine[]
  status: ProcurementRequestStatus
  /** Срочная заявка — подсвечивается на карточке. */
  urgent: boolean
  /** К какому сроку нужна поставка на объект (ISO), или null если не указано. */
  neededByIso: string | null
}

const STORAGE_KEY_AUTHORS = 'deloresh-procurement-authors'
const MAX_REMEMBERED_NAMES = 60

/** Запоминает ФИО снабженцев между сессиями (общий список, не привязанный к объекту). */
export function loadRememberedProcurementAuthors(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTHORS)
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

export function rememberProcurementAuthor(fio: string): void {
  if (typeof localStorage === 'undefined') return
  const t = fio.trim()
  if (!t) return
  try {
    const prev = loadRememberedProcurementAuthors().filter((x) => x !== t)
    const next = [t, ...prev].slice(0, MAX_REMEMBERED_NAMES)
    localStorage.setItem(STORAGE_KEY_AUTHORS, JSON.stringify(next))
  } catch {
    /* квота / приватный режим */
  }
}

const QTY = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
})

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return QTY.format(value)
}

/** Парсит десятичную строку с поддержкой запятой; возвращает 0 для пустого. */
export function parseDecimal(s: string): number {
  const t = s.replace(/\s+/g, '').replace(',', '.')
  if (!t) return 0
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : NaN
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateTimeRu(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`
}

export function buildProcurementShortCode(createdAtIso: string): string {
  const d = new Date(createdAtIso)
  if (Number.isNaN(d.getTime())) return 'ЗАЯВКА'
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(
    d.getHours(),
  )}${pad2(d.getMinutes())}`
  return stamp
}

/** Подходящее имя файла без пробелов и спецсимволов (латиница/цифры/дефисы). */
export function buildProcurementFileBase(req: ProcurementRequest): string {
  const safeSite = req.siteId.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-')
  return `zayavka-${safeSite || 'object'}-${req.shortCode}`
}

/** Многострочное человекочитаемое представление заявки — для копирования и .txt. */
export function renderProcurementRequestPlainText(req: ProcurementRequest): string {
  const statusLabel = PROCUREMENT_STATUS_LABELS[req.status] ?? req.status
  const urgentLine = req.urgent ? '\nСрочно: да' : ''
  const neededLine =
    req.neededByIso && !Number.isNaN(new Date(req.neededByIso).getTime())
      ? `\nНужно к: ${formatDateTimeRu(req.neededByIso)}`
      : ''

  const header = [
    `ЗАЯВКА НА МАТЕРИАЛЫ № ${req.shortCode}`,
    `Объект: ${req.siteName}`,
    `Дата: ${formatDateTimeRu(req.createdAtIso)}`,
    `Заявку создал: ${req.createdBy}`,
    `Статус: ${statusLabel}${urgentLine}${neededLine}`,
  ].join('\n')

  const head = ['№', 'Материал', 'Кол-во', 'Ед.']
  const rows: string[][] = req.items.map((it, i) => [
    String(i + 1),
    it.title,
    formatQty(it.quantity),
    unitLabel(it.unitId),
  ])

  // Простая выровненная таблица моноширинными столбцами.
  const widths = head.map((h, c) =>
    Math.max(
      h.length,
      ...rows.map((r) => (r[c] ?? '').length),
    ),
  )
  const fmtRow = (cells: string[]) =>
    cells.map((v, i) => v.padEnd(widths[i], ' ')).join('  ').trimEnd()
  const sep = widths.map((w) => '-'.repeat(w)).join('  ')

  const tableLines = [fmtRow(head), sep, ...rows.map(fmtRow)]
  const noteLine = req.note.trim() ? `\nКомментарий: ${req.note.trim()}` : ''

  return `${header}\n\n${tableLines.join('\n')}${noteLine}\n`
}

/** CSV для Excel (BOM + ; как разделитель — корректно открывается в RU-локали). */
export function renderProcurementRequestCsv(req: ProcurementRequest): string {
  const escape = (v: string | number) => {
    const s = String(v)
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines: string[] = []
  lines.push(`№ заявки;${escape(req.shortCode)}`)
  lines.push(`Объект;${escape(req.siteName)}`)
  lines.push(`Дата;${escape(formatDateTimeRu(req.createdAtIso))}`)
  lines.push(`Заявку создал;${escape(req.createdBy)}`)
  lines.push(`Статус;${escape(PROCUREMENT_STATUS_LABELS[req.status] ?? req.status)}`)
  lines.push(`Срочно;${escape(req.urgent ? 'да' : 'нет')}`)
  if (req.neededByIso && !Number.isNaN(new Date(req.neededByIso).getTime())) {
    lines.push(`Нужно к;${escape(formatDateTimeRu(req.neededByIso))}`)
  }
  if (req.note.trim()) lines.push(`Комментарий;${escape(req.note.trim())}`)
  lines.push('')
  lines.push(['№', 'Материал', 'Кол-во', 'Ед.'].join(';'))
  req.items.forEach((it, i) => {
    lines.push(
      [
        i + 1,
        escape(it.title),
        escape(formatQty(it.quantity)),
        escape(unitLabel(it.unitId)),
      ].join(';'),
    )
  })
  // BOM для корректного открытия в Excel.
  return '\uFEFF' + lines.join('\n')
}

export function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
