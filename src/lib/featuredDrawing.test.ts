import { describe, expect, it } from 'vitest'
import { pickFeaturedDrawing } from './featuredDrawing'

type Row = {
  id: string
  uploadedAtIso: string
  featuredAtIso?: string
  pngPreviewStatus?: string
  pngPreviewAtIso?: string
}

const ready = (id: string, uploadedAtIso: string, extra: Partial<Row> = {}): Row => ({
  id,
  uploadedAtIso,
  pngPreviewStatus: 'ready',
  pngPreviewAtIso: uploadedAtIso,
  ...extra,
})

describe('pickFeaturedDrawing', () => {
  it('без чертежей возвращает null', () => {
    expect(pickFeaturedDrawing([])).toBeNull()
  })

  it('берёт чертёж с готовым планом, а не самый свежий', () => {
    const rows: Row[] = [
      { id: 'broken', uploadedAtIso: '2026-09-10T10:00:00.000Z', pngPreviewStatus: 'pending' },
      ready('good', '2026-09-01T10:00:00.000Z'),
    ]
    expect(pickFeaturedDrawing(rows)?.id).toBe('good')
  })

  it('выбранный вручную чертёж главнее готовности плана', () => {
    const rows: Row[] = [
      ready('old-ready', '2026-09-01T10:00:00.000Z'),
      {
        id: 'replaced',
        uploadedAtIso: '2026-09-11T10:00:00.000Z',
        pngPreviewStatus: 'pending',
        featuredAtIso: '2026-09-11T10:00:00.000Z',
      },
    ]
    // Так замена чертежа не «перепрыгивает» на прошлую версию, пока идёт рендер.
    expect(pickFeaturedDrawing(rows)?.id).toBe('replaced')
  })

  it('из нескольких выбранных берёт последний выбор', () => {
    const rows: Row[] = [
      ready('a', '2026-09-01T10:00:00.000Z', { featuredAtIso: '2026-09-02T10:00:00.000Z' }),
      ready('b', '2026-09-01T10:00:00.000Z', { featuredAtIso: '2026-09-05T10:00:00.000Z' }),
    ]
    expect(pickFeaturedDrawing(rows)?.id).toBe('b')
  })

  it('при равных условиях берёт свежий', () => {
    const rows: Row[] = [
      ready('old', '2026-09-01T10:00:00.000Z'),
      ready('new', '2026-09-09T10:00:00.000Z'),
    ]
    expect(pickFeaturedDrawing(rows)?.id).toBe('new')
  })

  it('не зависит от исходного порядка списка', () => {
    const rows: Row[] = [
      { id: 'pending', uploadedAtIso: '2026-09-10T10:00:00.000Z' },
      ready('good', '2026-09-02T10:00:00.000Z'),
    ]
    expect(pickFeaturedDrawing([...rows].reverse())?.id).toBe('good')
  })
})
