import type { MeasurementUnitId } from './brigadierReport'
import type { ProcurementLine, ProcurementRequest, ProcurementRequestStatus } from './procurementRequest'

export type CargoReceiptDecision = 'accepted' | 'refused'

export type CargoReceiptMedia = {
  id: string
  kind: 'photo' | 'video'
  name: string
  previewUrl: string
}

export type CargoReceiptLine = {
  itemIndex: number
  title: string
  unitId: MeasurementUnitId
  qty: number
}

export type CargoReceipt = {
  id?: string
  decision: CargoReceiptDecision
  atIso: string
  reason: string
  media: readonly CargoReceiptMedia[]
  receivedBy?: string
  lines?: readonly CargoReceiptLine[]
  voidedAtIso?: string
  voidedBy?: string
  voidReason?: string
}

/** Типовые причины отказа в приёмке. Пояснение своими словами — отдельно и обязательно. */
export const CARGO_REFUSE_REASONS = [
  'Недостаточный объём',
  'Качество не соответствует',
  'Поставлен не тот материал',
] as const

/** Минимальная длина пояснения: короткий чип без текста не считается отказом. */
export const MIN_REFUSE_NOTE_CHARS = 12

export type CargoRefuseReason = (typeof CARGO_REFUSE_REASONS)[number]

const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function validDate(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «17 августа, 18:48» — часы на экране, без выбора даты. */
export function formatReceiptClockRu(iso: string): string {
  const d = validDate(iso)
  if (!d) return iso
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** «17.08.2026 в 18:48» — штамп на карточке. */
export function formatReceiptStampRu(iso: string): string {
  const d = validDate(iso)
  if (!d) return iso
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} в ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`
}

export function isCargoRefuseReason(value: string): value is CargoRefuseReason {
  return (CARGO_REFUSE_REASONS as readonly string[]).includes(value)
}

export function composeRefuseReason(category: string, note: string): string {
  const cat = category.trim()
  const text = note.trim().replace(/\s+/g, ' ')
  if (cat && text) return `${cat}. ${text}`
  return text || cat
}

export function refuseCargoError(
  category: string,
  note: string,
  mediaCount: number,
): string | null {
  if (!isCargoRefuseReason(category)) return 'Выберите причину отказа в приёмке'
  if (note.trim().length < MIN_REFUSE_NOTE_CHARS) {
    return 'Напишите, что именно не так с материалом'
  }
  if (!(mediaCount > 0)) return 'Приложите фото или видео — без фиксации отказ не сохранится'
  return null
}

export function cargoStatusForDecision(decision: CargoReceiptDecision): ProcurementRequestStatus {
  return decision === 'accepted' ? 'accepted' : 'refused'
}

function newReceiptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `rcpt-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function makeAcceptedReceipt(
  atIso: string,
  items?: readonly ProcurementLine[],
  receivedBy?: string,
): CargoReceipt {
  return {
    id: newReceiptId(),
    decision: 'accepted',
    atIso,
    reason: '',
    media: [],
    receivedBy,
    lines: items?.map((item, itemIndex) => ({
      itemIndex,
      title: item.title,
      unitId: item.unitId,
      qty: item.quantity,
    })),
  }
}

export function isActiveAcceptance(receipt: CargoReceipt): boolean {
  return receipt.decision === 'accepted' && !receipt.voidedAtIso
}

export function isActiveRefuse(receipt: CargoReceipt): boolean {
  return receipt.decision === 'refused' && !receipt.voidedAtIso
}

function sameReceipt(a: CargoReceipt, b: CargoReceipt): boolean {
  if (a.id && b.id) return a.id === b.id
  return a.decision === b.decision && a.atIso === b.atIso
}

export function collectReceipts(req: Pick<ProcurementRequest, 'receipt' | 'receipts'>): CargoReceipt[] {
  const out: CargoReceipt[] = []
  for (const row of req.receipts ?? []) {
    if (!out.some((x) => sameReceipt(x, row))) out.push(row)
  }
  if (req.receipt && !out.some((x) => sameReceipt(x, req.receipt!))) {
    out.push(req.receipt)
  }
  return out.sort((a, b) => a.atIso.localeCompare(b.atIso))
}

export function receivedQtyForItem(
  req: Pick<ProcurementRequest, 'items' | 'receipt' | 'receipts'>,
  itemIndex: number,
): number {
  const item = req.items[itemIndex]
  if (!item) return 0
  let sum = 0
  for (const rec of collectReceipts(req).filter(isActiveAcceptance)) {
    if (rec.lines && rec.lines.length > 0) {
      const hit =
        rec.lines.find((line) => line.itemIndex === itemIndex) ??
        rec.lines.find((line) => line.title === item.title && line.unitId === item.unitId)
      if (hit && Number.isFinite(hit.qty) && hit.qty > 0) sum += hit.qty
    } else {
      sum += Number.isFinite(item.quantity) ? item.quantity : 0
    }
  }
  return sum
}

export function remainingQtyForItem(
  req: Pick<ProcurementRequest, 'items' | 'receipt' | 'receipts'>,
  itemIndex: number,
): number {
  const item = req.items[itemIndex]
  if (!item || !Number.isFinite(item.quantity)) return 0
  return Math.max(0, item.quantity - receivedQtyForItem(req, itemIndex))
}

export function requestHasOpenRemainder(
  req: Pick<ProcurementRequest, 'items' | 'receipt' | 'receipts'>,
): boolean {
  return req.items.some((_, index) => remainingQtyForItem(req, index) > 0)
}

export function hasActiveAcceptance(
  req: Pick<ProcurementRequest, 'receipt' | 'receipts'>,
): boolean {
  return collectReceipts(req).some(isActiveAcceptance)
}

/** Сколько реально пришло по строке: из приёмок или, для старых «принято целиком», весь объём. */
export function acceptedQtyForItem(req: ProcurementRequest, itemIndex: number): number {
  const item = req.items[itemIndex]
  if (!item) return 0
  if (hasActiveAcceptance(req)) return receivedQtyForItem(req, itemIndex)
  if (req.status === 'accepted') return Number.isFinite(item.quantity) ? item.quantity : 0
  return 0
}

export function parseAcceptanceLines(
  req: ProcurementRequest,
  rawQtyByIndex: readonly string[],
):
  | { ok: true; lines: CargoReceiptLine[] }
  | { ok: false; error: string } {
  const lines: CargoReceiptLine[] = []
  for (let i = 0; i < req.items.length; i += 1) {
    const item = req.items[i]!
    const raw = String(rawQtyByIndex[i] ?? '').trim()
    if (!raw) continue
    const qty = Number(raw.replace(',', '.'))
    if (!Number.isFinite(qty)) {
      return { ok: false, error: `В строке «${item.title}» должно быть число` }
    }
    if (qty <= 0) {
      return { ok: false, error: 'Принятый объём должен быть больше нуля' }
    }
    const remaining = remainingQtyForItem(req, i)
    if (qty - remaining > 0.0005) {
      return {
        ok: false,
        error: `По «${item.title}» осталось ${remaining}, нельзя принять ${qty}`,
      }
    }
    lines.push({ itemIndex: i, title: item.title, unitId: item.unitId, qty })
  }
  if (lines.length === 0) {
    return { ok: false, error: 'Укажите, сколько материала фактически пришло' }
  }
  return { ok: true, lines }
}

export function makePartialAcceptedReceipt(
  atIso: string,
  lines: readonly CargoReceiptLine[],
  receivedBy?: string,
): CargoReceipt {
  return {
    id: newReceiptId(),
    decision: 'accepted',
    atIso,
    reason: '',
    media: [],
    receivedBy,
    lines,
  }
}

export function applyAcceptance(req: ProcurementRequest, receipt: CargoReceipt): ProcurementRequest {
  const receipts = [...collectReceipts(req), receipt]
  const next: ProcurementRequest = {
    ...req,
    receipts,
    receipt,
  }
  return {
    ...next,
    status: requestHasOpenRemainder(next) ? 'approved' : 'accepted',
  }
}

export function voidActiveAcceptances(
  req: ProcurementRequest,
  reason: string,
  actor: string,
  atIso: string,
): ProcurementRequest {
  const note = reason.trim()
  const receipts = collectReceipts(req).map((row) =>
    isActiveAcceptance(row)
      ? { ...row, voidedAtIso: atIso, voidedBy: actor, voidReason: note }
      : row,
  )
  const latest = receipts[receipts.length - 1] ?? null
  return {
    ...req,
    receipts,
    receipt: latest,
    status: 'approved',
  }
}

export function makeRefusedReceipt(
  atIso: string,
  category: string,
  note: string,
  media: readonly CargoReceiptMedia[],
): { ok: true; receipt: CargoReceipt } | { ok: false; error: string } {
  const error = refuseCargoError(category, note, media.length)
  if (error) return { ok: false, error }
  return {
    ok: true,
    receipt: {
      decision: 'refused',
      atIso,
      reason: composeRefuseReason(category, note),
      media,
    },
  }
}

export function applyCargoReceipt(
  req: ProcurementRequest,
  receipt: CargoReceipt,
): ProcurementRequest {
  if (receipt.decision === 'accepted') return applyAcceptance(req, receipt)
  return {
    ...req,
    status: cargoStatusForDecision(receipt.decision),
    receipt,
  }
}

export function cargoReceiptPatch(receipt: CargoReceipt): Pick<ProcurementRequest, 'status' | 'receipt'> {
  return {
    status: cargoStatusForDecision(receipt.decision),
    receipt,
  }
}
