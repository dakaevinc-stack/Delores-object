import { describe, expect, it } from 'vitest'
import {
  acceptedQtyByPlanItemMap,
  acceptedQtyForPlanItem,
  approveStage,
  canSubmitStage,
  formatProgressLine,
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

  it('после приёмки открывается следующий этап и копится прогресс', () => {
    let a = assignment([
      stage({
        id: 's1',
        status: 'submitted',
        actualQty: 100,
        media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' }],
      }),
      stage({ id: 's2', status: 'locked', title: 'Щебень 20–40' }),
    ])
    a = approveStage(a, 's1', '2026-08-11T12:00:00.000Z')
    expect(a.stages[0]!.status).toBe('done')
    expect(a.stages[1]!.status).toBe('open')
    expect(acceptedQtyForPlanItem([a], '2.2')).toBe(100)
    expect(formatProgressLine(100, 2000, 'м')).toMatch(
      /Выполнено 100 из 2\s?000 м — осталось 1\s?900 м/,
    )
  })

  it('submitStage пишет факт и статус submitted', () => {
    const a = assignment([stage({ id: 's1', status: 'open' })])
    const next = submitStage(a, 's1', 80, [
      { id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' },
    ])
    expect(next.stages[0]!.status).toBe('submitted')
    expect(next.stages[0]!.actualQty).toBe(80)
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
