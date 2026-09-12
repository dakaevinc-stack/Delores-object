import type { MaterialBudget } from '../../domain/materialBudget'
import { ANOKHINA_MATERIAL_BUDGET } from './anokhina'
import { BRUSILOVA_MATERIAL_BUDGET } from './brusilova'
import { OLYMPIYSKAYA_DEREVNYA_MATERIAL_BUDGET } from './olympiyskaya-derevnya'

const BUDGETS_BY_SITE: Readonly<Record<string, MaterialBudget>> = {
  anokhina: ANOKHINA_MATERIAL_BUDGET,
  brusilova: BRUSILOVA_MATERIAL_BUDGET,
  'olympiyskaya-derevnya': OLYMPIYSKAYA_DEREVNYA_MATERIAL_BUDGET,
}

export function getMaterialBudgetForSite(siteId: string): MaterialBudget | null {
  return BUDGETS_BY_SITE[siteId] ?? null
}
