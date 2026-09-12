/**
 * Собирает `src/data/fleet.imported.ts` из рабочих таблиц парка.
 *
 *   node scripts/fleet-excel/build.mjs <база.xlsx> <бортовой журнал.xlsx>
 *
 * Правила, которых держимся:
 *   — ничего не выдумываем: чего нет в таблице, того нет и в данных;
 *   — единицы сверяем по VIN (номера в таблицах меняются при перерегистрации);
 *   — если что-то не сошлось, падаем с ошибкой, а не пишем «примерно так».
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseRegistry,
  parseJournal,
  parseFuelLog,
  parseServiceSheet,
  parseTrailers,
  vinMatches,
  vinKey,
} from './parse.mjs'

const [registryPath, journalPath] = process.argv.slice(2)
if (!registryPath || !journalPath) {
  console.error('нужны два пути: <база.xlsx> <бортовой журнал.xlsx>')
  process.exit(1)
}

const OUT = resolve(process.cwd(), 'src/data/fleet.imported.ts')

/* ============================================================
   Вид счётчика: километры или моточасы
   ============================================================ */

const HOURS_CATEGORIES = new Set([
  'front-loaders',
  'mini-loaders',
  'backhoes',
  'excavators',
  'rollers',
  'pavers',
  'cold-mills',
])

function meterKind(categoryId) {
  if (categoryId === 'trailers') return null
  return HOURS_CATEGORIES.has(categoryId) ? 'hours' : 'km'
}

/* ============================================================
   Узлы техники по описанию работ — для подсветки на схеме
   ============================================================ */

const PART_KEYWORDS = [
  ['engine', ['двигател', 'двс', 'мотор', 'топливн', 'форсунк', 'тнвд', 'радиатор', 'охлажд', 'турбин', 'маслян', 'грм', 'сцеплен', 'маховик', 'стартер', 'глушител', 'выхлоп']],
  ['transmission', ['акпп', 'кпп', 'коробк', 'редуктор', 'бортовой передач', 'кардан', 'дифференциал', 'гидромотор', 'вал']],
  ['hydraulics', ['гидравлик', 'гидроцилиндр', 'гидронасос', 'гидрораспределит', 'рвд', 'шланг высокого']],
  ['brakes', ['тормоз', 'колодк', 'пневмосистем', 'абс']],
  ['steering', ['рулев', 'гур', 'кулак', 'тяг']],
  ['suspension', ['подвеск', 'амортизатор', 'рессор', 'ступиц', 'пневмобаллон']],
  ['undercarriage', ['ходов', 'гусениц', 'катк', 'шин', 'колес', 'диск', 'вальц']],
  ['body', ['кузов', 'кабин', 'капот', 'бампер', 'крыл', 'покраск', 'стекл', 'рам', 'кран-манипулятор', 'кмv', 'платформ', 'борт']],
  ['crane', ['стрел', 'рукоят', 'кму', 'манипулятор', 'палец стрел']],
  ['bucket', ['ковш', 'отвал', 'зуб', 'салазк']],
  ['electronics', ['электрик', 'электрооборуд', 'аккумулятор', 'акб', 'датчик', 'проводк', 'генератор', 'скзи', 'тахограф', 'диагностик', 'ошибк', 'фар', 'освещен']],
]

/** Узлы, затронутые работой. Пусто — если по описанию не понять. */
function partsFromWork(work) {
  if (!work) return []
  const s = work.toLowerCase()
  const found = []
  for (const [part, keywords] of PART_KEYWORDS) {
    if (keywords.some((k) => s.includes(k))) found.push(part)
  }
  return found
}

/* ============================================================
   Сборка
   ============================================================ */

const registry = await parseRegistry(registryPath)
const journal = await parseJournal(journalPath)
const fuel = await parseFuelLog(registryPath)
const service = await parseServiceSheet(registryPath)
const trailers = await parseTrailers(registryPath)

const problems = []
const notes = []

if (journal.skipped.length > 0) {
  for (const s of journal.skipped) {
    problems.push(`лист журнала «${s.sheet}» не разобран: ${s.reason}`)
  }
}
for (const issue of registry.issues) {
  if (issue.level === 'error') notes.push(`реестр, строка ${issue.row}: ${issue.message}`)
}

/** Единицы: сначала реестр (он главный по документам), потом «сироты» журнала. */
const units = registry.vehicles.map((v) => ({ ...v, source: 'реестр' }))

/**
 * Старые номера, которые встречаются в таблицах после перерегистрации.
 * Заполняется автоматически из листов, где рядом с номером есть VIN.
 * @type {Map<string, object>}
 */
const plateAliases = new Map()

/**
 * Номера, которые не связать автоматически: в листе нет VIN.
 * Опознаны по модели — такая машина в парке одна.
 */
const MANUAL_PLATE_ALIASES = {
  '50ХР0737': '77МХ0605', // Case 570SТ: в реестре «77 МХ 0605», в ГСМ — старый номер
}

function findUnit({ vinOrFrame, plateKey: key }) {
  if (vinOrFrame) {
    const byVin = units.find((u) => vinMatches(u.vinOrFrame, vinOrFrame))
    if (byVin) return byVin
  }
  if (key) {
    const byPlate = units.find((u) => u.plateKey === key)
    if (byPlate) return byPlate
    const alias = plateAliases.get(key)
    if (alias) return alias
    const manual = MANUAL_PLATE_ALIASES[key]
    if (manual) {
      const target = units.find((u) => u.plateKey === manual)
      if (target) return target
      problems.push(`в парке нет машины ${manual}, на которую ссылается старый номер ${key}`)
    }
  }
  return null
}

/** Запоминает «старый номер → машина», если в листе есть и номер, и VIN. */
function learnAlias(entry) {
  if (!entry.vinOrFrame || !entry.plateKey) return
  const unit = units.find((u) => vinMatches(u.vinOrFrame, entry.vinOrFrame))
  if (!unit || unit.plateKey === entry.plateKey) return
  plateAliases.set(entry.plateKey, unit)
}

/** Заготовка машины, о которой в реестре ТС документов нет. */
function emptyUnit() {
  return {
    year: null,
    licenseCategory: null,
    registrationCertificate: null,
    registrationCertificateIssuedIso: null,
    vehiclePassport: null,
    vehiclePassportIssuedIso: null,
    osago: { policyNumber: null, validUntilIso: null, notRequired: false },
    inspection: { cardNumber: null, validUntilIso: null },
    registeredOwner: null,
    wialon: 'unknown',
    fuelSensor: 'unknown',
    transponder: 'unknown',
    platon: 'unknown',
    tachograph: 'unknown',
    moscowPass: { validUntilIso: null, raw: null },
    entryZone: null,
    leaseEndIso: null,
    workTypes: null,
    notes: null,
  }
}

/* Машины, которые есть только в бортовом журнале (легковые, второй PM620). */
for (const entry of journal.byPlate.values()) {
  if (findUnit(entry)) continue
  if (!entry.vinOrFrame) {
    problems.push(`лист журнала «${entry.sheet}» (${entry.plate}) — нет ни VIN, ни машины в реестре`)
    continue
  }
  units.push({
    ...emptyUnit(),
    source: 'бортовой журнал',
    categoryId: guessCategoryFromModel(entry.model),
    plate: entry.plate,
    plateKey: entry.plateKey,
    vinOrFrame: entry.vinOrFrame,
    model: entry.model ?? '',
    year: entry.year,
  })
  notes.push(
    `добавлена из бортового журнала (в реестре ТС её нет): ${entry.plate} — ${entry.model ?? '?'}`,
  )
}

/** Категория для «сирот» журнала — по модели. */
function guessCategoryFromModel(model) {
  const s = (model ?? '').toLowerCase()
  if (/pm620|фреза|wirtgen/.test(s)) return 'cold-mills'
  if (/камри|camry|geely|monjaro|range rover|sportage|kia|solaris|sonata|lada|skoda|toyota|haval|mercedes|bmw|audi/.test(s)) {
    return 'cars'
  }
  problems.push(`не удалось определить категорию по модели «${model}»`)
  return 'cars'
}

/* ---------- привязка журнала, ГСМ и планового ТО ---------- */

/* Сначала учим старые номера: в журнале и в листе «ремонты» рядом с номером
   стоит VIN, поэтому связь «старый номер → машина» видна из самих таблиц.
   Без этого пробег из «остатков ГСМ» не найдёт перерегистрированные машины. */
for (const entry of journal.byPlate.values()) learnAlias(entry)
for (const entry of service.byPlate.values()) learnAlias(entry)

/* Машины, которые есть только в листе «ремонты»: раздел листа задаёт вид
   техники, VIN и номер там свои — терять такую машину нельзя. */
for (const entry of service.byPlate.values()) {
  if (findUnit(entry)) continue
  if (!entry.vinOrFrame || !entry.plateKey) {
    problems.push(`лист «ремонты», строка ${entry.row}: ни VIN, ни номера — не с чем сверить`)
    continue
  }
  if (!entry.categoryId) {
    problems.push(`лист «ремонты», строка ${entry.row}: ${entry.plate} — не определён вид техники`)
    continue
  }
  units.push({
    ...emptyUnit(),
    source: 'лист «ремонты»',
    categoryId: entry.categoryId,
    plate: entry.plate,
    plateKey: entry.plateKey,
    vinOrFrame: entry.vinOrFrame,
    model: entry.model ?? '',
  })
  notes.push(
    `добавлена из листа «ремонты» (в реестре ТС её нет): ${entry.plate} — ${entry.model ?? '?'}`,
  )
}

const repairsByUnit = new Map()
const journalTotals = new Map()
for (const entry of journal.byPlate.values()) {
  const unit = findUnit(entry)
  if (!unit) continue
  const list = repairsByUnit.get(unit.plateKey) ?? []
  for (const r of entry.records) list.push(r)
  repairsByUnit.set(unit.plateKey, list)
  if (entry.plateKey !== unit.plateKey) {
    notes.push(
      `${unit.plate}: в бортовом журнале записана как ${entry.plate} (VIN совпадает — машину перерегистрировали)`,
    )
  }
  journalTotals.set(unit.plateKey, entry.records.reduce((a, r) => a + (r.totalRub ?? 0), 0))
}

const meterByUnit = new Map()
for (const entry of fuel.byPlate.values()) {
  const unit = findUnit(entry)
  if (!unit) {
    notes.push(`лист «остатки ГСМ»: ${entry.plate} (${entry.model ?? '?'}) — машины нет в реестре`)
    continue
  }
  meterByUnit.set(unit.plateKey, entry)
}

const serviceByUnit = new Map()
for (const entry of service.byPlate.values()) {
  const unit = findUnit(entry)
  if (!unit) {
    notes.push(`лист «ремонты»: ${entry.plate} (${entry.model ?? '?'}) — машины нет в реестре`)
    continue
  }
  if (entry.plateKey && entry.plateKey !== unit.plateKey) {
    notes.push(
      `${unit.plate}: в листе «ремонты» записана как ${entry.plate} (VIN совпадает — машину перерегистрировали)`,
    )
  }
  serviceByUnit.set(unit.plateKey, entry)
}

/* ---------- сборка записей ---------- */

function equipment(state) {
  return state === 'unknown' ? undefined : state
}

let repairsCount = 0
let repairsSumRub = 0
const seenPlates = new Set()
const seenVins = new Set()

const records = units.map((u) => {
  if (seenPlates.has(u.plateKey)) problems.push(`дубль госномера: ${u.plate}`)
  seenPlates.add(u.plateKey)
  const vk = vinKey(u.vinOrFrame)
  if (vk) {
    if (seenVins.has(vk)) problems.push(`дубль VIN: ${u.vinOrFrame} (${u.plate})`)
    seenVins.add(vk)
  }

  const kind = meterKind(u.categoryId)
  const meter = meterByUnit.get(u.plateKey)
  const svc = serviceByUnit.get(u.plateKey)
  const raw = repairsByUnit.get(u.plateKey) ?? []

  const repairs = raw
    .filter((r) => r.dateIso || r.work || (r.totalRub ?? 0) > 0)
    .sort((a, b) => (a.dateIso ?? '').localeCompare(b.dateIso ?? ''))
    .map((r, i) => {
      repairsCount += 1
      repairsSumRub += r.totalRub ?? 0
      if (!r.dateIso) {
        problems.push(
          `${u.plate}: запись «${r.work ?? r.docNumber ?? '?'}» без даты — в карточке её нечем показать`,
        )
      }
      const details = [
        r.supplier ? `Исполнитель: ${r.supplier}` : null,
        r.docNumber ? `Документ № ${r.docNumber}` : null,
        r.partsRub ? `Запчасти: ${Math.round(r.partsRub).toLocaleString('ru-RU')} ₽` : null,
        r.laborRub ? `Работы: ${Math.round(r.laborRub).toLocaleString('ru-RU')} ₽` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return {
        id: `${u.plateKey}-j${String(i + 1).padStart(2, '0')}`,
        dateIso: r.dateIso,
        title: r.work || 'Работы по бортовому журналу',
        details: details || undefined,
        affectedParts: partsFromWork(r.work),
        open: false,
        costRub: r.totalRub != null ? Math.round(r.totalRub * 100) / 100 : undefined,
        partsRub: r.partsRub != null ? Math.round(r.partsRub * 100) / 100 : undefined,
        laborRub: r.laborRub != null ? Math.round(r.laborRub * 100) / 100 : undefined,
        mileage: r.mileage ?? undefined,
      }
    })

  /* Показания счётчика на последнем ТО не могут быть больше текущих —
     если так, значит в таблице опечатка, и мы её показываем, а не прячем. */
  if (
    svc?.meterAtService != null &&
    meter?.meter != null &&
    svc.meterAtService > meter.meter * 1.05
  ) {
    notes.push(
      `${u.plate}: «ТО пройден» на ${svc.meterAtService}, но последние показания ${meter.meter} — проверьте таблицу`,
    )
  }

  const passes = []
  const mskRaw = (u.moscowPass.raw ?? '').toLowerCase()
  if (u.moscowPass.validUntilIso || mskRaw) {
    passes.push({
      id: `${u.plateKey}-msk`,
      name: 'Пропуск в Москву',
      required: !mskRaw.startsWith('не нужен'),
      validUntilIso: u.moscowPass.validUntilIso ?? undefined,
      notes: u.entryZone ? `Разрешённая зона: ${u.entryZone}` : undefined,
    })
  }

  const trailer = trailers.byPlate.get(u.plateKey)
  const noteParts = [
    u.notes,
    u.workTypes ? `Виды работ: ${u.workTypes}` : null,
    trailer?.coupling ? `Работает в составе: ${trailer.coupling}` : null,
    u.plate ? null : 'Госномер не присвоен — машина опознаётся по VIN',
  ].filter(Boolean)

  return {
    plate: u.plate,
    plateKey: u.plateKey,
    categoryId: u.categoryId,
    vinOrFrame: u.vinOrFrame || '',
    model: u.model,
    year: u.year ?? undefined,
    source: u.source,
    licenseCategory: u.licenseCategory ?? undefined,
    registrationCertificate: u.registrationCertificate ?? undefined,
    registrationCertificateIssuedIso: u.registrationCertificateIssuedIso ?? undefined,
    vehiclePassport: u.vehiclePassport ?? undefined,
    vehiclePassportIssuedIso: u.vehiclePassportIssuedIso ?? undefined,
    registeredOwner: u.registeredOwner ?? undefined,
    leaseEndIso: u.leaseEndIso ?? undefined,
    insurance: {
      policyNumber: u.osago.policyNumber ?? undefined,
      validUntilIso: u.osago.validUntilIso ?? undefined,
      notRequired: u.osago.notRequired ? true : undefined,
    },
    technicalInspection:
      u.inspection.cardNumber || u.inspection.validUntilIso
        ? {
            cardNumber: u.inspection.cardNumber ?? undefined,
            validUntilIso: u.inspection.validUntilIso ?? undefined,
          }
        : undefined,
    equipment: {
      telematics: equipment(u.wialon),
      fuelSensor: equipment(u.fuelSensor),
      transponder: equipment(u.transponder),
      platon: equipment(u.platon),
      tachograph: equipment(u.tachograph),
    },
    meter:
      meter && kind
        ? {
            kind,
            value: meter.meter,
            asOfIso: meter.meterDateIso ?? undefined,
            fuelRemainingL: meter.fuelLiters ?? undefined,
          }
        : undefined,
    service:
      svc && (svc.work || svc.meterAtService != null)
        ? {
            plannedWork: svc.work ?? undefined,
            meterAtService: svc.meterAtService ?? undefined,
          }
        : undefined,
    dimensions: trailer
      ? {
          lengthCm: trailer.lengthCm ?? undefined,
          maxMassKg: trailer.maxMassKg ?? undefined,
          payloadKg: trailer.payloadKg ?? undefined,
          axleCount: trailer.axleCount ?? undefined,
        }
      : undefined,
    passes,
    repairs,
    notes: noteParts.length > 0 ? noteParts.join('. ') : undefined,
  }
})

/* ---------- контроль ---------- */

if (problems.length > 0) {
  console.error('СБОРКА ОСТАНОВЛЕНА — сначала нужно разобраться:\n')
  for (const p of problems) console.error('  ✗ ' + p)
  process.exit(1)
}

const byCategory = new Map()
for (const r of records) byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + 1)

/* ---------- запись файла ---------- */

function ts(value) {
  return JSON.stringify(value)
}

function emitObject(obj, indent) {
  const pad = ' '.repeat(indent)
  const lines = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      // пустой массив пишем явно: поле обязательное, потребители ждут массив
      if (value.length === 0) {
        lines.push(`${pad}${key}: [],`)
        continue
      }
      lines.push(`${pad}${key}: [`)
      for (const item of value) {
        if (item && typeof item === 'object') {
          lines.push(`${pad}  {`)
          lines.push(emitObject(item, indent + 4))
          lines.push(`${pad}  },`)
        } else {
          lines.push(`${pad}  ${ts(item)},`)
        }
      }
      lines.push(`${pad}],`)
      continue
    }
    if (value && typeof value === 'object') {
      const inner = emitObject(value, indent + 2)
      if (!inner.trim()) {
        lines.push(`${pad}${key}: {},`)
        continue
      }
      lines.push(`${pad}${key}: {`)
      lines.push(inner)
      lines.push(`${pad}},`)
      continue
    }
    lines.push(`${pad}${key}: ${ts(value)},`)
  }
  return lines.join('\n')
}

const generatedAt = new Date().toISOString()
const header = `/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ — руками не править.
 *
 * Источник: рабочие таблицы парка
 *   • ${registryPath.split('/').pop()}  (лист «БАЗА», «ремонты», «остатки ГСМ»)
 *   • ${journalPath.split('/').pop()}  (по листу на машину)
 *
 * Пересобрать после обновления таблиц:
 *   node scripts/fleet-excel/build.mjs <база.xlsx> <бортовой журнал.xlsx>
 *
 * Всё, что здесь есть, взято из таблиц. Чего в таблицах нет — того нет и
 * здесь: пустые поля означают «данных нет», а не «ноль».
 */

import type { FleetCategoryId, FleetEquipmentState, FleetSchematicPartId } from '../domain/fleet'

export type ImportedRepair = {
  id: string
  /** Дата документа. Пусто — в таблице дата не указана. */
  dateIso?: string
  title: string
  details?: string
  affectedParts: FleetSchematicPartId[]
  open: boolean
  costRub?: number
  partsRub?: number
  laborRub?: number
  /** Пробег/наработка на момент работ — есть лишь в нескольких листах. */
  mileage?: number
}

export type ImportedFleetUnit = {
  plate: string
  /** Номер без пробелов, кириллицей — ключ сверки между таблицами. */
  plateKey: string
  categoryId: FleetCategoryId
  vinOrFrame: string
  model: string
  year?: number
  /** Откуда взялась запись: реестр ТС или бортовой журнал. */
  source: string
  licenseCategory?: string
  registrationCertificate?: string
  registrationCertificateIssuedIso?: string
  vehiclePassport?: string
  vehiclePassportIssuedIso?: string
  registeredOwner?: string
  leaseEndIso?: string
  insurance: { policyNumber?: string; validUntilIso?: string; notRequired?: boolean }
  technicalInspection?: { cardNumber?: string; validUntilIso?: string }
  equipment: {
    telematics?: FleetEquipmentState
    fuelSensor?: FleetEquipmentState
    transponder?: FleetEquipmentState
    platon?: FleetEquipmentState
    tachograph?: FleetEquipmentState
  }
  /** Показания счётчика: км для колёсной техники, моточасы для спецтехники. */
  meter?: { kind: 'km' | 'hours'; value: number; asOfIso?: string; fuelRemainingL?: number }
  /** Плановое ТО из листа «ремонты». */
  service?: { plannedWork?: string; meterAtService?: number }
  /** Габариты и масса из листа «тралы» — есть только у сцепок. */
  dimensions?: { lengthCm?: number; maxMassKg?: number; payloadKg?: number; axleCount?: number }
  passes: { id: string; name: string; required: boolean; validUntilIso?: string; notes?: string }[]
  repairs: ImportedRepair[]
  notes?: string
}

export const FLEET_IMPORT_META = {
  generatedAtIso: ${ts(generatedAt)},
  unitCount: ${records.length},
  repairCount: ${repairsCount},
  repairSumRub: ${Math.round(repairsSumRub * 100) / 100},
} as const

export const IMPORTED_FLEET: readonly ImportedFleetUnit[] = [
`

const body = records
  .map((r) => `  {\n${emitObject(r, 4)}\n  },`)
  .join('\n')

writeFileSync(OUT, header + body + '\n]\n', 'utf8')

console.log(`записан ${OUT}`)
console.log(`  единиц техники: ${records.length}`)
for (const [id, count] of [...byCategory].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${id.padEnd(16)} ${count}`)
}
console.log(`  записей о ремонтах: ${repairsCount}`)
console.log(`  сумма ремонтов: ${repairsSumRub.toLocaleString('ru-RU')} ₽`)
console.log(`  с показаниями счётчика: ${records.filter((r) => r.meter).length}`)
console.log(`  с плановым ТО: ${records.filter((r) => r.service).length}`)
console.log(`  с пропуском в Москву: ${records.filter((r) => r.passes.length > 0).length}`)

if (notes.length > 0) {
  console.log(`\nНА ЗАМЕТКУ (${notes.length}) — данные приняты, но стоит проверить в таблице:`)
  for (const n of notes) console.log('  • ' + n)
}
