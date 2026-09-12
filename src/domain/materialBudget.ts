import { acceptedQtyForItem } from './cargoReceipt'
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

export type MaterialContractorSpend = {
  readonly contractorId: string
  readonly contractorName: string
  readonly qty: number
}

export type MaterialBudgetArticle = {
  readonly id: string
  /** Связь с каталогом заявок — по этому id списываем строки. */
  readonly presetId: string
  readonly title: string
  readonly group: string
  readonly unit: MeasurementUnitId
  /** План из колонки «объем». Null — в ведомости плана не было, не выдумываем. */
  readonly planned: number | null
  /** Факт из дневной ведомости, по субподрядчикам / бригадам. */
  readonly imported?: readonly MaterialContractorSpend[]
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
  readonly remaining: number | null
  readonly percent: number | null
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

export function importedQtyByArticleId(budget: MaterialBudget): Map<string, number> {
  const map = new Map<string, number>()
  for (const article of budget.articles) {
    const qty = (article.imported ?? []).reduce((sum, row) => sum + row.qty, 0)
    if (qty > 0) map.set(article.id, qty)
  }
  return map
}

export function consumedQtyByArticleId(
  budget: MaterialBudget,
  requests: readonly ProcurementRequest[],
): Map<string, number> {
  const map = importedQtyByArticleId(budget)
  for (const req of requests) {
    if (req.siteId !== budget.siteId) continue
    req.items.forEach((line, index) => {
      const qty = acceptedQtyForItem(req, index)
      if (!(qty > 0)) return
      const article = findArticleForLine(budget.articles, line)
      if (!article) return
      map.set(article.id, (map.get(article.id) ?? 0) + qty)
    })
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
    req.items.forEach((line, index) => {
      if (findArticleForLine(budget.articles, line)) return
      const qty = acceptedQtyForItem(req, index)
      if (!(qty > 0)) return
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
    })
  }
  return [...acc.values()]
}

export function articleStatus(consumed: number, planned: number | null): MaterialArticleStatus {
  if (planned == null || !(planned > 0)) return 'ok'
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
    const planned = article.planned
    const remaining = planned != null ? planned - used : null
    const percent =
      planned != null && planned > 0
        ? Math.round(Math.max(0, Math.min(100, (used / planned) * 100)) * 10) / 10
        : null
    return {
      article,
      consumed: used,
      remaining,
      percent,
      status: articleStatus(used, planned),
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

export function contractorsFromBudget(
  budget: MaterialBudget,
): Array<{ contractorId: string; contractorName: string; qty: number }> {
  const map = new Map<string, { contractorId: string; contractorName: string; qty: number }>()
  for (const article of budget.articles) {
    for (const row of article.imported ?? []) {
      const prev = map.get(row.contractorId)
      if (prev) prev.qty = Math.round((prev.qty + row.qty) * 1000) / 1000
      else {
        map.set(row.contractorId, {
          contractorId: row.contractorId,
          contractorName: row.contractorName,
          qty: row.qty,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.contractorName.localeCompare(b.contractorName, 'ru'))
}

export function budgetHasPlan(budget: MaterialBudget): boolean {
  return budget.articles.some((a) => a.planned != null && a.planned > 0)
}

/** Один объект — один учёт. Фильтр не смешивает бригады с других площадок. */
export function viewBudgetForContractor(
  budget: MaterialBudget,
  contractorId: string | null,
): MaterialBudget {
  if (!contractorId) return budget
  const articles = budget.articles
    .map((article) => ({
      ...article,
      imported: (article.imported ?? []).filter((row) => row.contractorId === contractorId),
    }))
    .filter((article) => (article.imported ?? []).some((row) => row.qty > 0))
  return { ...budget, articles }
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
