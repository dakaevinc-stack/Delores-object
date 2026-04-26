import type { ConstructionSite, SiteStatus, WorkStageSnapshot } from '../types/constructionSite'
import { resolveSiteStatus } from './objectStatus'

export type StatusCounts = Record<SiteStatus, number> & { all: number }

export function countSitesByStatus(
  sites: readonly ConstructionSite[],
): StatusCounts {
  const base: StatusCounts = {
    all: sites.length,
    normal: 0,
    attention: 0,
    critical: 0,
  }
  for (const s of sites) {
    base[resolveSiteStatus(s)] += 1
  }
  return base
}

/** Отклонение плана от факта по объекту, п.п. (плюс = факт отстаёт от плана). */
export function planFactGapPoints(site: ConstructionSite): number {
  return site.executive.planPercent - site.executive.factPercent
}

export function isBehindPlan(
  site: ConstructionSite,
  thresholdPoints = 2,
): boolean {
  return planFactGapPoints(site) >= thresholdPoints
}

export type LaggingSiteRow = {
  site: ConstructionSite
  gapPoints: number
}

/** Объекты с отставанием факта от плана — приоритет внимания руководителя. */
export function selectLaggingSites(
  sites: readonly ConstructionSite[],
  thresholdPoints = 2,
): LaggingSiteRow[] {
  return sites
    .map((site) => ({ site, gapPoints: planFactGapPoints(site) }))
    .filter(({ gapPoints }) => gapPoints >= thresholdPoints)
    .sort((a, b) => b.gapPoints - a.gapPoints)
}

export type ProblemStageRow = {
  siteId: string
  siteName: string
  stage: WorkStageSnapshot
  gapPoints: number
}

/**
 * Этапы, где факт заметно ниже плана — «проблемные зоны» на дашборде.
 */
export function selectProblemStages(
  sites: readonly ConstructionSite[],
  opts?: { minGapPoints?: number; limit?: number },
): ProblemStageRow[] {
  const minGap = opts?.minGapPoints ?? 5
  const limit = opts?.limit ?? 8
  const rows: ProblemStageRow[] = []
  for (const site of sites) {
    for (const stage of site.executive.stages) {
      const gap = stage.planPercent - stage.factPercent
      if (gap >= minGap) {
        rows.push({ siteId: site.id, siteName: site.name, stage, gapPoints: gap })
      }
    }
  }
  return rows.sort((a, b) => b.gapPoints - a.gapPoints).slice(0, limit)
}

/** Процент выполнения для карточки и графиков — сейчас = факт по объекту. */
export function completionPercent(site: ConstructionSite): number {
  return site.executive.factPercent
}
