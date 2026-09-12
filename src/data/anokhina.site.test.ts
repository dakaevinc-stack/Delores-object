import { describe, expect, it } from 'vitest'
import { MOCK_CONSTRUCTION_SITES } from './constructionSites.mock'
import { getMaterialBudgetForSite } from './materialBudgets'
import { getWorkPlanForSite } from './workPlans'

describe('anokhina site data', () => {
  it('is in the objects catalog', () => {
    const site = MOCK_CONSTRUCTION_SITES.find((s) => s.id === 'anokhina')
    expect(site?.name).toBe('Анохина')
  })

  it('has work plan and imported material budget', () => {
    expect(getWorkPlanForSite('anokhina')?.siteId).toBe('anokhina')
    expect(getMaterialBudgetForSite('anokhina')?.siteId).toBe('anokhina')
  })
})
