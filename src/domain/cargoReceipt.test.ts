import { describe, expect, it } from 'vitest'
import type { ProcurementRequest } from './procurementRequest'
import {
  applyCargoReceipt,
  formatReceiptClockRu,
  formatReceiptStampRu,
  makeAcceptedReceipt,
  makePartialAcceptedReceipt,
  makeRefusedReceipt,
  parseAcceptanceLines,
  receivedQtyForItem,
  refuseCargoError,
  remainingQtyForItem,
  voidActiveAcceptances,
} from './cargoReceipt'

function req(): ProcurementRequest {
  return {
    id: 'r1',
    shortCode: 'A-1',
    siteId: 'brusilova',
    siteName: 'Брусилова',
    createdAtIso: '2026-08-17T08:00:00.000Z',
    createdBy: 'Снабжение',
    note: '',
    items: [{ presetId: 'sand-quarry', title: 'Песок', unitId: 'm3', quantity: 40 }],
    status: 'pending',
    urgent: false,
    neededByIso: null,
    receipt: null,
    unloadPoint: null,
  }
}

const photo = [{ id: 'm1', kind: 'photo' as const, name: 'a.jpg', previewUrl: 'data:image/jpeg;base64,xx' }]

describe('cargoReceipt', () => {
  it('отказ без фото нельзя', () => {
    expect(refuseCargoError('Качество не соответствует', 'Грунт с глиной и мусором', 0)).toBe(
      'Приложите фото или видео — без фиксации отказ не сохранится',
    )
    expect(
      makeRefusedReceipt(
        '2026-08-17T15:48:00.000Z',
        'Качество не соответствует',
        'Грунт с глиной и мусором',
        [],
      ).ok,
    ).toBe(false)
  })

  it('отказ без выбранной причины нельзя', () => {
    expect(refuseCargoError('', 'Грунт с глиной и мусором', 1)).toBe(
      'Выберите причину отказа в приёмке',
    )
  })

  it('отказ без письменного пояснения нельзя', () => {
    expect(refuseCargoError('Качество не соответствует', 'плохо', 1)).toBe(
      'Напишите, что именно не так с материалом',
    )
    expect(refuseCargoError('Качество не соответствует', '   ', 1)).toBe(
      'Напишите, что именно не так с материалом',
    )
  })

  it('принимает груз и ставит время само', () => {
    const atIso = '2026-08-17T15:48:00.000Z'
    const next = applyCargoReceipt(req(), makeAcceptedReceipt(atIso))
    expect(next.status).toBe('accepted')
    expect(next.receipt?.decision).toBe('accepted')
    expect(next.receipt?.atIso).toBe(atIso)
  })

  it('отказ с причиной, пояснением и фото не списывает материал', () => {
    const made = makeRefusedReceipt(
      '2026-08-17T15:48:00.000Z',
      'Недостаточный объём',
      'Щебня меньше, чем в накладной',
      photo,
    )
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const next = applyCargoReceipt(req(), made.receipt)
    expect(next.status).toBe('refused')
    expect(next.receipt?.reason).toBe('Недостаточный объём. Щебня меньше, чем в накладной')
    expect(next.receipt?.media).toHaveLength(1)
  })

  it('из 2,25 принимает 1, затем 1,25 — без удвоения', () => {
    const base = {
      ...req(),
      items: [{ presetId: 'sand-quarry', title: 'Песок', unitId: 'm3' as const, quantity: 2.25 }],
    }
    const first = applyCargoReceipt(
      base,
      makePartialAcceptedReceipt('2026-08-17T10:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 1 },
      ]),
    )
    expect(remainingQtyForItem(first, 0)).toBe(1.25)
    const twice = applyCargoReceipt(
      first,
      makePartialAcceptedReceipt('2026-08-17T10:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 1 },
      ]),
    )
    expect(remainingQtyForItem(twice, 0)).toBe(0.25)
    const done = applyCargoReceipt(
      first,
      makePartialAcceptedReceipt('2026-08-17T11:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 1.25 },
      ]),
    )
    expect(done.status).toBe('accepted')
    expect(remainingQtyForItem(done, 0)).toBe(0)
  })

  it('частичная приёмка оставляет остаток, вторая закрывает заявку', () => {
    const first = applyCargoReceipt(
      req(),
      makePartialAcceptedReceipt('2026-08-17T10:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 1 },
      ]),
    )
    expect(first.status).toBe('approved')
    expect(receivedQtyForItem(first, 0)).toBe(1)
    expect(remainingQtyForItem(first, 0)).toBe(39)

    const second = applyCargoReceipt(
      first,
      makePartialAcceptedReceipt('2026-08-17T12:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 39 },
      ]),
    )
    expect(second.status).toBe('accepted')
    expect(remainingQtyForItem(second, 0)).toBe(0)
    expect(second.receipts).toHaveLength(2)
  })

  it('нельзя принять больше остатка', () => {
    const parsed = parseAcceptanceLines(req(), ['41'])
    expect(parsed.ok).toBe(false)
  })

  it('аннулирование приёмки возвращает остаток ровно один раз', () => {
    const accepted = applyCargoReceipt(
      req(),
      makePartialAcceptedReceipt('2026-08-17T10:00:00.000Z', [
        { itemIndex: 0, title: 'Песок', unitId: 'm3', qty: 10 },
      ]),
    )
    const voided = voidActiveAcceptances(
      accepted,
      'Ошиблись в объёме',
      'Дакаев',
      '2026-08-17T16:00:00.000Z',
    )
    expect(voided.status).toBe('approved')
    expect(remainingQtyForItem(voided, 0)).toBe(40)
    expect(voided.receipts?.[0]?.voidReason).toBe('Ошиблись в объёме')
    const again = voidActiveAcceptances(voided, 'ещё раз', 'Дакаев', '2026-08-17T16:01:00.000Z')
    expect(remainingQtyForItem(again, 0)).toBe(40)
  })

  it('штамп даты без выбора руками', () => {
    const local = new Date(2026, 7, 17, 15, 48, 0)
    expect(formatReceiptStampRu(local.toISOString())).toBe('17.08.2026 в 15:48')
    expect(formatReceiptClockRu(local.toISOString())).toBe('17 августа, 15:48')
  })
})
