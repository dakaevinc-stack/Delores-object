/*
 * Сплошная сверка: собирает все госномера из ВСЕХ листов обеих таблиц и
 * показывает, каких нет в импорте. Только читает и печатает.
 */
import { readFile } from 'node:fs/promises'

import ExcelJS from 'exceljs'
import { plateKey, looksLikePlate, formatPlate } from './parse.mjs'

const FILES = [
  'scripts/data/fleet-imports/База ТС Деловые Решения 14 05.26.xlsx',
  'scripts/data/fleet-imports/Бортовой журнал.xlsx',
]

/* Старые номера перерегистрированных машин — уже связаны по VIN. */
const KNOWN_OLD = new Set(
  [
    'Н 481 ОУ 797',
    'Е 390 НР 797',
    '50 ХР 0737',
    '77 РМ 6820',
    'А 382 МН 797',
    '77 РМ 7948',
    'Н 443 АА 977',
  ].map(plateKey),
)

/* Опечатки в сводке «Содержание»: смешаны старый и новый номера одной машины. */
const TYPOS_IN_CONTENTS = new Set(['50 ХР 0605', '77 РМ 3409'].map(plateKey))

/*
 * Номера, которые в парк намеренно не берём — решено заказчиком.
 * Встречаются только во вспомогательных листах: ни VIN, ни документов, ни
 * ремонтов по ним нет. Если появится новый номер вне этого списка — сверка
 * о нём скажет, и его нужно будет разобрать, а не молча пропустить.
 */
const EXPECTED_OUTSIDE_FLEET = new Map(
  [
    ['К 966 МУ 799', 'КАМАЗ 6520-54, есть только в листе «самосвалы»'],
    ['Р 177 ММ 797', 'КАМАЗ 6520-55, есть только в листе «самосвалы»'],
    ['У 526 МН 797', 'Hyundai Sonata, только в «Лист1 (2)» и «бирка ключи»'],
    ['У 602 АЕ 977', 'LADA 4X4, только в «бирка ключи»'],
    ['Х 732 УН 777', 'Range Rover, только в «бирка ключи»'],
    ['77 ММ 7058', 'тот же каток HD110 HAMM, что 77 МО 4698 в реестре'],
  ].map(([plate, why]) => [plateKey(plate), why]),
)

/* Сгенерированный файл читаем текстом — так не нужен загрузчик TypeScript. */
const generated = await readFile('src/data/fleet.imported.ts', 'utf8')
const importedPlates = new Set([...generated.matchAll(/plateKey:\s*"([^"]+)"/g)].map((m) => m[1]))
console.log(`единиц в импорте: ${importedPlates.size}\n`)

/** @type {Map<string, {shown: string, where: Set<string>}>} */
const found = new Map()

const PLATE_RE = /[А-ЯA-Z]{1,2}\s?\d{3,4}\s?[А-ЯA-Z]{0,2}\s?\d{2,3}|\d{2}\s?[А-ЯA-Z]{2}\s?\d{4}/gi

/* Где номер — это номер, а не серия СТС/ПТС/полиса. */
const PLATE_SHEETS = new Set([
  'Лист1',
  'Лист1 (2)',
  'самосвалы',
  'тралы',
  'БАЗА (2)',
  'бирка на карту',
  'бирка папка',
  'бирка ключи',
  'ремонты',
  'остатки ГСМ',
])

function cellIsPlateColumn(sheetName, col) {
  if (sheetName === 'БАЗА') return col === 4
  if (sheetName === 'ремонты') return col === 2 || col === 3
  if (sheetName === 'остатки ГСМ') return col <= 3
  return true
}

for (const file of FILES) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const short = file.includes('Бортовой') ? 'журнал' : 'база'
  wb.eachSheet((ws) => {
    if (short === 'база' && ws.name !== 'БАЗА' && !PLATE_SHEETS.has(ws.name)) return
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      /* В листах журнала номер стоит в шапке; ниже идут номера счетов. */
      if (short === 'журнал' && ws.name !== 'Содержание' && rowNumber > 4) return
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (short === 'база' && !cellIsPlateColumn(ws.name, cell.col)) return
        let v = cell.value
        if (v instanceof Date || v == null) return
        if (typeof v === 'object') v = v.result ?? v.text ?? ''
        const s = String(v)
        if (!s.trim()) return
        /* Целиком VIN или рама — внутри легко «увидеть» несуществующий номер
           (XTC652005L1424014 → «ТС 6520 05»). Такие ячейки пропускаем. */
        if (/^[0-9A-ZА-Я]{13,}$/i.test(s.replace(/[\s()/-]/g, ''))) return
        for (const m of s.matchAll(PLATE_RE)) {
          const raw = m[0]
          if (!looksLikePlate(raw)) continue
          const key = plateKey(raw)
          if (!key) continue
          if (!found.has(key)) found.set(key, { shown: formatPlate(raw), where: new Set() })
          found.get(key).where.add(`${short}/${ws.name}`)
        }
      })
    })
  })
}

const outside = [...found.entries()]
  .filter(([key]) => !importedPlates.has(key) && !KNOWN_OLD.has(key) && !TYPOS_IN_CONTENTS.has(key))
  .sort((a, b) => a[1].shown.localeCompare(b[1].shown, 'ru'))

const expected = outside.filter(([key]) => EXPECTED_OUTSIDE_FLEET.has(key))
const unexpected = outside.filter(([key]) => !EXPECTED_OUTSIDE_FLEET.has(key))

console.log(`всего распознано номеров в таблицах: ${found.size}`)

console.log(`\nвне парка по решению заказчика (${expected.length}):`)
for (const [key, info] of expected) {
  console.log(`  ${info.shown.padEnd(14)} — ${EXPECTED_OUTSIDE_FLEET.get(key)}`)
}

if (unexpected.length === 0) {
  console.log('\nОК: все остальные номера из таблиц есть в парке.')
} else {
  console.log(`\nНОВОЕ — нужно разобраться (${unexpected.length}):`)
  for (const [key, info] of unexpected) {
    console.log(`  ${info.shown.padEnd(14)} ${key.padEnd(12)} листы: ${[...info.where].join(', ')}`)
  }
  process.exitCode = 1
}
