import { describe, expect, it } from 'vitest'
import { BRUSILOVA_MATERIAL_BUDGET } from '../data/materialBudgets/brusilova'
import { findProcurementPreset } from './procurementCatalog'
import type { ProcurementRequest } from './procurementRequest'
import {
  articleStatus,
  consumedQtyByArticleId,
  summarizeMaterialBudget,
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
  })

  it('статьи сметы Брусилово есть в каталоге заявок', () => {
    for (const article of BRUSILOVA_MATERIAL_BUDGET.articles) {
      expect(findProcurementPreset(article.presetId)?.id).toBe(article.presetId)
    }
  })
})
