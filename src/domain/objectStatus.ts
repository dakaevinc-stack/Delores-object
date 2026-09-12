import type { ConstructionSite, SiteStatus } from '../types/constructionSite'
import { daysUntil } from './fleet'

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

const RANK: Record<SiteStatus, number> = { normal: 0, attention: 1, critical: 2 }

function worse(a: SiteStatus, b: SiteStatus): SiteStatus {
  return RANK[a] >= RANK[b] ? a : b
}

/**
 * Статус карточки: худшее из записанного и того, что видно по сроку и факту.
 * Просроченный объект с незакрытыми работами не может быть «нормально».
 */
export function resolveSiteStatus(site: ConstructionSite, from = new Date()): SiteStatus {
  if (site.lifecycle === 'closed') return 'normal'
  let status = site.status
  const fact = site.executive.factPercent
  const plan = site.executive.planPercent
  const complete = Number.isFinite(fact) && fact >= 99.5

  if (site.endDateIso) {
    const days = daysUntil(site.endDateIso, from)
    if (Number.isFinite(days) && days < 0 && !complete) {
      status = worse(status, days <= -14 ? 'critical' : 'attention')
    }
  }

  if (site.executive.hasOpenRisks) {
    status = worse(status, 'attention')
  }

  const gap = plan - fact
  if (Number.isFinite(gap)) {
    if (gap >= 12) status = worse(status, 'critical')
    else if (gap >= 5) status = worse(status, 'attention')
  }

  return status
}
