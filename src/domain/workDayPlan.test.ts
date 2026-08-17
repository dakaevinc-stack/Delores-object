import { describe, expect, it } from 'vitest'
import {
  attachStageBrief,
  canSubmitStage,
  formatProgressLine,
  formatWorkPointLine,
  issuedQtyByPlanItemMap,
  issuedQtyForPlanItem,
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
    briefMedia: [],
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

  it('постановка сразу занимает объём; факт бригадира подменяет задание', () => {
    const a = assignment([stage({ id: 's1', status: 'open', plannedQty: 100 })])
    expect(issuedQtyForPlanItem([a], '2.2')).toBe(100)

    const next = submitStage(a, 's1', 80, [
      { id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' },
    ])
    expect(next.stages[0]!.status).toBe('done')
    expect(next.stages[0]!.actualQty).toBe(80)
    expect(issuedQtyForPlanItem([next], '2.2')).toBe(80)
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
    expect(issuedQtyForPlanItem([a], '2.2')).toBe(50)
  })

  it('settleAssignment снимает locked и переводит submitted в done', () => {
    const a = settleAssignment(
      assignment([
        stage({
          id: 's1',
          status: 'submitted',
          actualQty: 42,
          submittedAtIso: '2026-08-11T11:00:00.000Z',
          planItemNumber: '2.2',
          media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'blob:x' }],
        }),
        stage({ id: 's2', status: 'locked', planItemNumber: '2.9', title: 'Щебень' }),
      ]),
    )
    expect(a.stages[0]!.status).toBe('done')
    expect(a.stages[1]!.status).toBe('open')
    expect(a.stages[0]!.planItemNumber).toBe('2.2')
    expect(issuedQtyForPlanItem([a], '2.2')).toBe(42)
  })

  it('settleAssignment схлопывает одинаковые пункты в один шаг', () => {
    const a = settleAssignment(
      assignment([
        stage({ id: 's1', status: 'open', plannedQty: 100, planItemNumber: '5.4' }),
        stage({ id: 's2', status: 'open', plannedQty: 100, planItemNumber: '5.4' }),
        stage({ id: 's3', status: 'open', plannedQty: 40, planItemNumber: '5.8' }),
      ]),
    )
    expect(a.stages).toHaveLength(2)
    expect(a.stages[0]!.planItemNumber).toBe('5.4')
    expect(a.stages[1]!.planItemNumber).toBe('5.8')
  })

  it('два задания по одной строке складываются, шаги одной работы — нет', () => {
    const a = assignment([
      stage({ id: 's1', status: 'open', plannedQty: 100 }),
      stage({ id: 's2', status: 'open', plannedQty: 100 }),
    ])
    const b: WorkDayAssignment = {
      ...assignment([stage({ id: 't1', status: 'open', plannedQty: 40 })]),
      id: 'a2',
    }
    const map = issuedQtyByPlanItemMap([a, b])
    expect(map.get('2.2')).toBe(140)
  })

  it('разные пункты в одном задании занимают каждая свою строку', () => {
    const a = assignment([
      stage({
        id: 's1',
        status: 'open',
        plannedQty: 40,
        planItemNumber: '5.2',
        planItemTitle: 'Разработка траншеи',
      }),
      stage({
        id: 's2',
        status: 'open',
        plannedQty: 40,
        planItemNumber: '5.4',
        planItemTitle: 'Укладка трубы ПНД Ø63',
      }),
    ])
    expect(issuedQtyForPlanItem([a], '5.2')).toBe(40)
    expect(issuedQtyForPlanItem([a], '5.4')).toBe(40)
    expect(issuedQtyForPlanItem([a], '2.2')).toBe(0)
  })

  it('formatWorkPointLine собирает пункт, название и объём', () => {
    expect(formatWorkPointLine('5.4', 'Укладка трубы ПНД Ø63', 100, 'м')).toBe(
      'Пункт 5.4. Укладка трубы ПНД Ø63 — 100 м',
    )
  })

  it('attachStageBrief копит пояснение начальника и не закрывает шаг', () => {
    const a = assignment([stage({ id: 's1', status: 'open' })])
    const next = attachStageBrief(a, 's1', [
      { id: 'm1', kind: 'photo', name: 'место.jpg', previewUrl: 'blob:x' },
    ])
    expect(next.stages[0]!.briefMedia).toHaveLength(1)
    expect(next.stages[0]!.status).toBe('open')
    expect(next.stages[0]!.media).toHaveLength(0)
  })
})
