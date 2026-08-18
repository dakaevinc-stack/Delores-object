import type { ProcurementRequest, ProcurementRequestStatus } from './procurementRequest'

export type CargoReceiptDecision = 'accepted' | 'refused'

export type CargoReceiptMedia = {
  id: string
  kind: 'photo' | 'video'
  name: string
  previewUrl: string
}

export type CargoReceipt = {
  decision: CargoReceiptDecision
  atIso: string
  reason: string
  media: readonly CargoReceiptMedia[]
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

export function makeAcceptedReceipt(atIso: string): CargoReceipt {
  return { decision: 'accepted', atIso, reason: '', media: [] }
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
