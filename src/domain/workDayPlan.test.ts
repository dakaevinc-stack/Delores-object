import { describe, expect, it } from 'vitest'
import {
  acceptedQtyByPlanItemMap,
  acceptedQtyForPlanItem,
  canSubmitStage,
  formatProgressLine,
  settleAssignment,
  submitStage,
  type WorkDayAssignment,
  type WorkDayStage,
} from './workDayPlan'

function stage(partial: Partial<WorkDayStage> & Pick<WorkDayStage, 'id' | 'status'>): WorkDayStage {
  return {
    title: 'Песчаное основание 300 мм',
    requirements: '300 мм',
    plannedQty: 100,
    unit: 'м',
    actualQty: null,
    media: [],
    submittedAtIso: null,
    reviewedAtIso: null,
    ...partial,
  }
}

function assignment(stages: WorkDayStage[]): WorkDayAssignment {
  return {
    id: 'a1',
    siteId: 'brusilova',
    dateKey: '2026-08-11',
    area: 'Участок А',
    brigadierName: 'Минасян А.Л.',
    planItemNumber: '2.2',
    planItemTitle: 'Песчаное основание',
    planTotalQty: 2000,
    planUnit: 'м',
    stages,
    createdAtIso: '2026-08-11T10:00:00.000Z',
  }
}

describe('workDayPlan', () => {
  it('без медиа этап сдать нельзя', () => {
    const open = stage({ id: 's1', status: 'open' })
    expect(canSubmitStage(open, 100)).toBe(false)
    expect(
      canSubmitStage(
        {
          ...open,
          media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' }],
        },
        100,
      ),
    ).toBe(true)
  })

  it('submitStage сразу помечает этап выполненным', () => {
    const a = assignment([
      stage({ id: 's1', status: 'open' }),
      stage({ id: 's2', status: 'open', title: 'Щебень 20–40' }),
    ])
    const next = submitStage(a, 's1', 80, [
      { id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' },
    ])
    expect(next.stages[0]!.status).toBe('done')
    expect(next.stages[0]!.actualQty).toBe(80)
    expect(next.stages[1]!.status).toBe('open')
    expect(acceptedQtyForPlanItem([next], '2.2')).toBe(80)
    expect(formatProgressLine(80, 2000, 'м')).toMatch(
      /Выполнено 80 из 2\s?000 м — осталось 1\s?920 м/,
    )
  })

  it('можно закрыть любой этап, в том числе второй раньше первого', () => {
    let a = assignment([
      stage({ id: 's1', status: 'open' }),
      stage({ id: 's2', status: 'open' }),
    ])
    const media = [{ id: 'm1', kind: 'photo' as const, name: 'a.jpg', previewUrl: 'blob:x' }]
    a = submitStage(a, 's2', 40, media)
    expect(a.stages[0]!.status).toBe('open')
    expect(a.stages[1]!.status).toBe('done')
    a = submitStage(a, 's1', 50, [{ ...media[0]!, id: 'm2' }])
    expect(a.stages[0]!.status).toBe('done')
    expect(acceptedQtyForPlanItem([a], '2.2')).toBe(90)
  })

  it('settleAssignment снимает locked и переводит submitted в done', () => {
    const a = settleAssignment(
      assignment([
        stage({
          id: 's1',
          status: 'submitted',
          actualQty: 42,
          submittedAtIso: '2026-08-11T11:00:00.000Z',
          media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' }],
        }),
        stage({ id: 's2', status: 'locked' }),
      ]),
    )
    expect(a.stages[0]!.status).toBe('done')
    expect(a.stages[1]!.status).toBe('open')
    expect(acceptedQtyForPlanItem([a], '2.2')).toBe(42)
  })

  it('acceptedQtyByPlanItemMap суммирует только принятые этапы', () => {
    const a = assignment([
      stage({ id: 's1', status: 'done', actualQty: 40 }),
      stage({ id: 's2', status: 'done', actualQty: 10 }),
      stage({ id: 's3', status: 'open', actualQty: 99 }),
    ])
    const map = acceptedQtyByPlanItemMap([a])
    expect(map.get('2.2')).toBe(50)
  })
})
