import { describe, expect, it } from 'vitest'
import {
  applyReportCorrection,
  isPositivePerformedQty,
  parsePerformedQty,
  parseResponsibleName,
} from './brigadierReport'
import { applyWorkEntriesToPlan, type WorkPlan } from './workPlan'

describe('parsePerformedQty', () => {
  it('принимает дробь с запятой и точкой', () => {
    expect(parsePerformedQty('10,5')).toEqual({ ok: true, value: 10.5 })
    expect(parsePerformedQty('10.5')).toEqual({ ok: true, value: 10.5 })
    expect(parsePerformedQty(' 3 ')).toEqual({ ok: true, value: 3 })
  })

  it('отклоняет пустое, ноль, минус и нечисло', () => {
    expect(parsePerformedQty('')).toEqual({ ok: false, reason: 'empty' })
    expect(parsePerformedQty('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(parsePerformedQty('0')).toEqual({ ok: false, reason: 'not-positive' })
    expect(parsePerformedQty('-5')).toEqual({ ok: false, reason: 'not-positive' })
    expect(parsePerformedQty('-5 м')).toEqual({ ok: false, reason: 'not-a-number' })
    expect(parsePerformedQty('нет')).toEqual({ ok: false, reason: 'not-a-number' })
  })

  it('isPositivePerformedQty не пропускает мусор в факт плана', () => {
    expect(isPositivePerformedQty(10.5)).toBe(true)
    expect(isPositivePerformedQty(0)).toBe(false)
    expect(isPositivePerformedQty(-5)).toBe(false)
    expect(isPositivePerformedQty(Number.NaN)).toBe(false)
  })
})

describe('parseResponsibleName', () => {
  it('принимает обычное ФИО', () => {
    expect(parseResponsibleName(' Иванов И. ')).toEqual({ ok: true, value: 'Иванов И.' })
  })

  it('отклоняет пустое, тире и заглушки', () => {
    expect(parseResponsibleName('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseResponsibleName('—')).toEqual({ ok: false, reason: 'placeholder' })
    expect(parseResponsibleName('-')).toEqual({ ok: false, reason: 'placeholder' })
    expect(parseResponsibleName('нет')).toEqual({ ok: false, reason: 'placeholder' })
  })
})

describe('applyReportCorrection', () => {
  const plan: WorkPlan = {
    siteId: 'site-x',
    siteName: 'Тест',
    asOfIso: '2026-05-01T00:00:00.000Z',
    sections: [
      {
        number: '1',
        title: 'Работы',
        items: [
          {
            number: '1.1',
            title: 'Бетон',
            unit: 'm3',
            total: 100,
            done: 0,
            startIso: '2026-04-01',
            endIso: '2026-06-01',
          },
        ],
      },
    ],
  }

  const base = {
    id: 'rep-1',
    siteId: 'site-x',
    reportedAtIso: '2026-09-10T10:00:00.000Z',
    lines: [],
    problems: [] as const,
    responsible: 'Иванов',
    authorLogin: 'Brigadier',
    authorName: 'Бригадир',
    comment: '',
    attachments: [] as const,
    workEntries: [
      { id: 'w1', planNumber: '1.1', planTitle: 'Бетон', qty: 10, unit: 'm3' as const },
    ],
  }

  it('меняет факт на разницу и хранит прежнюю версию', () => {
    const before = applyWorkEntriesToPlan(plan, [base])
    expect(before.sections[0]?.items[0]?.done).toBe(10)

    const corrected = applyReportCorrection(
      base,
      {
        reportedAtIso: base.reportedAtIso,
        lines: base.lines,
        problems: base.problems,
        responsible: 'Петров',
        comment: '',
        attachments: [],
        workEntries: [
          { id: 'w1', planNumber: '1.1', planTitle: 'Бетон', qty: 7, unit: 'm3' },
        ],
      },
      {
        login: 'Dakaev',
        name: 'Дакаев',
        reason: 'Ошиблись в объёме',
        atIso: '2026-09-12T12:00:00.000Z',
      },
    )

    expect(corrected.authorLogin).toBe('Brigadier')
    expect(corrected.responsible).toBe('Петров')
    expect(corrected.revisions).toHaveLength(1)
    expect(corrected.revisions?.[0]?.workEntries[0]?.qty).toBe(10)
    expect(corrected.revisions?.[0]?.responsible).toBe('Иванов')

    const after = applyWorkEntriesToPlan(plan, [corrected])
    expect(after.sections[0]?.items[0]?.done).toBe(7)
  })
})
