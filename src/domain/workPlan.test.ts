import { describe, expect, it } from 'vitest'
import {
  applyWorkEntriesToPlan,
  computePlanFactFromReports,
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
import type { BrigadierStoredReport } from './brigadierReport'
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
  it('7 разделов — включая наружное освещение и дождевую канализацию', () => {
    expect(BRUSILOVA_WORK_PLAN.sections).toHaveLength(7)
  })

  it('номера разделов и строк уникальны и идут подряд', () => {
    const seen = new Set<string>()
    expect(BRUSILOVA_WORK_PLAN.sections.map((s) => s.number)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ])
    for (const section of BRUSILOVA_WORK_PLAN.sections) {
      for (const item of section.items) {
        expect(seen.has(item.number), `дубль ${item.number}`).toBe(false)
        seen.add(item.number)
        expect(item.number.startsWith(`${section.number}.`)).toBe(true)
      }
    }
    expect(seen.size).toBe(58)
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

  it('группа «Газоны»: разборка, растительный грунт и посев', () => {
    const lawn = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '4')!
    expect(lawn.title).toBe('Газоны')
    const summary = summarizeWorkPlanSection(lawn)
    expect(summary.itemsCount).toBe(8)
    expect(summary.scheduledCount).toBe(2)
    expect(lawn.items.find((i) => i.number === '4.7')!.title).toBe(
      'Подготовка растительного грунта',
    )
    expect(lawn.items.find((i) => i.number === '4.8')!.title).toBe('Посев трав')
    expect(lawn.items.find((i) => i.number === '4.8')!.total).toBe(36828)
  })

  it('группа «Проезжая часть»: фрезерование, разборка, основания и покрытие', () => {
    const road = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '3')!
    expect(road.title).toBe('Проезжая часть')
    expect(road.items).toHaveLength(12)
    expect(road.items[0]!.title).toBe('Фрезерование')
    expect(road.items[0]!.total).toBe(43774)
    expect(road.items.find((i) => i.number === '3.7')!.title).toBe('Укладка геотекстиля')
    expect(road.items.at(-1)!.title).toBe(
      'Устройство верхнего слоя покрытия из асфальтобетона',
    )
  })

  it('группа «Тротуар»: разборка, основания и покрытие', () => {
    const walk = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '2')!
    expect(walk.title).toBe('Тротуар')
    expect(walk.items).toHaveLength(13)
    expect(walk.items[0]!.title).toBe('Разборка асфальтобетонного покрытия')
    expect(walk.items.find((i) => i.number === '2.6')!.title).toBe(
      'Разработка грунта под основание',
    )
    expect(walk.items.find((i) => i.number === '2.8')!.total).toBe(28641)
    expect(walk.items.at(-1)!.title).toBe('Укладка плитки')
  })

  it('группа «Борт»: пять подгрупп, монтаж и демонтаж с объёмом', () => {
    const curb = BRUSILOVA_WORK_PLAN.sections[0]!
    expect(curb.title).toBe('Борт')
    expect(curb.items.map((i) => i.number)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5'])
    expect(curb.items.map((i) => i.title)).toEqual([
      'Песчаное основание',
      'Щебёночное основание',
      'Монтаж бортового камня',
      'Демонтаж бортового камня',
      'Разработка грунта под бортовой камень',
    ])
    const install = curb.items.find((i) => i.number === '1.3')!
    expect(install.unit).toBe('m')
    expect(install.total).toBe(20115)
    expect(install.done).toBe(0)
    const dismantle = curb.items.find((i) => i.number === '1.4')!
    expect(dismantle.total).toBe(15461)
  })

  it('группа «Наружное освещение»: опоры, фундаменты, светильники', () => {
    const lighting = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '6')!
    expect(lighting.title).toBe('Наружное освещение')
    expect(lighting.items.map((i) => i.title)).toEqual([
      'Демонтаж опор освещения',
      'Демонтаж светильников',
      'Устройство фундаментов под опоры',
      'Установка опор освещения',
      'Установка светильников',
      'Подключение светильников',
    ])
  })

  it('группа «Электрические сети»: трубы 63/110, колодцы, кабель', () => {
    const electric = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '5')!
    expect(electric.title).toBe('Электрические сети')
    expect(electric.items).toHaveLength(8)
    expect(electric.items.find((i) => i.number === '5.4')!.title).toBe(
      'Укладка трубы ПНД Ø63',
    )
    expect(electric.items.find((i) => i.number === '5.5')!.title).toBe(
      'Укладка трубы ПНД Ø110',
    )
    expect(electric.items.find((i) => i.number === '5.5')!.total).toBe(8734)
    expect(electric.items.find((i) => i.number === '5.7')!.title).toBe('Прокладка кабеля')
    expect(electric.items.find((i) => i.number === '5.7')!.total).toBe(17045)
  })

  it('группа «Дождевая канализация»: трубы, дождеприёмники, колодцы', () => {
    const storm = BRUSILOVA_WORK_PLAN.sections.find((s) => s.number === '7')!
    expect(storm.title).toBe('Дождевая канализация')
    expect(storm.items).toHaveLength(6)
    expect(storm.items[0]!.title).toBe('Разработка траншеи')
    expect(storm.items.find((i) => i.number === '7.4')!.title).toBe(
      'Установка дождеприёмников',
    )
  })
})

describe('applyWorkEntriesToPlan / computePlanFactFromReports', () => {
  const plan: WorkPlan = {
    siteId: 'site-x',
    siteName: 'X',
    asOfIso: '2026-05-01T00:00:00.000Z',
    sections: [
      {
        number: '1',
        title: 'Бортовой камень',
        items: [
          {
            number: '1.1',
            title: 'Бетон',
            unit: 'm',
            total: 100,
            done: 10,
            startIso: '2026-05-01',
            endIso: '2026-06-01',
          },
          {
            number: '1.2',
            title: 'Гранит',
            unit: 'm',
            total: 50,
            done: 0,
            startIso: '2026-05-15',
            endIso: '2026-06-15',
          },
        ],
      },
    ],
  }

  function makeReport(
    overrides: Partial<BrigadierStoredReport> & {
      siteId?: string
      reportedAtIso?: string
      workEntries?: BrigadierStoredReport['workEntries']
    },
  ): BrigadierStoredReport {
    return {
      id: overrides.id ?? `r-${Math.random()}`,
      siteId: overrides.siteId ?? 'site-x',
      reportedAtIso: overrides.reportedAtIso ?? '2026-05-04T10:00:00.000Z',
      lines: overrides.lines ?? [],
      problems: overrides.problems ?? [],
      responsible: overrides.responsible ?? '—',
      comment: overrides.comment ?? '',
      attachments: overrides.attachments ?? [],
      workEntries: overrides.workEntries,
    }
  }

  it('старые отчёты без workEntries не падают и план остаётся прежним', () => {
    const reports = [makeReport({})]
    const merged = applyWorkEntriesToPlan(plan, reports)
    expect(merged).toBe(plan)
  })

  it('пустой массив отчётов возвращает исходный план', () => {
    expect(applyWorkEntriesToPlan(plan, [])).toBe(plan)
  })

  it('суммирует qty по нескольким отчётам в одну строку плана', () => {
    const reports = [
      makeReport({
        id: 'r1',
        reportedAtIso: '2026-05-04T08:00:00.000Z',
        workEntries: [
          { id: 'a', planNumber: '1.1', planTitle: 'Бетон', qty: 15, unit: 'm' },
        ],
      }),
      makeReport({
        id: 'r2',
        reportedAtIso: '2026-05-05T08:00:00.000Z',
        workEntries: [
          { id: 'b', planNumber: '1.1', planTitle: 'Бетон', qty: 25, unit: 'm' },
        ],
      }),
    ]
    const merged = applyWorkEntriesToPlan(plan, reports)
    const item = merged.sections[0]!.items[0]!
    expect(item.done).toBe(10 + 15 + 25)
    expect(item.total).toBe(100)
  })

  it('игнорирует отчёты с другого объекта', () => {
    const reports = [
      makeReport({
        siteId: 'other-site',
        workEntries: [
          { id: 'x', planNumber: '1.1', planTitle: 'Бетон', qty: 999, unit: 'm' },
        ],
      }),
    ]
    const merged = applyWorkEntriesToPlan(plan, reports)
    expect(merged.sections[0]!.items[0]!.done).toBe(10)
  })

  it('игнорирует ссылки на несуществующие строки плана', () => {
    const reports = [
      makeReport({
        workEntries: [
          { id: 'x', planNumber: '99.99', planTitle: 'Призрак', qty: 5, unit: 'm' },
        ],
      }),
    ]
    const merged = applyWorkEntriesToPlan(plan, reports)
    expect(merged.sections[0]!.items[0]!.done).toBe(10)
    expect(merged.sections[0]!.items[1]!.done).toBe(0)
  })

  it('computePlanFactFromReports: учитывает дату последнего отчёта', () => {
    const reports = [
      makeReport({
        id: 'r1',
        reportedAtIso: '2026-05-04T08:00:00.000Z',
        workEntries: [
          { id: 'a', planNumber: '1.1', planTitle: 'Бетон', qty: 5, unit: 'm' },
        ],
      }),
      makeReport({
        id: 'r2',
        reportedAtIso: '2026-05-06T15:00:00.000Z',
        workEntries: [
          { id: 'b', planNumber: '1.1', planTitle: 'Бетон', qty: 7, unit: 'm' },
        ],
      }),
      makeReport({
        id: 'r3',
        reportedAtIso: '2026-05-05T15:00:00.000Z',
        workEntries: [
          { id: 'c', planNumber: '1.1', planTitle: 'Бетон', qty: 3, unit: 'm' },
        ],
      }),
    ]
    const acc = computePlanFactFromReports(plan, reports)
    const fact = acc.get('1.1')
    expect(fact?.qtyAdded).toBe(5 + 7 + 3)
    expect(fact?.entriesCount).toBe(3)
    expect(fact?.lastReportedAtIso).toBe('2026-05-06T15:00:00.000Z')
  })

  it('summarize ВместеСФактом: средний % растёт после привязок', () => {
    const reports = [
      makeReport({
        workEntries: [
          { id: 'a', planNumber: '1.1', planTitle: 'Бетон', qty: 90, unit: 'm' },
          { id: 'b', planNumber: '1.2', planTitle: 'Гранит', qty: 50, unit: 'm' },
        ],
      }),
    ]
    const merged = applyWorkEntriesToPlan(plan, reports)
    const summary = summarizeWorkPlan(merged)
    expect(summary.completedCount).toBe(2)
    expect(summary.averagePercent).toBe(100)
  })
})
