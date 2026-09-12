import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  deleteDwgPlanMark,
  dwgPlanMarksToCsv,
  filterDwgPlanMarks,
  listAllDwgPlanMarks,
  listDwgPlanMarks,
  mergeDwgPlanMarks,
  syncDwgPlanMarksFromServer,
  upsertDwgPlanMark,
  uniqueMarkAuthors,
} from './dwgPlanMarksRepository'

vi.mock('./siteFormsApi', () => ({
  fetchPlanMarksRemote: vi.fn(async () => null),
  putPlanMarksRemote: vi.fn(async () => true),
}))

import { fetchPlanMarksRemote, putPlanMarksRemote } from './siteFormsApi'

const siteId = 'test-site'
const fileId = 'file-1'

describe('dwgPlanMarksRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(fetchPlanMarksRemote).mockReset()
    vi.mocked(putPlanMarksRemote).mockReset()
    vi.mocked(fetchPlanMarksRemote).mockResolvedValue(null)
    vi.mocked(putPlanMarksRemote).mockResolvedValue(true)
  })

  it('assigns sequential numbers and keeps them after delete', () => {
    const a = upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'accepted',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'first',
      author: 'A',
    })
    const b = upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'ckkb',
      space: 'plan',
      shape: { type: 'point', x: 2, y: 2 },
      text: 'second',
      author: 'B',
    })
    expect(a.n).toBe(1)
    expect(b.n).toBe(2)
    expect(deleteDwgPlanMark(siteId, fileId, a.id)).toBe(true)
    const c = upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'note',
      space: 'plan',
      shape: { type: 'point', x: 3, y: 3 },
      text: 'third',
      author: 'C',
    })
    expect(c.n).toBe(3)
    const csv = dwgPlanMarksToCsv(listDwgPlanMarks(siteId, fileId))
    expect(csv).toContain('№;Статус')
    expect(csv.split('\n').filter((l) => l.startsWith('3;')).length).toBeGreaterThan(0)
  })

  it('stores and lists marks', () => {
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'accepted',
      space: 'plan',
      shape: { type: 'point', x: 10, y: 20 },
      text: 'Проверили',
      author: 'Иванов',
    })
    const list = listDwgPlanMarks(siteId, fileId)
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('Проверили')
    expect(list[0].kind).toBe('accepted')
  })

  it('filters by kind and period', () => {
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'ckkb',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'a',
      author: 'A',
      createdAtIso: new Date().toISOString(),
    })
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'note',
      space: 'plan',
      shape: { type: 'point', x: 2, y: 2 },
      text: 'b',
      author: 'B',
      createdAtIso: '2020-01-01T00:00:00.000Z',
    })
    const today = filterDwgPlanMarks(listDwgPlanMarks(siteId, fileId), {
      period: 'today',
      kinds: ['ckkb'],
    })
    expect(today).toHaveLength(1)
    expect(today[0].kind).toBe('ckkb')
  })

  it('filters by calendar date range', () => {
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'accepted',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'aug',
      author: 'A',
      createdAtIso: '2026-08-15T14:00:00.000Z',
    })
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'ckkb',
      space: 'plan',
      shape: { type: 'point', x: 2, y: 2 },
      text: 'sep',
      author: 'B',
      createdAtIso: '2026-09-01T10:00:00.000Z',
    })
    const list = listDwgPlanMarks(siteId, fileId)
    const oneDay = filterDwgPlanMarks(list, { dateFrom: '2026-08-15', dateTo: '2026-08-15' })
    expect(oneDay).toHaveLength(1)
    expect(oneDay[0].text).toBe('aug')
    const range = filterDwgPlanMarks(list, { dateFrom: '2026-08-01', dateTo: '2026-09-30' })
    expect(range).toHaveLength(2)
  })

  it('deletes and exports csv', () => {
    const m = upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'accepted',
      space: 'plan',
      shape: {
        type: 'zone',
        outline: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        areaM2: 12.5,
      },
      text: 'Сдали',
      author: 'Петров',
    })
    const csv = dwgPlanMarksToCsv(listDwgPlanMarks(siteId, fileId), {
      siteName: 'Тестовый объект',
      planName: 'Генплан.dwg',
    })
    expect(csv).toContain('sep=;')
    expect(csv).toContain('№;Статус')
    expect(csv).toContain('Выполнено')
    expect(csv).toContain('Сдали')
    expect(csv).toContain('12,50')
    expect(csv).toContain('Тестовый объект')
    expect(csv).toContain('Генплан.dwg')
    expect(uniqueMarkAuthors(listDwgPlanMarks(siteId, fileId))).toEqual(['Петров'])
    expect(deleteDwgPlanMark(siteId, fileId, m.id)).toBe(true)
    expect(listDwgPlanMarks(siteId, fileId)).toHaveLength(0)
  })

  it('migrates legacy per-file keys into site bundle', () => {
    localStorage.setItem(
      `deloresh.dwg-plan-marks.v1.${siteId}.${fileId}`,
      JSON.stringify([
        {
          id: 'legacy-1',
          siteId,
          fileId,
          kind: 'issue',
          space: 'plan',
          shape: { type: 'point', x: 3, y: 4 },
          text: 'старое',
          author: 'Смена',
          createdAtIso: '2026-08-01T00:00:00.000Z',
        },
      ]),
    )
    const list = listDwgPlanMarks(siteId, fileId)
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('старое')
    expect(localStorage.getItem(`deloresh.dwg-plan-marks.v1.${siteId}.${fileId}`)).toBeNull()
  })

  it('syncs from server and uploads local when remote empty', async () => {
    upsertDwgPlanMark({
      siteId,
      fileId,
      kind: 'ckkb',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'локально',
      author: 'A',
    })
    vi.mocked(fetchPlanMarksRemote).mockResolvedValue({ siteId, marks: [] })
    const synced = await syncDwgPlanMarksFromServer(siteId)
    expect(synced).toHaveLength(1)
    expect(putPlanMarksRemote).toHaveBeenCalled()
    expect(listAllDwgPlanMarks(siteId)[0].text).toBe('локально')
  })

  it('keeps both local and remote marks when syncing different ids', async () => {
    upsertDwgPlanMark({
      id: 'local-1',
      siteId,
      fileId,
      kind: 'note',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'локально',
      author: 'A',
    })
    vi.mocked(fetchPlanMarksRemote).mockResolvedValue({
      siteId,
      marks: [
        {
          id: 'remote-1',
          siteId,
          fileId,
          kind: 'accepted',
          space: 'plan',
          shape: { type: 'point', x: 9, y: 9 },
          text: 'с сервера',
          author: 'B',
          createdAtIso: '2026-08-20T00:00:00.000Z',
          updatedAtIso: '2026-08-20T00:00:00.000Z',
        },
      ],
    })
    const synced = await syncDwgPlanMarksFromServer(siteId)
    expect(synced).toHaveLength(2)
    expect(synced.map((m) => m.text).sort()).toEqual(['локально', 'с сервера'])
  })

  it('merges concurrent marks from two devices without wiping', () => {
    const a = {
      id: 'a1',
      siteId,
      fileId,
      kind: 'accepted' as const,
      space: 'plan' as const,
      shape: { type: 'point' as const, x: 1, y: 1 },
      text: 'с телефона',
      author: 'A',
      createdAtIso: '2026-08-31T10:00:00.000Z',
      updatedAtIso: '2026-08-31T10:00:00.000Z',
    }
    const b = {
      id: 'b1',
      siteId,
      fileId,
      kind: 'ckkb' as const,
      space: 'plan' as const,
      shape: { type: 'point' as const, x: 2, y: 2 },
      text: 'с ноутбука',
      author: 'B',
      createdAtIso: '2026-08-31T10:01:00.000Z',
      updatedAtIso: '2026-08-31T10:01:00.000Z',
    }
    const merged = mergeDwgPlanMarks([a], [b])
    expect(merged).toHaveLength(2)
    expect(merged.map((m) => m.id).sort()).toEqual(['a1', 'b1'])
  })

  it('soft-delete hides mark but wins over older remote copy', () => {
    upsertDwgPlanMark({
      id: 'del-1',
      siteId,
      fileId,
      kind: 'issue',
      space: 'plan',
      shape: { type: 'point', x: 1, y: 1 },
      text: 'замечание',
      author: 'A',
      createdAtIso: '2026-08-31T09:00:00.000Z',
      updatedAtIso: '2026-08-31T09:00:00.000Z',
    })
    expect(deleteDwgPlanMark(siteId, fileId, 'del-1')).toBe(true)
    expect(listDwgPlanMarks(siteId, fileId)).toHaveLength(0)
    const local = JSON.parse(
      localStorage.getItem(`deloresh.dwg-plan-marks.v2.${siteId}`)!,
    ).marks
    const remoteStillAlive = [
      {
        id: 'del-1',
        siteId,
        fileId,
        kind: 'issue',
        space: 'plan',
        shape: { type: 'point', x: 1, y: 1 },
        text: 'замечание',
        author: 'A',
        createdAtIso: '2026-08-31T09:00:00.000Z',
        updatedAtIso: '2026-08-31T09:00:00.000Z',
      },
    ]
    const merged = mergeDwgPlanMarks(local, remoteStillAlive)
    expect(merged[0].deletedAtIso).toBeTruthy()
  })
})
