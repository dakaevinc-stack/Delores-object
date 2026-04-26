import { beforeEach, describe, expect, it } from 'vitest'
import { loadProcurementRequests, saveProcurementRequests } from './procurementRequestsRepository'
import type { ProcurementRequest } from '../domain/procurementRequest'

describe('procurementRequestsRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('сохраняет и читает список заявок по объекту', () => {
    const siteId = 's1'
    const req: ProcurementRequest = {
      id: 'r1',
      shortCode: '20260101-1200',
      siteId,
      siteName: 'Тестовый объект',
      createdAtIso: new Date('2026-01-01T12:00:00Z').toISOString(),
      createdBy: 'Иванов И.И.',
      note: '',
      items: [{ presetId: null, title: 'Песок', unitId: 'm3', quantity: 12 }],
      status: 'pending',
      urgent: true,
      neededByIso: new Date('2026-01-02T08:00:00Z').toISOString(),
    }
    saveProcurementRequests(siteId, [req])
    const out = loadProcurementRequests(siteId)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('r1')
    expect(out[0]?.status).toBe('pending')
    expect(out[0]?.urgent).toBe(true)
    expect(out[0]?.neededByIso).toBeTruthy()
  })

  it('нормализует старые записи без статуса и срочности', () => {
    const siteId = 'legacy-site'
    const legacy = {
      id: 'old1',
      shortCode: '20260101-1200',
      siteId,
      siteName: 'Старый объект',
      createdAtIso: new Date('2026-01-01T12:00:00Z').toISOString(),
      createdBy: 'Петров',
      note: '',
      items: [{ presetId: null, title: 'Щебень', unitId: 't' as const, quantity: 1 }],
    }
    localStorage.setItem(
      `deloresh-procurement-requests:${siteId}:v1`,
      JSON.stringify([legacy]),
    )
    const out = loadProcurementRequests(siteId)
    expect(out[0]?.status).toBe('pending')
    expect(out[0]?.urgent).toBe(false)
    expect(out[0]?.neededByIso).toBeNull()
  })
})

