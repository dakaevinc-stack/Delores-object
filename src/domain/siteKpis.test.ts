import { describe, expect, it } from 'vitest'

import { computeSiteLiveKpis } from './siteKpis'

describe('computeSiteLiveKpis', () => {
  it('без дат не объявляет объект завершённым', () => {
    const kpis = computeSiteLiveKpis(null, undefined, undefined, '2026-09-12')
    expect(kpis.status).toBe('unscheduled')
    expect(kpis.hasSchedule).toBe(false)
    expect(kpis.factPercent).toBe(0)
    expect(kpis.planToDatePercent).toBe(0)
  })

  it('вышедший срок при нулевом факте — просрочка, не завершение', () => {
    const kpis = computeSiteLiveKpis(null, '2026-04-07', '2026-05-15', '2026-09-12')
    expect(kpis.status).toBe('overdue')
    expect(kpis.factPercent).toBe(0)
    expect(kpis.daysOverdue).toBeGreaterThan(100)
    expect(kpis.daysToCompletion).toBe(0)
  })

  it('факт 100% после срока — завершён', () => {
    const kpis = computeSiteLiveKpis(
      {
        siteId: 's',
        siteName: 'План',
        asOfIso: '2026-05-15T00:00:00.000Z',
        sections: [
          {
            number: '1',
            title: 'Работы',
            items: [
              {
                number: '1.1',
                title: 'Всё',
                unit: 'm',
                total: 10,
                done: 10,
                startIso: '2026-04-07',
                endIso: '2026-05-15',
              },
            ],
          },
        ],
      },
      '2026-04-07',
      '2026-05-15',
      '2026-09-12',
    )
    expect(kpis.status).toBe('finished')
  })
})
