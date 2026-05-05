import type { WorkPlan } from '../../domain/workPlan'
import { BRUSILOVA_WORK_PLAN } from './brusilova'
import { KIRPICHNOGO_ZAVODA_WORK_PLAN } from './kirpichnogo-zavoda'
import { KREKSHINO_RYABINOVAYA_WORK_PLAN } from './krekshino-ryabinovaya'
import { SCHERBINKA_VOKZALNAYA_WORK_PLAN } from './scherbinka-vokzalnaya'

/**
 * Карта производственных планов по siteId. Если для объекта плана нет —
 * возвращаем null, страница объекта в этом случае не показывает секцию.
 *
 * Когда офис пришлёт справку по новому объекту — добавьте файл в
 * data/workPlans/<slug>.ts по образу brusilova.ts и подключите его
 * сюда.
 */
const WORK_PLANS_BY_SITE: Readonly<Record<string, WorkPlan>> = {
  brusilova: BRUSILOVA_WORK_PLAN,
  'kirpichnogo-zavoda': KIRPICHNOGO_ZAVODA_WORK_PLAN,
  'krekshino-ryabinovaya': KREKSHINO_RYABINOVAYA_WORK_PLAN,
  'scherbinka-vokzalnaya': SCHERBINKA_VOKZALNAYA_WORK_PLAN,
}

export function getWorkPlanForSite(siteId: string): WorkPlan | null {
  return WORK_PLANS_BY_SITE[siteId] ?? null
}
