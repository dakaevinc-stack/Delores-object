import { findProcurementPreset } from './procurementCatalog'
import type { MeasurementUnitId } from './brigadierReport'
import type { ProcurementLine, ProcurementRequest } from './procurementRequest'

/**
 * Смета расхода материалов по объекту.
 *
 * Инженер (или подрядчик) заранее считает, сколько песка, щебня, бетона
 * и прочего нужно на объект. Каждая принятая заявка списывает объём
 * из этой сметы: было 3000 м³, приняли 100 — осталось 2900.
 * Остаток < 0 — ушли в минус (перерасход).
 */

export type MaterialBudgetArticle = {
  readonly id: string
  /** Связь с каталогом заявок — по этому id списываем строки. */
  readonly presetId: string
  readonly title: string
  readonly group: string
  readonly unit: MeasurementUnitId
  /** Сколько заложено в смету (инженерный расчёт). */
  readonly planned: number
}

export type MaterialBudget = {
  readonly siteId: string
  readonly siteName: string
  readonly asOfIso: string
  readonly articles: readonly MaterialBudgetArticle[]
}

export type MaterialArticleStatus = 'ok' | 'low' | 'over'

export type MaterialArticleFact = {
  readonly article: MaterialBudgetArticle
  readonly consumed: number
  readonly remaining: number
  readonly percent: number
  readonly status: MaterialArticleStatus
}

export type UnplannedMaterialSpend = {
  readonly title: string
  readonly unit: MeasurementUnitId
  readonly qty: number
  readonly presetId: string | null
}

export type MaterialBudgetSummary = {
  readonly facts: readonly MaterialArticleFact[]
  readonly unplanned: readonly UnplannedMaterialSpend[]
  readonly overCount: number
  readonly lowCount: number
  readonly okCount: number
}

function normalizeTitle(s: string): string {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvedPresetId(line: ProcurementLine): string | null {
  return findProcurementPreset(line.presetId)?.id ?? line.presetId
}

function findArticleForLine(
  articles: readonly MaterialBudgetArticle[],
  line: ProcurementLine,
): MaterialBudgetArticle | null {
  const presetId = resolvedPresetId(line)
  if (presetId) {
    const byPreset = articles.find((a) => a.presetId === presetId)
    if (byPreset) return byPreset
  }
  const title = normalizeTitle(line.title)
  if (!title) return null
  return articles.find((a) => normalizeTitle(a.title) === title) ?? null
}

export function consumedQtyByArticleId(
  budget: MaterialBudget,
  requests: readonly ProcurementRequest[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const req of requests) {
    if (req.siteId !== budget.siteId) continue
    if (req.status !== 'accepted') continue
    for (const line of req.items) {
      const article = findArticleForLine(budget.articles, line)
      if (!article) continue
      const qty = Number.isFinite(line.quantity) ? line.quantity : 0
      map.set(article.id, (map.get(article.id) ?? 0) + qty)
    }
  }
  return map
}

export function unplannedSpendFromRequests(
  budget: MaterialBudget,
  requests: readonly ProcurementRequest[],
): UnplannedMaterialSpend[] {
  const acc = new Map<string, UnplannedMaterialSpend>()
  for (const req of requests) {
    if (req.siteId !== budget.siteId) continue
    if (req.status !== 'accepted') continue
    for (const line of req.items) {
      if (findArticleForLine(budget.articles, line)) continue
      const qty = Number.isFinite(line.quantity) ? line.quantity : 0
      if (!(qty > 0)) continue
      const key = `${resolvedPresetId(line) ?? ''}::${normalizeTitle(line.title)}::${line.unitId}`
      const prev = acc.get(key)
      if (prev) {
        acc.set(key, { ...prev, qty: prev.qty + qty })
      } else {
        acc.set(key, {
          title: line.title.trim() || 'Материал',
          unit: line.unitId,
          qty,
          presetId: resolvedPresetId(line),
        })
      }
    }
  }
  return [...acc.values()]
}

export function articleStatus(consumed: number, planned: number): MaterialArticleStatus {
  if (planned <= 0) return consumed > 0 ? 'over' : 'ok'
  if (consumed > planned) return 'over'
  const left = planned - consumed
  if (left <= planned * 0.1) return 'low'
  return 'ok'
}

export function summarizeMaterialBudget(
  budget: MaterialBudget,
  requests: readonly ProcurementRequest[],
): MaterialBudgetSummary {
  const consumed = consumedQtyByArticleId(budget, requests)
  const facts: MaterialArticleFact[] = budget.articles.map((article) => {
    const used = consumed.get(article.id) ?? 0
    const remaining = article.planned - used
    const percent =
      article.planned > 0 ? Math.max(0, Math.min(100, (used / article.planned) * 100)) : 0
    return {
      article,
      consumed: used,
      remaining,
      percent: Math.round(percent * 10) / 10,
      status: articleStatus(used, article.planned),
    }
  })
  return {
    facts,
    unplanned: unplannedSpendFromRequests(budget, requests),
    overCount: facts.filter((f) => f.status === 'over').length,
    lowCount: facts.filter((f) => f.status === 'low').length,
    okCount: facts.filter((f) => f.status === 'ok').length,
  }
}

export function groupMaterialFacts(
  facts: readonly MaterialArticleFact[],
): Array<{ group: string; facts: MaterialArticleFact[] }> {
  const order: string[] = []
  const map = new Map<string, MaterialArticleFact[]>()
  for (const fact of facts) {
    const g = fact.article.group
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(fact)
  }
  return order.map((group) => ({ group, facts: map.get(group)! }))
}
