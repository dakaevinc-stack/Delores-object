import { describe, expect, it } from 'vitest'
import { summarizeProcurementAccounting } from './procurementAccounting'
import type { ProcurementRequest } from './procurementRequest'

function req(partial: Partial<ProcurementRequest> & Pick<ProcurementRequest, 'id' | 'createdBy'>): ProcurementRequest {
  return {
    id: partial.id,
    shortCode: partial.shortCode ?? '001',
    siteId: 'brusilova',
    siteName: 'Брусилова',
    createdAtIso: partial.createdAtIso ?? '2026-08-19T10:00:00.000Z',
    createdBy: partial.createdBy,
    note: '',
    items: partial.items ?? [],
    status: partial.status ?? 'pending',
    urgent: false,
    neededByIso: null,
    receipt: null,
    unloadPoint: null,
  }
}

describe('procurementAccounting', () => {
  it('суммирует материалы по заявителю и по объекту', () => {
    const requests: ProcurementRequest[] = [
      req({
        id: 'a1',
        shortCode: 'A1',
        createdBy: 'Петров',
        items: [{ presetId: 'sand-quarry', title: 'Песок карьерный', unitId: 'm3', quantity: 100 }],
      }),
      req({
        id: 'a2',
        shortCode: 'A2',
        createdBy: 'Петров',
        status: 'accepted',
        items: [{ presetId: 'sand-quarry', title: 'Песок карьерный', unitId: 'm3', quantity: 50 }],
      }),
      req({
        id: 'b1',
        shortCode: 'B1',
        createdBy: 'Иванов',
        items: [{ presetId: 'crushed-granite-5-20', title: 'Щебень 5–20', unitId: 'm3', quantity: 20 }],
      }),
    ]

    const summary = summarizeProcurementAccounting(requests)
    expect(summary.totalRequests).toBe(3)
    expect(summary.authors).toHaveLength(2)

    const petrov = summary.authors.find((a) => a.name === 'Петров')
    expect(petrov?.requestCount).toBe(2)
    expect(petrov?.materials[0]?.requestedQty).toBe(150)
    expect(petrov?.materials[0]?.acceptedQty).toBe(50)

    const sand = summary.materials.find((m) => m.title === 'Песок карьерный')
    expect(sand?.requestedQty).toBe(150)
    expect(sand?.acceptedQty).toBe(50)
    expect(sand?.refs).toHaveLength(2)
  })

  it('не включает снятые и отклонённые снабжением в requestedQty', () => {
    const summary = summarizeProcurementAccounting([
      req({
        id: 'c1',
        createdBy: 'Сидоров',
        status: 'cancelled',
        items: [{ presetId: 'sand-quarry', title: 'Песок карьерный', unitId: 'm3', quantity: 999 }],
      }),
      req({
        id: 'c2',
        createdBy: 'Сидоров',
        status: 'rejected',
        items: [{ presetId: 'sand-quarry', title: 'Песок карьерный', unitId: 'm3', quantity: 888 }],
      }),
    ])

    expect(summary.materials[0]?.requestedQty).toBe(0)
    expect(summary.byStatus.cancelled).toBe(1)
    expect(summary.byStatus.rejected).toBe(1)
  })
})
