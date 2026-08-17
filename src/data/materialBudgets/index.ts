import type { MaterialBudget } from '../../domain/materialBudget'
import { BRUSILOVA_MATERIAL_BUDGET } from './brusilova'

const BUDGETS_BY_SITE: Readonly<Record<string, MaterialBudget>> = {
  brusilova: BRUSILOVA_MATERIAL_BUDGET,
}

export function getMaterialBudgetForSite(siteId: string): MaterialBudget | null {
  return BUDGETS_BY_SITE[siteId] ?? null
}
