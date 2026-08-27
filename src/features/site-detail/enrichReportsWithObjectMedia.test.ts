import { describe, expect, it } from 'vitest'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import type { StoredSiteMedia } from '../../lib/mediaRepository'
import {
  enrichReportsWithObjectMedia,
  listBrigadierJournalEntries,
  listOrphanObjectMediaDays,
} from './enrichReportsWithObjectMedia'

function report(
  partial: Partial<BrigadierStoredReport> & Pick<BrigadierStoredReport, 'id' | 'reportedAtIso'>,
): BrigadierStoredReport {
  return {
    siteId: 'brusilova',
    lines: [],
    problems: [],
    responsible: 'Минасян А.Л.',
    comment: '',
    attachments: [],
    ...partial,
  }
}

function media(
  partial: Partial<StoredSiteMedia> & Pick<StoredSiteMedia, 'id' | 'capturedAtIso'>,
): StoredSiteMedia {
  return {
    siteId: 'brusilova',
    kind: 'photo',
    name: 'a.jpg',
    mime: 'image/jpeg',
    sizeBytes: 10,
    uploadedAtIso: partial.capturedAtIso,
    authorCaption: 'Тест',
    ...partial,
  }
}

describe('enrichReportsWithObjectMedia', () => {
  it('привязывает медиа к отчёту того же дня', () => {
    const reports = [report({ id: 'r1', reportedAtIso: '2026-05-04T18:00:00.000Z' })]
    const items = [media({ id: 'm1', capturedAtIso: '2026-05-04T10:00:00.000Z' })]
    const out = enrichReportsWithObjectMedia(reports, items, (id) => `url:${id}`)
    expect(out[0]!.attachments).toHaveLength(1)
    expect(out[0]!.attachments[0]!.id).toBe('objmedia:m1')
    expect(out[0]!.attachments[0]!.previewUrl).toBe('url:m1')
  })

  it('медиа без отчёта в день не цепляет к другому дню', () => {
    const reports = [report({ id: 'r1', reportedAtIso: '2026-04-29T12:00:00.000Z' })]
    const items = [media({ id: 'm1', capturedAtIso: '2026-04-14T10:00:00.000Z' })]
    const out = enrichReportsWithObjectMedia(reports, items, () => 'x')
    expect(out[0]!.attachments).toEqual([])
  })
})

describe('listOrphanObjectMediaDays', () => {
  it('собирает дни без отчёта', () => {
    const reports = [report({ id: 'r1', reportedAtIso: '2026-04-29T12:00:00.000Z' })]
    const items = [
      media({ id: 'm1', capturedAtIso: '2026-04-14T10:00:00.000Z' }),
      media({ id: 'm2', capturedAtIso: '2026-04-29T08:00:00.000Z' }),
    ]
    const orphans = listOrphanObjectMediaDays(reports, items)
    expect(orphans).toHaveLength(1)
    expect(orphans[0]!.dayKey).toBe('2026-04-14')
    expect(orphans[0]!.items.map((m) => m.id)).toEqual(['m1'])
  })
})

describe('listBrigadierJournalEntries', () => {
  it('склеивает отчёты и дни с фото в одну ленту по дате', () => {
    const reports = [
      report({ id: 'r1', reportedAtIso: '2026-04-29T12:00:00.000Z' }),
    ]
    const orphans = [
      {
        dayKey: '2026-04-14',
        items: [media({ id: 'm1', capturedAtIso: '2026-04-14T10:00:00.000Z' })],
      },
    ]
    const journal = listBrigadierJournalEntries(reports, orphans)
    expect(journal.map((e) => e.kind)).toEqual(['report', 'media-day'])
    expect(journal[0]!.id).toBe('report:r1')
    expect(journal[1]!.id).toBe('media:2026-04-14')
  })
})
