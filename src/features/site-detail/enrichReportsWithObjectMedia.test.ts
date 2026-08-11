import { describe, expect, it } from 'vitest'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import type { StoredSiteMedia } from '../../lib/mediaRepository'
import { enrichReportsWithObjectMedia } from './enrichReportsWithObjectMedia'

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

  it('медиа без отчёта в день — к ближайшему отчёту', () => {
    const reports = [report({ id: 'r1', reportedAtIso: '2026-04-29T12:00:00.000Z' })]
    const items = [media({ id: 'm1', capturedAtIso: '2026-04-14T10:00:00.000Z' })]
    const out = enrichReportsWithObjectMedia(reports, items, () => 'x')
    expect(out[0]!.attachments.map((a) => a.id)).toEqual(['objmedia:m1'])
  })
})
