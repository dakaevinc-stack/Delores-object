/**
 * Читает ведомости расхода с рабочего стола и пишет
 * src/data/materialBudgets/fromExcel.json — только числа из файлов.
 */
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR =
  process.env.MATERIAL_XLSX_DIR ||
  '/Users/dakaevinc/Desktop/Объекты расход материалов/12-09-2026_17-18-14'
const OUT = path.join(__dirname, '../../src/data/materialBudgets/fromExcel.json')

const FILES = [
  {
    file: 'ОЛИМПИЙМСКИЙ ПАРК (ДР) ШИРАЗ.xlsx',
    siteId: 'olympiyskaya-derevnya',
    siteName: 'Олимпийская деревня',
    closed: false,
  },
  {
    file: 'ул. АНОХИНА Мика Бату Женя.xlsx',
    siteId: 'anokhina',
    siteName: 'Анохина',
    closed: false,
  },
  {
    file: 'ул. БРУСИЛОВА (ДР) АГВАН ЗОРО ДЕНИС БАТУ.xlsx',
    siteId: 'brusilova',
    siteName: 'Брусилова',
    closed: false,
  },
  {
    file: 'БУТОВО (ДР) ВАРТАН ВАНУШ.xlsx',
    siteId: 'mcd2-butovo',
    siteName: 'Бутово',
    closed: false,
  },
  {
    file: 'ул.КОШТОЯНЦА (ДР) ДР МСК-ХОРТ.xlsx',
    siteId: 'koshtoyantsa',
    siteName: 'Коштоянца',
    closed: false,
  },
]

function cellText(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text.trim()
    if (typeof v.result === 'number' && Number.isFinite(v.result)) return String(v.result)
    if (typeof v.result === 'string') return v.result.trim()
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim()
    if (v.formula && v.result != null) return cellText(v.result)
  }
  return ''
}

function cellNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'object' && v && typeof v.result === 'number' && Number.isFinite(v.result)) {
    return v.result
  }
  const s = cellText(v).replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function normalize(s) {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[*\u00d7]/g, 'x')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSkipTitle(title) {
  const n = normalize(title)
  if (!n) return true
  if (/^(итого|всего|объем|примечание|дата)$/.test(n)) return true
  return false
}

function isTotalHeader(text) {
  const n = normalize(text)
  return n === 'итого' || n === 'всего' || n === 'сумма'
}

function classifyMaterial(title) {
  const n = normalize(title)
  const hasT = /(^|\s)(тонн|т)(\s|$)/.test(n)
  const hasM2 = /(м2|м 2)/.test(n)
  const hasKg = /(^|\s)кг(\s|$)/.test(n)

  if (/геотекстил/.test(n)) return { presetId: 'geotextile-200', unit: 'm2', group: 'Геосинтетика', title: 'Геотекстиль' }
  if (/крошк/.test(n)) return { presetId: null, unit: 'm3', group: 'Асфальт', title: title.trim() }
  if (/семена/.test(n)) return { presetId: null, unit: hasKg ? 'kg' : 't', group: 'Благоустройство', title: title.trim() }
  if (/эмульс|эдкб/.test(n)) return { presetId: 'emulsion-edkb-b', unit: 't', group: 'Дорожная химия', title: 'Эмульсия битумная ЭДКБ-Б' }
  if (/щма/.test(n)) return { presetId: 'asphalt-shma-20', unit: 't', group: 'Асфальт', title: 'ЩМА-20' }
  if (/песчан/.test(n) && /асфальт|афс|асф /.test(n)) {
    return { presetId: 'asphalt-sandy', unit: 't', group: 'Асфальт', title: 'Асфальтобетон песчаный' }
  }
  if (/(^|\s)мз(\s|$)/.test(n) && /асфальт/.test(n)) {
    return { presetId: 'asphalt-type-b-mz', unit: 't', group: 'Асфальт', title: 'Асфальтобетон МЗ' }
  }
  if (/асфальт/.test(n) && /тип б|кз/.test(n)) {
    return { presetId: 'asphalt-type-b', unit: 't', group: 'Асфальт', title: title.trim() }
  }
  if (/асфальт/.test(n)) return { presetId: 'asphalt-type-b', unit: 't', group: 'Асфальт', title: title.trim() }

  if (/радиус/.test(n) && /r ?6|р ?6/.test(n)) {
    return { presetId: 'curb-radius-r6', unit: 'pcs', group: 'Бортовой камень', title: 'Бордюр радиусный R6' }
  }
  if (/радиус/.test(n) && /r ?3|р ?3/.test(n)) {
    return { presetId: 'curb-radius-r3', unit: 'pcs', group: 'Бортовой камень', title: 'Бордюр радиусный R3' }
  }
  if (/компенсатор/.test(n)) {
    return { presetId: 'curb-compensator-15', unit: 'pcs', group: 'Бортовой камень', title: 'Компенсатор бордюрный 15' }
  }
  if (/бордюр|бортовой камень/.test(n)) {
    return { presetId: 'curb-br-100-30-15', unit: 'pcs', group: 'Бортовой камень', title: title.trim() }
  }

  if (/бетон/.test(n) && /тощ|b ?7|в ?7/.test(n)) {
    return { presetId: 'concrete-b7-5', unit: 'm3', group: 'Бетон', title: 'Бетон тощий B7,5' }
  }
  if (/бетон/.test(n)) {
    return { presetId: 'concrete-b15', unit: 'm3', group: 'Бетон', title: 'Бетон B15 (М200)' }
  }

  if (/щгпс|щпгс|щпс/.test(n)) {
    return { presetId: 'crushed-shgps-c4', unit: hasT ? 't' : 'm3', group: 'Основания', title: hasT ? 'ЩГПС С4' : 'ЩГПС С4' }
  }
  if (/щебень/.test(n) && /40/.test(n) && /70/.test(n)) {
    return { presetId: 'crushed-granite-40-70', unit: 'm3', group: 'Основания', title: 'Щебень 40–70' }
  }
  if (/щебень/.test(n) && /5/.test(n) && /20/.test(n)) {
    return { presetId: 'crushed-granite-5-20', unit: 'm3', group: 'Основания', title: 'Щебень 5–20' }
  }
  if (/щебень/.test(n) && /20/.test(n) && /40/.test(n)) {
    return { presetId: 'crushed-granite-20-40', unit: 'm3', group: 'Основания', title: 'Щебень 20–40' }
  }
  if (/щебень/.test(n)) {
    return { presetId: 'crushed-granite-20-40', unit: 'm3', group: 'Основания', title: title.trim() }
  }

  if (/чернозем|почвогрунт|плодород/.test(n)) {
    return { presetId: 'topsoil-chernozem', unit: 'm3', group: 'Благоустройство', title: 'Чернозём / плодородный грунт' }
  }
  if (/жиро+шкин/.test(n)) {
    return { presetId: 'sand-quarry', unit: hasT ? 't' : 'm3', group: 'Земляные работы', title: 'Песок Жирошкино' }
  }
  if (/песок/.test(n) && /мыт/.test(n)) {
    return { presetId: 'sand-river-washed', unit: 'm3', group: 'Земляные работы', title: 'Песок мытый' }
  }
  if (/песок/.test(n)) {
    return { presetId: 'sand-quarry', unit: hasT ? 't' : 'm3', group: 'Земляные работы', title: 'Песок карьерный' }
  }

  return {
    presetId: null,
    unit: hasM2 ? 'm2' : hasT ? 't' : hasKg ? 'kg' : 'm3',
    group: 'Прочее',
    title: title.trim(),
  }
}

function contractorName(sheetName, header) {
  const stripSite = (raw) =>
    raw
      .replace(/!+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^ул\.?\s*/i, '')
      .replace(
        /^(балаклавский|старобалаклавский|бутово|джайнокская|кирпичный(?:\s+завод)?|крекшино|олимпийский(?:\s+парк)?|олимпийс|олимп парк|анохина|брусилова|коштоянца|щербинка)[,.\s]*/i,
        '',
      )
      .replace(/^(завод|рябиновая|вокзальная)[,.\s]*/i, '')
      .replace(/\s+оч$/i, '')
      .replace(/^\(+|\)$/g, '')
      .trim()

  const fromSheet = stripSite(sheetName)
  const fromHeader = stripSite(header || '')
  let name = fromSheet.length >= 2 ? fromSheet : fromHeader
  if (!name) name = header || sheetName
  if (/микаэл/i.test(`${sheetName} ${header}`)) name = 'Микаэл'
  else if (/сасун/i.test(name)) name = 'Сасун'
  else if (/мск-хорт/i.test(name)) name = 'МСК-ХОРТ'
  else if (/^др$/i.test(name) || /^\(?др\)?$/i.test(name)) name = 'ДР'
  else if (!name || /^(ул\.|рябиновая|вокзальная|коштоянца|джайнокская)/i.test(name)) name = 'ДР'
  return name.replace(/\s+/g, ' ').trim()
}

function contractorId(name) {
  return normalize(name).replace(/\s+/g, '-') || 'crew'
}

function findXlsx(fileName) {
  const direct = path.join(SRC_DIR, fileName)
  if (fs.existsSync(direct)) return direct
  const files = fs.readdirSync(SRC_DIR)
  const want = normalize(fileName)
  const hit = files.find((f) => normalize(f) === want)
  if (!hit) throw new Error(`Нет файла: ${fileName}`)
  return path.join(SRC_DIR, hit)
}

function parseSheet(ws) {
  const header = ws.getRow(1)
  const maxCol = Math.min(ws.columnCount || 0, 200)
  const dateCols = []
  for (let c = 3; c <= maxCol; c++) {
    const label = cellText(header.getCell(c).value)
    if (isTotalHeader(label)) continue
    dateCols.push(c)
  }

  const rows = []
  const maxRow = ws.rowCount || 0
  for (let r = 2; r <= maxRow; r++) {
    const row = ws.getRow(r)
    const title = cellText(row.getCell(1).value)
    if (isSkipTitle(title)) continue
    const planned = cellNum(row.getCell(2).value)
    let qty = 0
    for (const c of dateCols) {
      const n = cellNum(row.getCell(c).value)
      if (n != null && n !== 0) qty += n
    }
    qty = Math.round(qty * 1000) / 1000
    const meta = classifyMaterial(title)
    rows.push({
      excelTitle: title,
      ...meta,
      planned: planned != null && planned > 0 ? Math.round(planned * 1000) / 1000 : null,
      qty,
    })
  }
  return rows
}

const sites = []
for (const spec of FILES) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(findXlsx(spec.file))
  const contractors = []
  const articleMap = new Map()

  for (const ws of wb.worksheets) {
    const headerTitle = cellText(ws.getRow(1).getCell(1).value)
    const name = contractorName(ws.name, headerTitle)
    const id = contractorId(name)
    const parsed = parseSheet(ws)
    const spends = []
    for (const row of parsed) {
      if (!(row.qty > 0) && row.planned == null) continue
      const key = `${row.presetId ?? 'x'}::${normalize(row.title)}::${row.unit}`
      if (!articleMap.has(key)) {
        articleMap.set(key, {
          id: key,
          presetId: row.presetId,
          title: row.title,
          group: row.group,
          unit: row.unit,
          excelTitles: [row.excelTitle],
          planned: row.planned,
          imported: [],
        })
      } else {
        const art = articleMap.get(key)
        if (!art.excelTitles.includes(row.excelTitle)) art.excelTitles.push(row.excelTitle)
        if (art.planned == null && row.planned != null) art.planned = row.planned
      }
      if (row.qty > 0) {
        articleMap.get(key).imported.push({ contractorId: id, contractorName: name, qty: row.qty })
        spends.push({ title: row.title, qty: row.qty, unit: row.unit })
      }
    }
    contractors.push({
      id,
      name,
      sheet: ws.name,
      lines: spends.length,
      qtySum: Math.round(spends.reduce((s, x) => s + x.qty, 0) * 1000) / 1000,
    })
  }

  const articles = [...articleMap.values()].map((a) => {
    const merged = new Map()
    for (const row of a.imported) {
      const prev = merged.get(row.contractorId)
      if (prev) prev.qty = Math.round((prev.qty + row.qty) * 1000) / 1000
      else merged.set(row.contractorId, { ...row })
    }
    return {
      ...a,
      imported: [...merged.values()],
      importedTotal: Math.round([...merged.values()].reduce((s, x) => s + x.qty, 0) * 1000) / 1000,
    }
  }).filter((a) => a.importedTotal > 0 || a.planned != null)

  sites.push({
    siteId: spec.siteId,
    siteName: spec.siteName,
    closed: spec.closed,
    sourceFile: spec.file,
    asOfIso: '2026-09-12T00:00:00.000Z',
    contractors,
    articles,
  })
}

const payload = {
  generatedAtIso: new Date().toISOString(),
  source: 'Объекты расход материалов / 12-09-2026_17-18-14',
  sites,
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)

for (const s of sites) {
  const total = s.articles.reduce((n, a) => n + a.importedTotal, 0)
  console.log(
    `${s.siteId}  ${s.closed ? 'CLOSED' : 'open'}  crews=${s.contractors.length}  articles=${s.articles.length}  qty=${Math.round(total)}`,
  )
  for (const c of s.contractors) console.log(`   · ${c.name}  lines=${c.lines}  qty=${c.qtySum}`)
}
console.log('wrote', OUT)
