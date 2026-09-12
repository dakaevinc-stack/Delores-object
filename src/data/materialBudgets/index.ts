import type { MaterialBudget } from '../../domain/materialBudget'
import { EXCEL_MATERIAL_BUDGETS_BY_SITE } from './fromExcel'

export function getMaterialBudgetForSite(siteId: string): MaterialBudget | null {
  return EXCEL_MATERIAL_BUDGETS_BY_SITE[siteId] ?? null
}
