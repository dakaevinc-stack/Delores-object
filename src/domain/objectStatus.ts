import type { ConstructionSite, SiteStatus } from '../types/constructionSite'

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  normal: 'Нормально',
  attention: 'Внимание',
  critical: 'Критично',
}

export const SITE_STATUS_TOKEN: Record<
  SiteStatus,
  'success' | 'warning' | 'danger'
> = {
  normal: 'success',
  attention: 'warning',
  critical: 'danger',
}

/**
 * Единая точка входа для статуса на дашборде.
 * Сейчас: поле `status` в mock задаётся вручную.
 * Позже: агрегировать этапы, отклонения план/факт, сроки и риски из `ConstructionSite`
 * (в т.ч. `executive` и расширяемые `SiteHealthInputs`) в правило worst-of / пороговую модель.
 */
export function resolveSiteStatus(site: ConstructionSite): SiteStatus {
  return site.status
}
