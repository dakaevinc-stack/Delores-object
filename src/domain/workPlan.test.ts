import { describe, expect, it } from 'vitest'
import {
  durationDays,
  formatPeriod,
  isItemDeferred,
  isItemScheduled,
  parseRussianShortDate,
  summarizeWorkPlan,
  summarizeWorkPlanSection,
  workItemPercent,
  type WorkPlan,
  type WorkPlanItem,
} from './workPlan'
import { BRUSILOVA_WORK_PLAN } from '../data/workPlans/brusilova'

describe('parseRussianShortDate', () => {
  it('распознаёт 1/5/25 → 2025-05-01', () => {
    expect(parseRussianShortDate('1/5/25')).toBe('2025-05-01')
  })

  it('распознаёт двузначные дни и месяцы', () => {
    expect(parseRussianShortDate('22/06/25')).toBe('2025-06-22')
    expect(parseRussianShortDate('10/07/2025')).toBe('2025-07-10')
  })

  it('допускает разделители . и -', () => {
    expect(parseRussianShortDate('1.5.25')).toBe('2025-05-01')
    expect(parseRussianShortDate('15-05-25')).toBe('2025-05-15')
  })

  it('31/12/29 — это «нет даты», возвращает null', () => {
    expect(parseRussianShortDate('31/12/29')).toBeNull()
  })

  it('возвращает null на пустой/невалидный ввод', () => {
    expect(parseRussianShortDate('')).toBeNull()
    expect(parseRussianShortDate(null)).toBeNull()
    expect(parseRussianShortDate('хрень')).toBeNull()
    expect(parseRussianShortDate('32/13/25')).toBeNull()
  })
})

describe('workItemPercent / scheduled / deferred', () => {
  const baseline: WorkPlanItem = {
    number: '1.1',
    title: 'Test',
    unit: 'm',
    total: 100,
    done: 25,
    startIso: '2025-05-01',
    endIso: '2025-05-10',
  }

  it('считает процент', () => {
    expect(workItemPercent(baseline)).toBe(25)
  })

  it('total=0 → 0%, не падает', () => {
    expect(workItemPercent({ ...baseline, total: 0, done: 0 })).toBe(0)
  })

  it('clamp до 100% даже если факт перевыполнен', () => {
    expect(workItemPercent({ ...baseline, total: 100, done: 250 })).toBe(100)
  })

  it('isItemScheduled: позиция с объёмом и сроком — активна', () => {
    expect(isItemScheduled(baseline)).toBe(true)
  })

  it('isItemScheduled: без объёма — не активна', () => {
    expect(isItemScheduled({ ...baseline, total: 0 })).toBe(false)
  })

  it('isItemScheduled: один из сроков задан — активна', () => {
    expect(isItemScheduled({ ...baseline, startIso: null })).toBe(true)
    expect(isItemScheduled({ ...baseline, endIso: null })).toBe(true)
  })

  it('isItemDeferred: нет ни объёма, ни сроков — отложена', () => {
    expect(
      isItemDeferred({ ...baseline, total: 0, startIso: null, endIso: null }),
    ).toBe(true)
  })
})

describe('durationDays / formatPeriod', () => {
  it('считает длительность включительно', () => {
    expect(durationDays('2025-05-01', '2025-05-10')).toBe(10)
    expect(durationDays('2025-05-01', '2025-05-01')).toBe(1)
  })

  it('null если нет одной из дат или конец раньше начала', () => {
    expect(durationDays(null, '2025-05-10')).toBeNull()
    expect(durationDays('2025-05-10', null)).toBeNull()
    expect(durationDays('2025-05-10', '2025-05-01')).toBeNull()
  })

  it('formatPeriod: «без срока» когда нет дат', () => {
    expect(formatPeriod(null, null)).toBe('без срока')
  })

  it('formatPeriod: одна дата отображается без диапазона', () => {
    expect(formatPeriod('2025-05-01', null)).toMatch(/01\.05\.25/)
    expect(formatPeriod(null, '2025-05-10')).toMatch(/10\.05\.25/)
  })

  it('formatPeriod: одинаковые даты — одна точка', () => {
    expect(formatPeriod('2025-08-03', '2025-08-03')).toMatch(/03\.08\.25/)
  })
})

describe('summarizeWorkPlan', () => {
  const sample: WorkPlan = {
    siteId: 'demo',
    siteName: 'Demo',
    asOfIso: '2026-05-04T00:00:00.000Z',
    sections: [
      {
        number: '1',
        title: 'A',
        items: [
          { number: '1.1', title: 'X', unit: 'm', total: 100, done: 25, startIso: '2025-01-01', endIso: '2025-02-01' },
          { number: '1.2', title: 'Y', unit: 'm', total: 100, done: 100, startIso: '2025-02-15', endIso: '2025-03-01' },
          { number: '1.3', title: 'Z', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        ],
      },
    ],
  }

  it('считает общее количество и активные', () => {
    const s = summarizeWorkPlan(sample)
    expect(s.itemsCount).toBe(3)
    expect(s.scheduledCount).toBe(2)
    expect(s.deferredCount).toBe(1)
    expect(s.completedCount).toBe(1)
  })

  it('средний процент по активным', () => {
    const s = summarizeWorkPlan(sample)
    // (25 + 100) / 2 = 62.5
    expect(s.averagePercent).toBeCloseTo(62.5, 1)
  })

  it('период — самая ранняя/поздняя дата среди активных', () => {
    const s = summarizeWorkPlan(sample)
    expect(s.earliestStartIso).toBe('2025-01-01')
    expect(s.latestEndIso).toBe('2025-03-01')
  })
})

describe('Брусиловский план: целостность данных', () => {
  it('11 разделов — как в исходной справке', () => {
    expect(BRUSILOVA_WORK_PLAN.sections).toHaveLength(11)
  })

  it('номера разделов и строк уникальны', () => {
    const seen = new Set<string>()
    for (const section of BRUSILOVA_WORK_PLAN.sections) {
      for (const item of section.items) {
        expect(seen.has(item.number), `дубль ${item.number}`).toBe(false)
        seen.add(item.number)
      }
    }
    expect(seen.size).toBeGreaterThan(40)
  })

  it('у активных позиций даты в правильном порядке (start ≤ end)', () => {
    for (const section of BRUSILOVA_WORK_PLAN.sections) {
      for (const item of section.items) {
        if (item.startIso && item.endIso) {
          expect(
            new Date(item.startIso).getTime() <= new Date(item.endIso).getTime(),
            `${item.number}: ${item.startIso} > ${item.endIso}`,
          ).toBe(true)
        }
      }
    }
  })

  it('сводка: ровно один раздел с «без срока»+0 объёмов в МАФ?', () => {
    const summary = summarizeWorkPlanSection(BRUSILOVA_WORK_PLAN.sections[5]!) // МАФ
    // Скамейки + Урны активные, Игровые комплексы и Велопарковки — отложенные
    expect(summary.itemsCount).toBe(4)
    expect(summary.scheduledCount).toBe(2)
    expect(summary.deferredCount).toBe(2)
  })

  it('конкретная строка: 1.1 Бетон — план 15 461 м, без факта', () => {
    const beton = BRUSILOVA_WORK_PLAN.sections[0]!.items[0]!
    expect(beton.number).toBe('1.1')
    expect(beton.title).toBe('Бетон')
    expect(beton.unit).toBe('m')
    expect(beton.total).toBe(15461)
    expect(beton.done).toBe(0)
    expect(beton.startIso).toBe('2025-05-01')
    expect(beton.endIso).toBe('2025-07-03')
  })

  it('конкретная строка: 9.2 Прокладка кабеля — 17 045 м', () => {
    const electrical = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '9')
    const cable = electrical?.items.find((i) => i.number === '9.2')
    expect(cable?.title).toMatch(/Прокладка/i)
    expect(cable?.total).toBe(17045)
  })
})
