import { describe, expect, it } from 'vitest'
import { MOCK_CONSTRUCTION_SITES } from '../constructionSites.mock'
import {
  contractorsFromBudget,
  summarizeMaterialBudget,
  viewBudgetForContractor,
} from '../../domain/materialBudget'
import { EXCEL_MATERIAL_BUDGETS, EXCEL_MATERIAL_BUDGETS_BY_SITE } from './fromExcel'
import { getMaterialBudgetForSite } from './index'

const EXPECTED = [
  {
    id: 'olympiyskaya-derevnya',
    name: 'Олимпийская деревня',
    crews: ['ДР', 'Шираз', 'Сасун', 'Араик Армен'],
  },
  {
    id: 'anokhina',
    name: 'Анохина',
    crews: [
      'ДР',
      'Микаэл',
      'Бату',
      'Рустам Женя',
      'Агван',
      'МСК-ХОРТ',
      'Эдик Гуликян',
      'Вануш',
      'Вартан',
      'Армен Арамян',
      'Зоро',
      'Денис',
    ],
  },
  { id: 'brusilova', name: 'Брусилова', crews: ['ДР', 'Агван', 'Зоро', 'Денис', 'Бату'] },
  { id: 'mcd2-butovo', name: 'Бутово', crews: ['ДР', 'Вартан', 'Вануш'] },
  { id: 'koshtoyantsa', name: 'Коштоянца', crews: ['ДР', 'МСК-ХОРТ', 'Сасун'] },
] as const

const DROPPED = [
  'balaklavsky',
  'jainokskaya',
  'kirpichnogo-zavoda',
  'krekshino-ryabinovaya',
  'scherbinka-vokzalnaya',
  'proezd-28b',
] as const

describe('ведомости расхода из Excel', () => {
  it('только пять живых объектов', () => {
    expect(EXCEL_MATERIAL_BUDGETS.map((b) => b.siteId).sort()).toEqual(
      EXPECTED.map((s) => s.id).slice().sort(),
    )
    expect(MOCK_CONSTRUCTION_SITES.map((s) => s.id).sort()).toEqual(
      EXPECTED.map((s) => s.id).slice().sort(),
    )
    for (const id of DROPPED) {
      expect(MOCK_CONSTRUCTION_SITES.some((s) => s.id === id), id).toBe(false)
      expect(getMaterialBudgetForSite(id)).toBeNull()
    }
  })

  it('план не выдумываем, факт есть', () => {
    for (const spec of EXPECTED) {
      const site = MOCK_CONSTRUCTION_SITES.find((s) => s.id === spec.id)
      expect(site?.name, spec.id).toBe(spec.name)
      const budget = getMaterialBudgetForSite(spec.id)
      expect(budget, spec.id).not.toBeNull()
      expect(budget?.articles.every((a) => a.planned == null), spec.id).toBe(true)
      expect(budget?.articles.some((a) => (a.imported ?? []).some((r) => r.qty > 0)), spec.id).toBe(
        true,
      )
    }
  })

  it('субподрядчики не сливаются и не теряются', () => {
    for (const spec of EXPECTED) {
      const budget = EXCEL_MATERIAL_BUDGETS_BY_SITE[spec.id]
      expect(budget, spec.id).toBeTruthy()
      const names = contractorsFromBudget(budget).map((c) => c.contractorName)
      expect([...names].sort(), spec.id).toEqual([...spec.crews].slice().sort())
    }
  })

  it('один субчик на двух объектах — два разных учёта', () => {
    const olympic = getMaterialBudgetForSite('olympiyskaya-derevnya')!
    const brusilova = getMaterialBudgetForSite('brusilova')!
    const koshto = getMaterialBudgetForSite('koshtoyantsa')!
    const anokhina = getMaterialBudgetForSite('anokhina')!

    const olympicDr = contractorsFromBudget(olympic).find((c) => c.contractorName === 'ДР')!
    const brusilovaDr = contractorsFromBudget(brusilova).find((c) => c.contractorName === 'ДР')!
    expect(olympicDr.qty).not.toBe(brusilovaDr.qty)
    expect(olympicDr.qty).toBeGreaterThan(0)
    expect(brusilovaDr.qty).toBeGreaterThan(0)

    const olympicSasun = contractorsFromBudget(olympic).find((c) => c.contractorName === 'Сасун')!
    const koshtoSasun = contractorsFromBudget(koshto).find((c) => c.contractorName === 'Сасун')!
    expect(olympicSasun.qty).toBe(1845)
    expect(koshtoSasun.qty).toBe(20)

    const anokhinaAgvan = contractorsFromBudget(anokhina).find((c) => c.contractorName === 'Агван')!
    const brusilovaAgvan = contractorsFromBudget(brusilova).find((c) => c.contractorName === 'Агван')!
    expect(anokhinaAgvan.qty).not.toBe(brusilovaAgvan.qty)
  })

  it('фильтр бригады оставляет только её расход на этом объекте', () => {
    const olympic = getMaterialBudgetForSite('olympiyskaya-derevnya')!
    const shiraz = contractorsFromBudget(olympic).find((c) => c.contractorName === 'Шираз')!
    const scoped = viewBudgetForContractor(olympic, shiraz.contractorId)
    const facts = summarizeMaterialBudget(scoped, []).facts
    expect(facts.every((f) => (f.article.imported ?? []).every((r) => r.contractorId === shiraz.contractorId))).toBe(
      true,
    )
    const used = facts.reduce((n, f) => n + f.consumed, 0)
    expect(Math.round(used * 10) / 10).toBe(shiraz.qty)
    expect(used).toBeLessThan(
      contractorsFromBudget(olympic).reduce((n, c) => n + c.qty, 0),
    )
  })
})
