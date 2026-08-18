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
      receipt: null,
      unloadPoint: null,
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
    expect(out[0]?.receipt).toBeNull()
    expect(out[0]?.unloadPoint).toBeNull()
  })

  it('сохраняет отказ с фото и временем', () => {
    const siteId = 's2'
    const req: ProcurementRequest = {
      id: 'r2',
      shortCode: '20260817-1848',
      siteId,
      siteName: 'Тестовый объект',
      createdAtIso: new Date('2026-08-17T12:00:00Z').toISOString(),
      createdBy: 'Снабжение',
      note: '',
      items: [{ presetId: null, title: 'Грунт', unitId: 'm3', quantity: 20 }],
      status: 'refused',
      urgent: false,
      neededByIso: null,
      receipt: {
        decision: 'refused',
        atIso: '2026-08-17T15:48:00.000Z',
        reason: 'Плохое качество',
        media: [{ id: 'm1', kind: 'photo', name: 'bad.jpg', previewUrl: 'data:image/jpeg;base64,xx' }],
      },
      unloadPoint: null,
    }
    saveProcurementRequests(siteId, [req])
    const out = loadProcurementRequests(siteId)
    expect(out[0]?.status).toBe('refused')
    expect(out[0]?.receipt?.reason).toBe('Плохое качество')
    expect(out[0]?.receipt?.media).toHaveLength(1)
  })

  it('сохраняет точку разгрузки в заявке', () => {
    const siteId = 's3'
    const req: ProcurementRequest = {
      id: 'r3',
      shortCode: '20260818-1500',
      siteId,
      siteName: 'Тестовый объект',
      createdAtIso: new Date('2026-08-18T12:00:00Z').toISOString(),
      createdBy: 'Бригадир',
      note: '',
      items: [{ presetId: null, title: 'Песок', unitId: 'm3', quantity: 8 }],
      status: 'pending',
      urgent: false,
      neededByIso: null,
      receipt: null,
      unloadPoint: {
        lat: 55.5,
        lng: 37.56,
        address: 'ул. Вокзальная, 12',
        hint: 'Западные ворота',
        updatedAtIso: '2026-08-18T12:00:00.000Z',
      },
    }
    saveProcurementRequests(siteId, [req])
    const out = loadProcurementRequests(siteId)
    expect(out[0]?.unloadPoint?.address).toBe('ул. Вокзальная, 12')
    expect(out[0]?.unloadPoint?.lat).toBe(55.5)
  })
})

