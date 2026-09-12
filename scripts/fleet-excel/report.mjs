/**
 * Отчёт по таблицам парка: что распознано, что не сошлось.
 * Ничего не меняет в проекте — только читает и печатает.
 *
 * Запуск: node scripts/fleet-excel/report.mjs <база.xlsx> <бортовой-журнал.xlsx>
 */

import { parseRegistry, parseJournal, parseFuelLog, parseServiceSheet, plateKey, vinMatches } from './parse.mjs'

const [registryPath, journalPath] = process.argv.slice(2)
if (!registryPath || !journalPath) {
  console.error('нужны два пути: <база.xlsx> <бортовой журнал.xlsx>')
  process.exit(1)
}

const registry = await parseRegistry(registryPath)
const journal = await parseJournal(journalPath)
const fuel = await parseFuelLog(registryPath)
const service = await parseServiceSheet(registryPath)

console.log('РЕЕСТР (лист БАЗА)')
console.log(`  распознано единиц: ${registry.vehicles.length}`)

const byCategory = new Map()
for (const v of registry.vehicles) {
  byCategory.set(v.categoryId, (byCategory.get(v.categoryId) ?? 0) + 1)
}
for (const [id, count] of byCategory) {
  const title = registry.vehicles.find((v) => v.categoryId === id).categoryTitle
  console.log(`    ${id.padEnd(16)} ${String(count).padStart(2)}  ${title}`)
}

const dupes = new Map()
for (const v of registry.vehicles) {
  if (!dupes.has(v.plateKey)) dupes.set(v.plateKey, [])
  dupes.get(v.plateKey).push(v)
}
const duplicated = [...dupes.entries()].filter(([, list]) => list.length > 1)
console.log(`\n  дубли госномеров: ${duplicated.length}`)
for (const [key, list] of duplicated) {
  console.log(`    ${key}: строки ${list.map((v) => v.row).join(', ')}`)
}

const noVin = registry.vehicles.filter((v) => !v.vinOrFrame)
console.log(`  без VIN: ${noVin.length}${noVin.length ? ' → ' + noVin.map((v) => v.plate).join(', ') : ''}`)

const noOsago = registry.vehicles.filter((v) => !v.osago.notRequired && !v.osago.validUntilIso)
console.log(`  без срока ОСАГО: ${noOsago.length}`)
for (const v of noOsago) {
  console.log(`    ${v.plate.padEnd(16)} полис=${v.osago.policyNumber ?? '—'}  (строка ${v.row})`)
}

const noDk = registry.vehicles.filter((v) => !v.inspection.validUntilIso)
console.log(`  без срока ДК/ГТО: ${noDk.length}`)

const expiredOsago = registry.vehicles
  .filter((v) => v.osago.validUntilIso && v.osago.validUntilIso < new Date().toISOString().slice(0, 10))
  .sort((a, b) => a.osago.validUntilIso.localeCompare(b.osago.validUntilIso))
console.log(`\n  ОСАГО просрочен: ${expiredOsago.length}`)
for (const v of expiredOsago) {
  console.log(`    ${v.osago.validUntilIso}  ${v.plate.padEnd(16)} ${v.model.slice(0, 40)}`)
}

const expiredDk = registry.vehicles
  .filter((v) => v.inspection.validUntilIso && v.inspection.validUntilIso < new Date().toISOString().slice(0, 10))
  .sort((a, b) => a.inspection.validUntilIso.localeCompare(b.inspection.validUntilIso))
console.log(`\n  ДК просрочена: ${expiredDk.length}`)
for (const v of expiredDk) {
  console.log(`    ${v.inspection.validUntilIso}  ${v.plate.padEnd(16)} ${v.model.slice(0, 40)}`)
}

console.log(`\n  замечания парсера: ${registry.issues.length}`)
for (const i of registry.issues) {
  console.log(`    [${i.level}] строка ${i.row}: ${i.message}`)
}

console.log('\nБОРТОВОЙ ЖУРНАЛ')
console.log(`  листов с машинами: ${journal.byPlate.size}`)
let recordCount = 0
let totalRub = 0
for (const entry of journal.byPlate.values()) {
  recordCount += entry.records.length
  for (const r of entry.records) totalRub += r.totalRub ?? 0
}
console.log(`  записей о ремонтах: ${recordCount}`)
console.log(`  сумма по журналу: ${totalRub.toLocaleString('ru-RU')} ₽`)
console.log(`  пропущено листов: ${journal.skipped.length}`)
for (const s of journal.skipped) console.log(`    «${s.sheet}» — ${s.reason}`)
console.log(`  замечания: ${journal.issues.length}`)
for (const i of journal.issues) console.log(`    [${i.level}] «${i.sheet}»: ${i.message}`)

console.log('\nСВЕРКА ФАЙЛОВ (по VIN, затем по номеру)')
const registryKeys = new Set(registry.vehicles.map((v) => v.plateKey))

/** Ищем машину реестра сначала по VIN — номера в таблицах меняются. */
function findInRegistry({ vinOrFrame, plateKey: key }) {
  if (vinOrFrame) {
    const byVin = registry.vehicles.find((v) => vinMatches(v.vinOrFrame, vinOrFrame))
    if (byVin) return { vehicle: byVin, via: 'VIN' }
  }
  const byPlate = registry.vehicles.find((v) => v.plateKey === key)
  if (byPlate) return { vehicle: byPlate, via: 'номер' }
  return null
}

const matchedRegistryRows = new Set()
const journalOnly = []
const renamed = []
for (const entry of journal.byPlate.values()) {
  const hit = findInRegistry(entry)
  if (!hit) {
    journalOnly.push(entry)
    continue
  }
  matchedRegistryRows.add(hit.vehicle.row)
  if (hit.via === 'VIN' && hit.vehicle.plateKey !== entry.plateKey) {
    renamed.push({ entry, vehicle: hit.vehicle })
  }
}

console.log(`  сошлось: ${matchedRegistryRows.size} из ${registry.vehicles.length}`)
console.log(`\n  один VIN — разные номера (машину перерегистрировали): ${renamed.length}`)
for (const { entry, vehicle } of renamed) {
  console.log(
    `    ${entry.plate.padEnd(16)} (журнал, лист «${entry.sheet}») → ${vehicle.plate.padEnd(16)} (реестр)  ${vehicle.model.slice(0, 34)}`,
  )
}

console.log(`\n  есть в журнале, нет в реестре: ${journalOnly.length}`)
for (const entry of journalOnly) {
  console.log(
    `    ${entry.plate.padEnd(16)} ${(entry.model ?? '').slice(0, 34).padEnd(34)} VIN=${entry.vinOrFrame ?? '—'}  лист «${entry.sheet}», записей: ${entry.records.length}`,
  )
}

const registryOnly = registry.vehicles.filter((v) => !matchedRegistryRows.has(v.row))
console.log(`\n  есть в реестре, нет в журнале: ${registryOnly.length}`)
for (const v of registryOnly) {
  console.log(`    ${v.plate.padEnd(16)} ${v.model.slice(0, 40)}`)
}

console.log('\nОДОМЕТР (остатки ГСМ)')
console.log(`  строк с пробегом: ${fuel.byPlate.size}`)
const fuelOnly = [...fuel.byPlate.entries()].filter(([key]) => !registryKeys.has(key))
console.log(`  нет в реестре: ${fuelOnly.length}`)
for (const [key, entry] of fuelOnly) {
  console.log(`    ${entry.plate.padEnd(16)} ${entry.model ?? ''} [${key}]`)
}

console.log('\nПЛАНОВОЕ ТО (лист «ремонты»)')
console.log(`  строк: ${service.byPlate.size}`)
const serviceOnly = [...service.byPlate.entries()].filter(([key]) => !registryKeys.has(key))
console.log(`  нет в реестре: ${serviceOnly.length}`)
for (const [key, entry] of serviceOnly) {
  console.log(`    ${entry.plate.padEnd(16)} ${entry.model ?? ''} [${key}]`)
}

console.log('\nСВЕРКА С ПРОЕКТОМ')
const { FLEET_VEHICLES } = await import('../../src/data/fleet.mock.ts').catch(() => ({ FLEET_VEHICLES: null }))
if (!FLEET_VEHICLES) {
  console.log('  (пропущено: fleet.mock.ts не читается из node напрямую)')
} else {
  const projectKeys = new Map(FLEET_VEHICLES.map((v) => [plateKey(v.plate), v]))
  const missing = registry.vehicles.filter((v) => !projectKeys.has(v.plateKey))
  console.log(`  в таблице есть, в проекте нет: ${missing.length}`)
  for (const v of missing) console.log(`    ${v.plate.padEnd(16)} ${v.model.slice(0, 40)}`)
  const extra = [...projectKeys.entries()].filter(([key]) => !registryKeys.has(key))
  console.log(`  в проекте есть, в таблице нет: ${extra.length}`)
  for (const [, v] of extra) console.log(`    ${v.plate.padEnd(16)} ${v.model.slice(0, 40)}`)
}
