import { describe, expect, it } from 'vitest'

import { resolveSiteStatus } from './objectStatus'
import type { ConstructionSite } from '../types/constructionSite'

function site(partial: Partial<ConstructionSite> & Pick<ConstructionSite, 'id' | 'status'>): ConstructionSite {
  return {
    name: partial.name ?? 'Тест',
    executive: {
      planPercent: 50,
      factPercent: 50,
      summaryLine: '',
      hasOpenRisks: false,
      stages: [],
      ...partial.executive,
    },
    ...partial,
  }
}

describe('resolveSiteStatus', () => {
  const today = new Date('2026-09-12T12:00:00')

  it('просрочка больше двух недель с незакрытым фактом — критично', () => {
    const s = site({
      id: 'overdue',
      status: 'normal',
      endDateIso: '2026-05-15',
      executive: {
        planPercent: 64,
        factPercent: 62,
        summaryLine: '',
        hasOpenRisks: false,
        stages: [],
      },
    })
    expect(resolveSiteStatus(s, today)).toBe('critical')
  })

  it('без срока оставляет записанный статус', () => {
    const s = site({
      id: 'new',
      status: 'normal',
      executive: {
        planPercent: 0,
        factPercent: 0,
        summaryLine: '',
        hasOpenRisks: false,
        stages: [],
      },
    })
    expect(resolveSiteStatus(s, today)).toBe('normal')
  })

  it('просрочка меньше двух недель — внимание', () => {
    const s = site({
      id: 'soon',
      status: 'normal',
      endDateIso: '2026-09-05',
      executive: {
        planPercent: 80,
        factPercent: 78,
        summaryLine: '',
        hasOpenRisks: false,
        stages: [],
      },
    })
    expect(resolveSiteStatus(s, today)).toBe('attention')
  })

  it('закрытый по факту объект не становится критичным из-за прошедшей даты', () => {
    const s = site({
      id: 'done',
      status: 'normal',
      endDateIso: '2026-05-15',
      executive: {
        planPercent: 100,
        factPercent: 100,
        summaryLine: '',
        hasOpenRisks: false,
        stages: [],
      },
    })
    expect(resolveSiteStatus(s, today)).toBe('normal')
  })
})
