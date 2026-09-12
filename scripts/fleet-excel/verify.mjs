/**
 * Сверка разбора с собственными итогами таблиц.
 *
 * Проверяем два независимых контроля:
 *   1) по каждому листу журнала — сумма разобранных строк против строки «Итого»;
 *   2) по всему журналу — против итога на листе «Содержание».
 *
 * Если оба контроля сходятся, значит ни одна цифра не потеряна и не удвоена.
 */

import ExcelJS from 'exceljs'
import { parseJournal } from './parse.mjs'

const [journalPath] = process.argv.slice(2)
if (!journalPath) {
  console.error('нужен путь: <бортовой журнал.xlsx>')
  process.exit(1)
}

function num(cell) {
  const v = cell?.value
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function textOf(cell) {
  const v = cell?.value
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '')
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return v.text
  }
  return String(v)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(journalPath)

/** «Итого» в листе может стоять не в первой колонке — ищем по строке. */
function sheetTotal(ws) {
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= 4; c++) {
      if (textOf(row.getCell(c)).trim().toLowerCase().startsWith('итого')) {
        return { row: r, total: num(row.getCell(5)) }
      }
    }
  }
  return null
}

const parsed = await parseJournal(journalPath)
const parsedBySheet = new Map()
for (const entry of parsed.byPlate.values()) {
  parsedBySheet.set(entry.sheet, entry)
}

let mismatches = 0
let parsedGrand = 0
let sheetGrand = 0

for (const ws of wb.worksheets) {
  if (ws.name.toLowerCase() === 'содержание') continue
  const own = sheetTotal(ws)
  const entry = parsedBySheet.get(ws.name)
  const mine = entry ? entry.records.reduce((a, r) => a + (r.totalRub ?? 0), 0) : 0
  const theirs = own?.total ?? 0
  parsedGrand += mine
  sheetGrand += theirs
  const diff = Math.round((mine - theirs) * 100) / 100
  if (Math.abs(diff) > 0.011) {
    mismatches += 1
    console.log(
      `РАСХОЖДЕНИЕ «${ws.name}»: разобрано ${mine.toLocaleString('ru-RU')}, ` +
        `в листе «Итого» ${theirs.toLocaleString('ru-RU')} (разница ${diff.toLocaleString('ru-RU')})` +
        (own ? ` [строка Итого: ${own.row}]` : ' [строки «Итого» нет]'),
    )
  }
}

const contents = wb.getWorksheet('Содержание')
let contentsTotal = null
if (contents) {
  for (let r = 1; r <= contents.rowCount; r++) {
    const row = contents.getRow(r)
    for (let c = 1; c <= 4; c++) {
      if (textOf(row.getCell(c)).trim().toLowerCase().startsWith('всего')) {
        contentsTotal = num(row.getCell(5))
      }
    }
  }
}

console.log(`\nразобрано всего:            ${parsedGrand.toLocaleString('ru-RU')} ₽`)
console.log(`сумма строк «Итого» листов: ${sheetGrand.toLocaleString('ru-RU')} ₽`)
console.log(`итог листа «Содержание»:    ${contentsTotal?.toLocaleString('ru-RU') ?? '—'} ₽`)
console.log(`листов с расхождением: ${mismatches}`)

/*
 * Сводка «Содержание» занижает итог: в строке про Sany 330 стоит ссылка на
 * первую строку листа (36 426 ₽) вместо суммы (410 442,19 ₽). Расхождение
 * ровно на эту величину — ошибка в формуле таблицы, а не в разборе.
 */
const KNOWN_CONTENTS_SHORTFALL_RUB = 374016.19

if (contentsTotal != null) {
  const delta = Math.round((parsedGrand - contentsTotal) * 100) / 100
  if (Math.abs(delta) > 0.011) {
    console.log(
      `\nсводка «Содержание» меньше листов на ${delta.toLocaleString('ru-RU')} ₽` +
        (Math.abs(delta - KNOWN_CONTENTS_SHORTFALL_RUB) < 0.011
          ? ' — это известная ошибка формулы по Sany 330, разбор верен'
          : ' — НОВОЕ расхождение, нужно проверить'),
    )
  }
}

const ok =
  mismatches === 0 &&
  contentsTotal != null &&
  Math.abs(parsedGrand - contentsTotal - KNOWN_CONTENTS_SHORTFALL_RUB) < 0.011
console.log(ok ? '\nОК: все цифры сходятся с листами таблицы.' : '\nЕСТЬ РАСХОЖДЕНИЯ — разбираемся.')
process.exit(ok ? 0 : 1)
