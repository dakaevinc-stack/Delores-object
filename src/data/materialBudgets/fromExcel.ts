import type { MeasurementUnitId } from '../../domain/brigadierReport'
import type { MaterialBudget, MaterialBudgetArticle } from '../../domain/materialBudget'
import raw from './fromExcel.json' with { type: 'json' }

const UNITS = new Set<MeasurementUnitId>([
  'lm',
  'm',
  'm2',
  'm3',
  't',
  'kg',
  'pcs',
  'truckload',
  'person',
  'machine_h',
  'shift',
])

function asUnit(value: string): MeasurementUnitId {
  return UNITS.has(value as MeasurementUnitId) ? (value as MeasurementUnitId) : 'm3'
}

function displayCrew(name: string): string {
  if (name === 'ДР' || name === 'МСК-ХОРТ') return name
  return name
    .split(/\s+/)
    .map((part) => {
      if (part === 'ДР' || part === 'МСК-ХОРТ') return part
      const lower = part.toLocaleLowerCase('ru-RU')
      return lower.charAt(0).toLocaleUpperCase('ru-RU') + lower.slice(1)
    })
    .join(' ')
}

function slug(title: string, unit: string): string {
  return `${title} ${unit}`
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

type RawArticle = {
  presetId: string | null
  title: string
  group: string
  unit: string
  planned: number | null
  imported: readonly { contractorId: string; contractorName: string; qty: number }[]
}

type RawSite = {
  siteId: string
  siteName: string
  asOfIso: string
  articles: readonly RawArticle[]
}

function toBudget(site: RawSite): MaterialBudget {
  const articles: MaterialBudgetArticle[] = site.articles.map((row) => ({
    id: slug(row.title, row.unit),
    presetId: row.presetId ?? '',
    title: row.title,
    group: row.group,
    unit: asUnit(row.unit),
    planned: row.planned,
    imported: row.imported.map((spend) => ({
      contractorId: spend.contractorId,
      contractorName: displayCrew(spend.contractorName),
      qty: spend.qty,
    })),
  }))
  return {
    siteId: site.siteId,
    siteName: SITE_NAMES[site.siteId] ?? site.siteName,
    asOfIso: site.asOfIso,
    articles,
  }
}

const SITE_NAMES: Readonly<Record<string, string>> = {
  'olympiyskaya-derevnya': 'Олимпийская деревня',
  anokhina: 'Анохина',
  brusilova: 'Брусилова',
  'mcd2-butovo': 'Бутово',
  koshtoyantsa: 'Коштоянца',
}

const FILE = raw as { sites: readonly RawSite[] }

const KEEP_SITE_IDS = new Set([
  'olympiyskaya-derevnya',
  'anokhina',
  'brusilova',
  'mcd2-butovo',
  'koshtoyantsa',
])

export const EXCEL_MATERIAL_BUDGETS: readonly MaterialBudget[] = FILE.sites
  .filter((site) => KEEP_SITE_IDS.has(site.siteId))
  .map(toBudget)

export const EXCEL_MATERIAL_BUDGETS_BY_SITE: Readonly<Record<string, MaterialBudget>> =
  Object.fromEntries(EXCEL_MATERIAL_BUDGETS.map((b) => [b.siteId, b]))
