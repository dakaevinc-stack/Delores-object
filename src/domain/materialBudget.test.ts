import { describe, expect, it } from 'vitest'
import { getMaterialBudgetForSite } from '../data/materialBudgets'
import { findProcurementPreset } from './procurementCatalog'
import type { ProcurementRequest } from './procurementRequest'
import {
  articleStatus,
  consumedQtyByArticleId,
  contractorsFromBudget,
  summarizeMaterialBudget,
  viewBudgetForContractor,
  type MaterialBudget,
} from './materialBudget'

const budget: MaterialBudget = {
  siteId: 'brusilova',
  siteName: 'Брусилова',
  asOfIso: '2026-08-17T00:00:00.000Z',
  articles: [
    {
      id: 'a-stone',
      presetId: 'crushed-granite-20-40',
      title: 'Щебень гранитный 20–40',
      group: 'Щебень',
      unit: 'm3',
      planned: 3000,
    },
    {
      id: 'a-sand',
      presetId: 'sand-quarry',
      title: 'Песок карьерный',
      group: 'Песок',
      unit: 'm3',
      planned: 2000,
    },
  ],
}

function request(
  patch: Partial<ProcurementRequest> & Pick<ProcurementRequest, 'id' | 'status' | 'items'>,
): ProcurementRequest {
  return {
    shortCode: 'A-1',
    siteId: 'brusilova',
    siteName: 'Брусилова',
    createdAtIso: '2026-08-17T10:00:00.000Z',
    createdBy: 'Минасян',
    note: '',
    urgent: false,
    neededByIso: null,
    receipt: null,
    unloadPoint: null,
    ...patch,
  }
}

describe('расход материалов', () => {
  it('принятая заявка на 100 м³ щебня вычитает из 3000', () => {
    const requests = [
      request({
        id: 'r1',
        status: 'accepted',
        items: [
          {
            presetId: 'crushed-granite-20-40',
            title: 'Щебень гранитный 20–40',
            unitId: 'm3',
            quantity: 100,
          },
        ],
      }),
    ]
    const used = consumedQtyByArticleId(budget, requests)
    expect(used.get('a-stone')).toBe(100)
    const summary = summarizeMaterialBudget(budget, requests)
    const stone = summary.facts.find((f) => f.article.id === 'a-stone')!
    expect(stone.consumed).toBe(100)
    expect(stone.remaining).toBe(2900)
    expect(stone.status).toBe('ok')
  })

  it('отказ от груза на объекте не списывает объём', () => {
    const requests = [
      request({
        id: 'r1',
        status: 'refused',
        receipt: {
          decision: 'refused',
          atIso: '2026-08-17T15:48:00.000Z',
          reason: 'Плохое качество',
          media: [{ id: 'm1', kind: 'photo', name: 'a.jpg', previewUrl: 'data:,' }],
        },
        items: [
          {
            presetId: 'crushed-granite-20-40',
            title: 'Щебень гранитный 20–40',
            unitId: 'm3',
            quantity: 100,
          },
        ],
      }),
    ]
    expect(consumedQtyByArticleId(budget, requests).get('a-stone')).toBeUndefined()
  })

  it('заявка в обработке не списывает объём', () => {
    const requests = [
      request({
        id: 'r1',
        status: 'pending',
        items: [
          {
            presetId: 'crushed-granite-20-40',
            title: 'Щебень гранитный 20–40',
            unitId: 'm3',
            quantity: 100,
          },
        ],
      }),
    ]
    expect(consumedQtyByArticleId(budget, requests).get('a-stone')).toBeUndefined()
  })

  it('перерасход — остаток отрицательный и статус over', () => {
    const requests = [
      request({
        id: 'r1',
        status: 'accepted',
        items: [
          {
            presetId: 'sand-quarry',
            title: 'Песок карьерный',
            unitId: 'm3',
            quantity: 2500,
          },
        ],
      }),
    ]
    const sand = summarizeMaterialBudget(budget, requests).facts.find(
      (f) => f.article.id === 'a-sand',
    )!
    expect(sand.remaining).toBe(-500)
    expect(sand.status).toBe('over')
  })

  it('чужой объект не списывает', () => {
    const requests = [
      request({
        id: 'r1',
        siteId: 'other',
        status: 'accepted',
        items: [
          {
            presetId: 'sand-quarry',
            title: 'Песок карьерный',
            unitId: 'm3',
            quantity: 10,
          },
        ],
      }),
    ]
    expect(consumedQtyByArticleId(budget, requests).size).toBe(0)
  })

  it('articleStatus: low когда осталось ≤ 10%', () => {
    expect(articleStatus(2700, 3000)).toBe('low')
    expect(articleStatus(2000, 3000)).toBe('ok')
    expect(articleStatus(3100, 3000)).toBe('over')
    expect(articleStatus(100, null)).toBe('ok')
  })

  it('статьи Брусиловой из ведомости с preset совпадают с каталогом', () => {
    const budget = getMaterialBudgetForSite('brusilova')
    expect(budget).not.toBeNull()
    if (!budget) return
    expect(budget.articles.length).toBeGreaterThan(0)
    for (const article of budget.articles) {
      if (!article.presetId) continue
      const preset = findProcurementPreset(article.presetId)
      expect(preset?.id, article.title).toBe(article.presetId)
    }
  })

  it('факт из ведомости списывается даже без заявок', () => {
    const withImport: MaterialBudget = {
      ...budget,
      articles: [
        {
          ...budget.articles[0]!,
          planned: null,
          imported: [{ contractorId: 'dr', contractorName: 'ДР', qty: 40 }],
        },
        budget.articles[1]!,
      ],
    }
    const used = consumedQtyByArticleId(withImport, [])
    expect(used.get('a-stone')).toBe(40)
    const stone = summarizeMaterialBudget(withImport, []).facts[0]!
    expect(stone.remaining).toBeNull()
    expect(stone.status).toBe('ok')
    expect(contractorsFromBudget(withImport)).toEqual([
      { contractorId: 'dr', contractorName: 'ДР', qty: 40 },
    ])
  })

  it('фильтр бригады не трогает чужой объект', () => {
    const twoCrews: MaterialBudget = {
      ...budget,
      articles: [
        {
          ...budget.articles[0]!,
          planned: null,
          imported: [
            { contractorId: 'dr', contractorName: 'ДР', qty: 40 },
            { contractorId: 'shiraz', contractorName: 'Шираз', qty: 12 },
          ],
        },
      ],
    }
    const onlyShiraz = viewBudgetForContractor(twoCrews, 'shiraz')
    expect(onlyShiraz.siteId).toBe('brusilova')
    expect(summarizeMaterialBudget(onlyShiraz, []).facts[0]?.consumed).toBe(12)
    expect(viewBudgetForContractor(twoCrews, null).articles[0]?.imported).toHaveLength(2)
  })
})
