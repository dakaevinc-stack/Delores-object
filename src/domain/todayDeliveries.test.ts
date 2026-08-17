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

  it('сегодняшние поставки без отказанных', () => {
    const list = collectTodayDeliveries(
      [
        req({ id: 'ok', status: 'pending' }),
        req({ id: 'done', status: 'accepted' }),
        req({ id: 'no', status: 'rejected' }),
        req({
          id: 'tomorrow',
          status: 'pending',
          neededByIso: '2026-08-18T10:00:00.000Z',
        }),
      ],
      '2026-08-17',
    )
    expect(list.map((c) => c.requestId).sort()).toEqual(['done', 'ok'])
    expect(list.find((c) => c.requestId === 'ok')?.items[0]?.title).toBe('Песок карьерный')
  })

  it('просроченные — только непринятые с датой раньше сегодня', () => {
    const list = collectOverdueDeliveries(
      [
        req({
          id: 'late',
          status: 'pending',
          neededByIso: '2026-08-16T10:00:00.000Z',
        }),
        req({ id: 'today', status: 'pending' }),
      ],
      '2026-08-17',
    )
    expect(list.map((c) => c.requestId)).toEqual(['late'])
  })
})
