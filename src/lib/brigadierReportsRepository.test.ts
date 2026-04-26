import { beforeEach, describe, expect, it } from 'vitest'
import { loadBrigadierReports, saveBrigadierReports } from './brigadierReportsRepository'
import type { BrigadierStoredReport } from '../domain/brigadierReport'

describe('brigadierReportsRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('сохраняет и читает отчёты по объекту', () => {
    const siteId = 'site-a'
    const report: BrigadierStoredReport = {
      id: 'rep-1',
      siteId,
      reportedAtIso: new Date('2026-04-01T10:00:00Z').toISOString(),
      lines: [{ index: 1, text: 'Тестовая строка' }],
      problems: [],
      responsible: 'Иванов',
      comment: 'Всё ок',
      attachments: [],
    }
    saveBrigadierReports(siteId, [report])
    const out = loadBrigadierReports(siteId)
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('rep-1')
    expect(out[0]?.comment).toBe('Всё ок')
  })
})
