import { describe, expect, it } from 'vitest'
import type { ProcurementRequest } from './procurementRequest'
import {
  applyCargoReceipt,
  formatReceiptClockRu,
  formatReceiptStampRu,
  makeAcceptedReceipt,
  makeRefusedReceipt,
  refuseCargoError,
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

  it('штамп даты без выбора руками', () => {
    const local = new Date(2026, 7, 17, 15, 48, 0)
    expect(formatReceiptStampRu(local.toISOString())).toBe('17.08.2026 в 15:48')
    expect(formatReceiptClockRu(local.toISOString())).toBe('17 августа, 15:48')
  })
})
