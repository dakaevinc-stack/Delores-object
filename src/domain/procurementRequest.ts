import { MEASUREMENT_UNITS, type MeasurementUnitId, unitLabel } from './brigadierReport'
import type { CargoReceipt } from './cargoReceipt'
export type { CargoReceipt, CargoReceiptMedia } from './cargoReceipt'
import type { SiteDeliveryPoint } from './siteDeliveryPoint'
import { renderDriverDirections, yandexMapsRouteUrl } from './siteDeliveryPoint'
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

/** Статус заявки: сначала снабжение, затем приёмка на объекте. */
export type ProcurementRequestStatus =
  | 'pending'
  | 'approved'
  | 'accepted'
  | 'rejected'
  | 'refused'
  | 'cancelled'

export const PROCUREMENT_STATUS_LABELS: Record<ProcurementRequestStatus, string> = {
  pending: 'Ждёт согласования',
  approved: 'Согласовано',
  accepted: 'Принято на объекте',
  rejected: 'Отказано снабжением',
  refused: 'Отказано в приёмке',
  cancelled: 'Снята снабжением',
}

/** Приёмщик видит только то, что снабжение уже согласовало. */
export function isVisibleToMaterialReceiver(req: Pick<ProcurementRequest, 'status'>): boolean {
  return req.status === 'approved' || req.status === 'accepted' || req.status === 'refused'
}

export function canSupplyApprove(req: Pick<ProcurementRequest, 'status'>): boolean {
  return req.status === 'pending' || req.status === 'rejected' || req.status === 'cancelled'
}

export function canSupplyCancel(req: Pick<ProcurementRequest, 'status'>): boolean {
  return req.status === 'pending' || req.status === 'approved'
}

export function canSupplyEdit(req: Pick<ProcurementRequest, 'status'>): boolean {
  return (
    req.status === 'pending' ||
    req.status === 'approved' ||
    req.status === 'rejected' ||
    req.status === 'cancelled'
  )
}

export function canReceiveOnSite(req: Pick<ProcurementRequest, 'status' | 'receipt'>): boolean {
  return req.status === 'approved' && !req.receipt
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
  /** Факт приёмки/отказа на объекте: время ставится само, к отказу — фото. */
  receipt: CargoReceipt | null
  /** Куда разгружать именно эту заявку. Если null — общая точка объекта или не указано. */
  unloadPoint: SiteDeliveryPoint | null
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
export function renderProcurementRequestPlainText(
  req: ProcurementRequest,
  deliveryPoint?: SiteDeliveryPoint | null,
): string {
  const statusLabel = PROCUREMENT_STATUS_LABELS[req.status] ?? req.status
  const urgentLine = req.urgent ? '\nСрочно: да' : ''
  const neededLine =
    req.neededByIso && !Number.isNaN(new Date(req.neededByIso).getTime())
      ? `\nНужно к: ${formatDateTimeRu(req.neededByIso)}`
      : ''
  const receiptLine = req.receipt
    ? `\nНа объекте: ${
        req.receipt.decision === 'accepted' ? 'принято' : 'отказано в приёмке'
      } ${formatDateTimeRu(req.receipt.atIso)}${
        req.receipt.reason ? ` (${req.receipt.reason})` : ''
      }${req.receipt.media.length > 0 ? `, файлов: ${req.receipt.media.length}` : ''}`
    : ''

  const header = [
    `ЗАЯВКА НА МАТЕРИАЛЫ № ${req.shortCode}`,
    `Объект: ${req.siteName}`,
    `Дата: ${formatDateTimeRu(req.createdAtIso)}`,
    `Заявку создал: ${req.createdBy}`,
    `Статус: ${statusLabel}${urgentLine}${neededLine}${receiptLine}`,
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
  const point = req.unloadPoint ?? deliveryPoint
  const pointBlock = point
    ? `\n\n${renderDriverDirections(req.siteName, point)}`
    : ''

  return `${header}\n\n${tableLines.join('\n')}${noteLine}${pointBlock}\n`
}

/** CSV для Excel (BOM + ; как разделитель — корректно открывается в RU-локали). */
export function renderProcurementRequestCsv(
  req: ProcurementRequest,
  deliveryPoint?: SiteDeliveryPoint | null,
): string {
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
  if (req.receipt) {
    lines.push(
      `На объекте;${escape(
        `${req.receipt.decision === 'accepted' ? 'принято' : 'отказано в приёмке'} ${formatDateTimeRu(
          req.receipt.atIso,
        )}`,
      )}`,
    )
    if (req.receipt.reason) lines.push(`Причина отказа;${escape(req.receipt.reason)}`)
  }
  const point = req.unloadPoint ?? deliveryPoint
  if (point) {
    lines.push(`Точка разгрузки;${escape(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`)}`)
    if (point.address) lines.push(`Адрес;${escape(point.address)}`)
    if (point.hint) lines.push(`Как подъехать;${escape(point.hint)}`)
    lines.push(`Маршрут;${escape(yandexMapsRouteUrl(point))}`)
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
