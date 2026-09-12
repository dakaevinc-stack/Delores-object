import { beforeEach, describe, expect, it } from 'vitest'
import {
  coerceReport,
  loadBrigadierReports,
  saveBrigadierReports,
} from './brigadierReportsRepository'
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

  it('выбрасывает workEntries с нулевым и отрицательным объёмом', () => {
    const report = coerceReport({
      id: 'rep-2',
      siteId: 'site-a',
      reportedAtIso: '2026-09-12T10:00:00.000Z',
      lines: [],
      problems: [],
      responsible: 'Иванов',
      comment: '',
      attachments: [],
      workEntries: [
        { id: 'a', planNumber: '1.1', planTitle: 'Бетон', qty: -5, unit: 'm' },
        { id: 'b', planNumber: '1.2', planTitle: 'Щебень', qty: 10.5, unit: 'm' },
        { id: 'c', planNumber: '1.3', planTitle: 'Ноль', qty: 0, unit: 'm' },
      ],
    })
    expect(report.workEntries?.map((w) => w.id)).toEqual(['b'])
  })

  it('сохраняет автора и историю исправлений', () => {
    const report = coerceReport({
      id: 'rep-3',
      siteId: 'site-a',
      reportedAtIso: '2026-09-12T10:00:00.000Z',
      lines: [],
      problems: [],
      responsible: 'Иванов',
      authorLogin: 'Brigadier',
      authorName: 'Бригадир',
      comment: '',
      attachments: [],
      revisions: [
        {
          revisedAtIso: '2026-09-12T11:00:00.000Z',
          revisedByLogin: 'Dakaev',
          revisedByName: 'Дакаев',
          reason: 'Объём',
          responsible: 'Петров',
          workEntries: [{ id: 'w1', planNumber: '1.1', planTitle: 'Бетон', qty: 4, unit: 'm3' }],
        },
      ],
    })
    expect(report.authorLogin).toBe('Brigadier')
    expect(report.revisions).toHaveLength(1)
    expect(report.revisions?.[0]?.reason).toBe('Объём')
  })
})
