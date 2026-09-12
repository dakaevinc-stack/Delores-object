import type { WorkPlan } from '../../domain/workPlan'
import { ANOKHINA_WORK_PLAN } from './anokhina'
import { BRUSILOVA_WORK_PLAN } from './brusilova'
import { OLYMPIYSKAYA_DEREVNYA_WORK_PLAN } from './olympiyskaya-derevnya'

/**
 * Карта производственных планов по siteId. Если для объекта плана нет —
 * возвращаем null, страница объекта в этом случае не показывает секцию.
 */
const WORK_PLANS_BY_SITE: Readonly<Record<string, WorkPlan>> = {
  anokhina: ANOKHINA_WORK_PLAN,
  brusilova: BRUSILOVA_WORK_PLAN,
  'olympiyskaya-derevnya': OLYMPIYSKAYA_DEREVNYA_WORK_PLAN,
}

export function getWorkPlanForSite(siteId: string): WorkPlan | null {
  return WORK_PLANS_BY_SITE[siteId] ?? null
}
