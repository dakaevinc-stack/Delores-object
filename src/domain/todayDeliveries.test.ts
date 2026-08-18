import { describe, expect, it } from 'vitest'
import type { ProcurementRequest } from './procurementRequest'
import {
  collectOverdueDeliveries,
  collectTodayDeliveries,
  requestDeliveryDateKey,
} from './todayDeliveries'

function req(
  patch: Partial<ProcurementRequest> & Pick<ProcurementRequest, 'id' | 'status'>,
): ProcurementRequest {
  return {
    shortCode: 'A-1',
    siteId: 'brusilova',
    siteName: 'Брусилова',
    createdAtIso: '2026-08-17T08:00:00.000Z',
    createdBy: 'Снабжение',
    note: '',
    items: [
      {
        presetId: 'sand-quarry',
        title: 'Песок карьерный',
        unitId: 'm3',
        quantity: 40,
      },
    ],
    urgent: false,
    neededByIso: '2026-08-17T12:00:00.000Z',
    receipt: null,
    ...patch,
  }
}

describe('todayDeliveries', () => {
  it('берёт день из «нужно к»', () => {
    expect(requestDeliveryDateKey(req({ id: '1', status: 'pending' }))).toBe('2026-08-17')
  })

  it('если срока нет — день создания заявки', () => {
    const created = '2026-08-18T12:00:00.000Z'
    expect(
      requestDeliveryDateKey(
        req({ id: '1', status: 'pending', neededByIso: null, createdAtIso: created }),
      ),
    ).toBe(requestDeliveryDateKey(req({ id: '2', status: 'pending', neededByIso: created })))
  })

  it('сегодняшние поставки — только согласованные снабжением', () => {
    const list = collectTodayDeliveries(
      [
        req({ id: 'draft', status: 'pending' }),
        req({ id: 'ok', status: 'approved' }),
        req({ id: 'done', status: 'accepted' }),
        req({ id: 'no', status: 'rejected' }),
        req({ id: 'off', status: 'cancelled' }),
        req({
          id: 'bad',
          status: 'refused',
          receipt: {
            decision: 'refused',
            atIso: '2026-08-17T15:48:00.000Z',
            reason: 'Плохое качество',
            media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'data:,' }],
          },
        }),
        req({
          id: 'tomorrow',
          status: 'approved',
          neededByIso: '2026-08-18T10:00:00.000Z',
        }),
      ],
      '2026-08-17',
    )
    expect(list.map((c) => c.requestId).sort()).toEqual(['bad', 'done', 'ok'])
    expect(list.find((c) => c.requestId === 'ok')?.items[0]?.title).toBe('Песок карьерный')
    expect(list.find((c) => c.requestId === 'ok')?.status).toBe('pending')
    expect(list.find((c) => c.requestId === 'bad')?.status).toBe('refused')
  })

  it('снятая снабжением заявка не видна приёмщику', () => {
    const list = collectTodayDeliveries(
      [req({ id: 'ok', status: 'approved' }), req({ id: 'off', status: 'cancelled' })],
      '2026-08-17',
    )
    expect(list.map((c) => c.requestId)).toEqual(['ok'])
  })

  it('просроченные — только согласованные, ещё не принятые', () => {
    const list = collectOverdueDeliveries(
      [
        req({
          id: 'late',
          status: 'approved',
          neededByIso: '2026-08-16T10:00:00.000Z',
        }),
        req({
          id: 'draft',
          status: 'pending',
          neededByIso: '2026-08-16T10:00:00.000Z',
        }),
        req({ id: 'today', status: 'approved' }),
      ],
      '2026-08-17',
    )
    expect(list.map((c) => c.requestId)).toEqual(['late'])
  })
})
