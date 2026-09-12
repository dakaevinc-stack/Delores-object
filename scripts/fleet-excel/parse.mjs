/**
 * Разбор рабочих таблиц парка в структуру проекта.
 *
 * Вход:
 *   1) «База ТС …xlsx», лист БАЗА  — реестр: номера, VIN, ОСАГО, ГТО, СТС/ПТС, пропуска
 *      листы «ремонты», «остатки ГСМ» — плановое ТО и пробег/ГСМ
 *   2) «Бортовой журнал.xlsx»       — по листу на машину: ремонты с ценами
 *
 * Модуль только читает и нормализует. Запись в проект — в build-data.mjs,
 * чтобы разбор можно было проверять отдельно от генерации.
 */

import ExcelJS from 'exceljs'

/* ============================================================
   Номера: в таблицах вперемешку латиница/кириллица и лишние пробелы
   ============================================================ */

/** Латинские двойники русских букв, допустимых в госномерах. */
const LATIN_TO_CYRILLIC = {
  A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н',
  O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х',
}

/**
 * Ключ для сверки номеров между файлами: только буквы/цифры, кириллица.
 *
 * Дополнительно лечим частую опечатку в таблицах — цифру «0» на месте буквы
 * «О» («Н 900 В0 977»). Иначе одна и та же машина не сходится между листами.
 */
export function plateKey(raw) {
  if (raw == null) return ''
  const s = String(raw).toUpperCase().replace(/[^0-9A-ZА-Я]/g, '')
  let out = ''
  for (const ch of s) out += LATIN_TO_CYRILLIC[ch] ?? ch
  if ((out.length === 8 || out.length === 9) && /^[А-Я0]\d{3}[А-Я0]{2}\d{2,3}$/.test(out)) {
    out =
      out[0].replace('0', 'О') +
      out.slice(1, 4) +
      out.slice(4, 6).replace(/0/g, 'О') +
      out.slice(6)
  }
  return out
}

/**
 * Похоже ли значение на госномер (а не на модель, примечание или ссылку).
 * Нужно, чтобы в шапках листов не принять за номер что-то вроде «Содержание!A1».
 */
export function looksLikePlate(raw) {
  const key = plateKey(raw)
  if (String(raw ?? '').includes('!')) return false
  return (
    /^[А-Я]\d{3}[А-Я]{2}\d{2,3}$/.test(key) || // А123ВС77
    /^\d{2,3}[А-Я]{2}\d{4}$/.test(key) || //      77АВ1234 (самоходные)
    /^[А-Я]{2}\d{4}\d{2,3}$/.test(key) //         АВ123477 (прицепы)
  )
}

/* ============================================================
   VIN: в таблицах вперемешку кириллица/латиница и мусор в конце
   ============================================================ */

const CYRILLIC_TO_LATIN = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H',
  О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
}

/** Ключ для сверки VIN между файлами: латиница, только буквы/цифры. */
export function vinKey(raw) {
  if (raw == null) return ''
  const s = String(raw).toUpperCase().replace(/[^0-9A-ZА-Я]/g, '')
  let out = ''
  for (const ch of s) out += CYRILLIC_TO_LATIN[ch] ?? ch
  return out
}

/** Длина полного VIN по стандарту. */
const VIN_LENGTH = 17

/**
 * Совпадают ли VIN. Строгое равенство либо совпадение по началу — у части
 * машин в таблице к VIN дописаны пометки («…(6)», «…/OF5110»).
 *
 * Совпадение по началу требует полных 17 знаков: у однотипных машин из одной
 * партии первые символы совпадают. Например у двух КАМАЗов
 * `XTC652005K1407605` и `XTC652005K1409565` одинаковы первые 13 знаков —
 * по короткому совпадению они склеились бы в одну машину.
 */
export function vinMatches(a, b) {
  const x = vinKey(a)
  const y = vinKey(b)
  if (!x || !y || x.length < 8 || y.length < 8) return false
  if (x === y) return true
  const short = x.length <= y.length ? x : y
  const long = x.length <= y.length ? y : x
  return short.length >= VIN_LENGTH && long.startsWith(short)
}

/** Человекочитаемый номер: кириллица, аккуратные пробелы. */
export function formatPlate(raw) {
  const key = plateKey(raw)
  if (!key) return ''
  // А123ВС77(7) — легковые/грузовые
  let m = /^([А-Я])(\d{3})([А-Я]{2})(\d{2,3})$/.exec(key)
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  // 77АВ1234 — самоходные машины (номер спецтехники)
  m = /^(\d{2,3})([А-Я]{2})(\d{4})$/.exec(key)
  if (m) return `${m[1]} ${m[2]} ${m[3]}`
  // АВ123477 — прицепы
  m = /^([А-Я]{2})(\d{4})(\d{2,3})$/.exec(key)
  if (m) return `${m[1]} ${m[2]} ${m[3]}`
  return key
}

/* ============================================================
   Даты: в таблице встречаются Date, «01.04.2027», «09.2026»,
   «не нужен», «закончился», а также опечатки «19.19.2023»
   ============================================================ */

const MONTH_ONLY = /^(\d{1,2})[.\s/](\d{4})$/
const FULL_DATE = /^(\d{1,2})[.\s/](\d{1,2})[.\s/](\d{2,4})$/

/** Текстовые пометки вместо даты — это не дата, а состояние. */
const STATUS_WORDS = [
  'не нужен', 'не нужна', 'не нужно', 'нет', 'закончился', 'закончилась',
  'не страхуется', 'отсутствует', 'просрочен', 'просрочена', 'утеряна',
]

export function isStatusWord(value) {
  if (value == null) return false
  const s = String(value).trim().toLowerCase()
  if (!s) return false
  return STATUS_WORDS.some((w) => s.startsWith(w))
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/**
 * Приводит значение к ISO-дате.
 * @returns {{iso: string|null, issue: string|null, raw: string}}
 */
export function parseDate(value) {
  const raw = value == null ? '' : String(value).trim()
  if (!raw) return { iso: null, issue: null, raw }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      iso: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
      issue: null,
      raw,
    }
  }
  if (isStatusWord(raw)) return { iso: null, issue: null, raw }

  // Ячейки-даты приходят сюда уже приведёнными к ISO
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (m) {
    const month = Number(m[2])
    const day = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { iso: null, issue: `нереальная дата «${raw}»`, raw }
    }
    return { iso: raw, issue: null, raw }
  }

  m = FULL_DATE.exec(raw)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    let year = Number(m[3])
    if (year < 100) year += 2000
    if (month < 1 || month > 12) {
      // «19.19.2023», «14.14.2023» — месяц явно опечатка, дату не выдумываем
      return { iso: null, issue: `нереальный месяц в «${raw}»`, raw }
    }
    if (day < 1 || day > 31) return { iso: null, issue: `нереальный день в «${raw}»`, raw }
    return { iso: `${year}-${pad(month)}-${pad(day)}`, issue: null, raw }
  }

  m = MONTH_ONLY.exec(raw)
  if (m) {
    const month = Number(m[1])
    const year = Number(m[2])
    if (month < 1 || month > 12) return { iso: null, issue: `нереальный месяц в «${raw}»`, raw }
    // Указан только месяц — берём последний день: срок действует до конца месяца
    const last = new Date(year, month, 0).getDate()
    return { iso: `${year}-${pad(month)}-${pad(last)}`, issue: null, raw, monthOnly: true }
  }

  return { iso: null, issue: `не распознана дата «${raw}»`, raw }
}

/** «№ СТС 99 73 019574 от 02.04.2025» → номер + дата выдачи. */
export function splitDocAndDate(value) {
  const raw = value == null ? '' : String(value).trim()
  if (!raw) return { number: '', issuedIso: null, issue: null }
  const m = /^(.*?)\s*от\s*([\d.\s/]+)$/i.exec(raw)
  if (!m) return { number: raw, issuedIso: null, issue: null }
  const parsed = parseDate(m[2].trim())
  return {
    number: m[1].trim(),
    issuedIso: parsed.iso,
    issue: parsed.issue ? `дата выдачи: ${parsed.issue}` : null,
  }
}

/* ============================================================
   Флаги «V / нет / не нужен»
   ============================================================ */

/** @returns {'yes'|'no'|'not-required'|'unknown'} */
export function parseFlag(value) {
  const s = value == null ? '' : String(value).trim().toLowerCase()
  if (!s) return 'unknown'
  if (s === 'v' || s === 'v.' || s === 'да' || s === '+') return 'yes'
  if (s.startsWith('не нужен') || s.startsWith('не нужн')) return 'not-required'
  if (s.startsWith('нет') || s === '-') return 'no'
  return 'unknown'
}

export function parseNumber(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/* ============================================================
   Категории листа БАЗА → id категорий проекта
   ============================================================ */

export const CATEGORY_BY_TITLE = {
  'легковые автомобили': 'cars',
  'малотоннажные автомобили': 'light-trucks',
  'автобусы': 'buses',
  'автомобили специальные': 'special-trucks',
  'самосвалы': 'dump-trucks',
  'седельные тягачи': 'road-tractors',
  'полуприцепы (прицепы)': 'trailers',
  'фронтальные погрузчики': 'front-loaders',
  'минипогрузчики': 'mini-loaders',
  'экскаваторы погрузчики': 'backhoes',
  'экскаваторы': 'excavators',
  'катки': 'rollers',
  'асфальтоукладчики': 'pavers',
  'фрезы': 'cold-mills',
}

/** Колонки листа БАЗА (1-based, как в Excel). */
const COL = {
  plate: 4,
  vin: 5,
  model: 6,
  year: 7,
  licenseCategory: 8,
  sts: 9,
  pts: 10,
  osagoNumber: 11,
  osagoUntil: 12,
  owner: 13,
  dkNumber: 14,
  dkUntil: 15,
  wialon: 16,
  fuelSensor: 17,
  transponder: 18,
  platon: 19,
  tachograph: 20,
  moscowPass: 21,
  entryZone: 22,
  leaseEnd: 23,
  workTypes: 24,
  notes: 25,
}

function cellValue(cell) {
  const v = cell?.value
  if (v == null) return null
  if (typeof v === 'object') {
    if (v instanceof Date) return v
    // формулы и rich text
    if ('result' in v) return v.result ?? null
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return v.text
  }
  return v
}

function text(cell) {
  const v = cellValue(cell)
  if (v == null) return ''
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  return String(v).replace(/\s+/g, ' ').trim()
}

/** Значения #REF!/#N/A от битых формул считаем пустыми. */
function isBrokenRef(value) {
  return typeof value === 'string' && value.startsWith('#')
}

export async function parseRegistry(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('БАЗА')
  if (!ws) throw new Error('лист «БАЗА» не найден')

  const vehicles = []
  const issues = []
  let categoryId = null
  let categoryTitle = null

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const cells = []
    for (let c = 1; c <= 25; c++) cells.push(text(row.getCell(c)))
    const filled = cells.filter((v) => v && !isBrokenRef(v))
    if (filled.length === 0) return

    /* Строка-заголовок категории объединена по нескольким колонкам, и ExcelJS
       повторяет значение во всех ячейках объединения — поэтому смотрим на
       множество различных значений, а не на их количество. */
    const distinct = [...new Set(filled)]
    if (distinct.length === 1) {
      const title = distinct[0]
      const mapped = CATEGORY_BY_TITLE[title.toLowerCase()]
      if (mapped) {
        categoryId = mapped
        categoryTitle = title
      } else {
        issues.push({ row: rowNumber, level: 'warn', message: `неизвестная категория «${title}»` })
      }
      return
    }

    const plateRaw = cells[COL.plate - 1]
    const model = cells[COL.model - 1]
    const vinRaw = cells[COL.vin - 1]
    /* Прицеп без госномера — не повод терять машину: она есть в парке и в
       ремонтах, опознаём её по VIN. */
    if (!plateRaw && !vinRaw) {
      if (model) {
        issues.push({
          row: rowNumber,
          level: 'error',
          message: `нет ни госномера, ни VIN у «${model}» — строка пропущена`,
        })
      }
      return
    }
    if (!plateRaw) {
      issues.push({
        row: rowNumber,
        level: 'warn',
        message: `«${model}» без госномера — опознаём по VIN ${vinRaw}`,
      })
    }
    const label = plateRaw || `VIN ${vinRaw}`
    if (!categoryId) {
      issues.push({ row: rowNumber, level: 'error', message: `${label}: категория не определена` })
      return
    }

    const push = (issue) => {
      if (issue) issues.push({ row: rowNumber, level: 'warn', message: `${label}: ${issue}` })
    }

    const sts = splitDocAndDate(cells[COL.sts - 1])
    push(sts.issue && `СТС — ${sts.issue}`)
    const pts = splitDocAndDate(cells[COL.pts - 1])
    push(pts.issue && `ПТС — ${pts.issue}`)

    const osagoNumberRaw = cells[COL.osagoNumber - 1]
    const osagoNotRequired = isStatusWord(osagoNumberRaw)
    const osagoUntil = parseDate(cells[COL.osagoUntil - 1])
    push(osagoUntil.issue && `ОСАГО — ${osagoUntil.issue}`)

    const dkUntil = parseDate(cells[COL.dkUntil - 1])
    push(dkUntil.issue && `ГТО — ${dkUntil.issue}`)

    const moscowRaw = cells[COL.moscowPass - 1]
    const moscowPass = parseDate(moscowRaw)
    push(moscowPass.issue && `пропуск в Москву — ${moscowPass.issue}`)

    const leaseEnd = parseDate(cells[COL.leaseEnd - 1])
    push(leaseEnd.issue && `лизинг — ${leaseEnd.issue}`)

    const year = parseNumber(cells[COL.year - 1])

    vehicles.push({
      row: rowNumber,
      categoryId,
      categoryTitle,
      plate: plateRaw ? formatPlate(plateRaw) : '',
      /* Ключ машины: госномер, а если его нет — VIN. */
      plateKey: plateRaw ? plateKey(plateRaw) : vinKey(vinRaw),
      plateRaw,
      vinOrFrame: vinRaw,
      model,
      year: year && year > 1900 && year < 2100 ? year : null,
      licenseCategory: cells[COL.licenseCategory - 1].toUpperCase() || null,
      registrationCertificate: sts.number || null,
      registrationCertificateIssuedIso: sts.issuedIso,
      vehiclePassport: pts.number || null,
      vehiclePassportIssuedIso: pts.issuedIso,
      osago: {
        policyNumber: osagoNotRequired ? null : osagoNumberRaw || null,
        validUntilIso: osagoUntil.iso,
        notRequired: osagoNotRequired,
        rawUntil: osagoUntil.raw || null,
      },
      inspection: {
        cardNumber: cells[COL.dkNumber - 1] || null,
        validUntilIso: dkUntil.iso,
        rawUntil: dkUntil.raw || null,
      },
      registeredOwner: cells[COL.owner - 1] || null,
      wialon: parseFlag(cells[COL.wialon - 1]),
      fuelSensor: parseFlag(cells[COL.fuelSensor - 1]),
      transponder: parseFlag(cells[COL.transponder - 1]),
      platon: parseFlag(cells[COL.platon - 1]),
      tachograph: parseFlag(cells[COL.tachograph - 1]),
      moscowPass: {
        validUntilIso: moscowPass.iso,
        raw: moscowRaw || null,
      },
      entryZone: cells[COL.entryZone - 1] || null,
      leaseEndIso: leaseEnd.iso,
      workTypes: cells[COL.workTypes - 1] || null,
      notes: cells[COL.notes - 1] || null,
    })
  })

  return { vehicles, issues }
}

/* ============================================================
   Бортовой журнал: по листу на машину
   ============================================================ */

const JOURNAL_HEADER = 'дата документа'

/**
 * Листы журнала, где в шапке нет госномера — только модель.
 * Опознаны по модели и году: в реестре такая машина ровно одна.
 * Если добавится новая — сборка упадёт с явной ошибкой, а не промолчит.
 */
export const JOURNAL_SHEET_PLATES = {
  'К 320': 'М 320 КО 977', // «Самосвал Камаз 6520», в реестре один КАМАЗ с 320
  'Case 570': '77 МХ 0605', // единственный Case 570SТ в реестре
  'Sanny 330': '77 РМ 7948', // единственный Sany SY 330H в реестре
}

export async function parseJournal(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const byPlate = new Map()
  const issues = []
  const skipped = []

  for (const ws of wb.worksheets) {
    if (ws.name.toLowerCase() === 'содержание') continue

    /* Шапка листа: номер | VIN | модель | год. Ищем строку, где первая
       непустая ячейка — госномер; VIN и модель берём из соседних колонок. */
    let plateRaw = ''
    let vinRaw = ''
    let model = ''
    let year = null
    let headerRow = 0
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
      const row = ws.getRow(r)
      for (let c = 1; c <= 8; c++) {
        const v = text(row.getCell(c))
        if (!v) continue
        if (v.toLowerCase().startsWith(JOURNAL_HEADER)) {
          headerRow = r
          break
        }
        if (!plateRaw && looksLikePlate(v)) {
          plateRaw = v
          vinRaw = text(row.getCell(c + 1))
          model = text(row.getCell(c + 2))
          year = parseNumber(text(row.getCell(c + 3)))
        }
      }
      if (headerRow) break
    }

    if (!plateRaw && JOURNAL_SHEET_PLATES[ws.name]) {
      plateRaw = JOURNAL_SHEET_PLATES[ws.name]
      // модель/год в такой шапке сдвинуты: берём из строки над таблицей
      const row = ws.getRow(Math.max(1, headerRow - 2))
      model = model || text(row.getCell(4))
      year = year ?? parseNumber(text(row.getCell(5)))
    }

    if (!plateRaw || !headerRow) {
      skipped.push({
        sheet: ws.name,
        reason: !plateRaw ? 'не найден госномер' : 'не найдена шапка таблицы',
      })
      continue
    }

    // Пробег/наработку пишут не во всех листах — ищем колонку по шапке
    let mileageCol = 0
    const headerCells = ws.getRow(headerRow)
    for (let c = 5; c <= 12; c++) {
      if (text(headerCells.getCell(c)).toLowerCase().startsWith('пробег')) mileageCol = c
    }

    const key = plateKey(plateRaw)
    const records = []
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const first = text(row.getCell(1))
      if (first.toLowerCase().startsWith('итого')) break
      const dateCell = cellValue(row.getCell(1))
      const docNumber = text(row.getCell(2))
      const supplier = text(row.getCell(3))
      const work = text(row.getCell(4))
      const total = parseNumber(cellValue(row.getCell(5)))
      const parts = parseNumber(cellValue(row.getCell(6)))
      const labor = parseNumber(cellValue(row.getCell(7)))
      const mileage = mileageCol ? parseNumber(cellValue(row.getCell(mileageCol))) : null

      const hasContent = docNumber || supplier || work || (total != null && total !== 0)
      if (!hasContent) continue

      const parsedDate = parseDate(dateCell)
      if (!parsedDate.iso) {
        issues.push({
          sheet: ws.name,
          level: 'warn',
          message: `${plateRaw}: запись без даты (${work || docNumber || 'без описания'})`,
        })
      }
      records.push({
        dateIso: parsedDate.iso,
        docNumber: docNumber || null,
        supplier: supplier || null,
        work: work || null,
        totalRub: total,
        partsRub: parts,
        laborRub: labor,
        mileage,
      })
    }

    if (byPlate.has(key)) {
      issues.push({ sheet: ws.name, level: 'warn', message: `${plateRaw}: несколько листов на одну машину` })
      byPlate.get(key).records.push(...records)
      continue
    }
    byPlate.set(key, {
      sheet: ws.name,
      plateRaw,
      plate: formatPlate(plateRaw),
      plateKey: key,
      vinOrFrame: vinRaw || null,
      model: model || null,
      year: year && year > 1900 && year < 2100 ? year : null,
      records,
    })
  }

  return { byPlate, issues, skipped }
}

/* ============================================================
   Лист «остатки ГСМ»: последний известный одометр
   ============================================================ */

const MONTH_NAMES = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
]

/**
 * Шапка листа ГСМ: «01.04.2025», «01 мая», «01 июня»… — дату снятия показаний
 * нужно сохранить, иначе в карточке будет непонятно, на какое число пробег.
 */
function fuelColumnDates(ws) {
  const header = ws.getRow(1)
  const dates = new Map()
  let baseYear = null
  for (let c = 3; c <= ws.columnCount; c += 2) {
    const raw = cellValue(header.getCell(c))
    if (raw instanceof Date) {
      baseYear = raw.getFullYear()
      dates.set(c, `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`)
      continue
    }
    const s = String(raw ?? '').trim().toLowerCase()
    if (!s) continue
    const m = /^(\d{1,2})\s+([а-я]+)/.exec(s)
    if (!m || baseYear == null) continue
    const monthIndex = MONTH_NAMES.findIndex((name) => m[2].startsWith(name))
    if (monthIndex < 0) continue
    dates.set(c, `${baseYear}-${pad(monthIndex + 1)}-${pad(Number(m[1]))}`)
  }
  return dates
}

export async function parseFuelLog(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('остатки ГСМ')
  if (!ws) return { byPlate: new Map(), issues: [] }

  const columnDates = fuelColumnDates(ws)
  const byPlate = new Map()
  const issues = []

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 2) return
    const plateRaw = text(row.getCell(1))
    const key = plateKey(plateRaw)
    // В первой колонке бывают заметки («777», «моя») — это не номера
    if (!looksLikePlate(plateRaw) || key.length < 6) return

    let meter = null
    let meterDateIso = null
    let fuelLiters = null
    for (let c = 3; c <= ws.columnCount; c += 2) {
      const value = parseNumber(cellValue(row.getCell(c)))
      const fuel = parseNumber(cellValue(row.getCell(c + 1)))
      if (value != null && value > 0) {
        meter = value
        meterDateIso = columnDates.get(c) ?? meterDateIso
      }
      if (fuel != null) fuelLiters = fuel
    }
    if (meter == null) return
    byPlate.set(key, {
      plate: formatPlate(plateRaw),
      plateKey: key,
      model: text(row.getCell(2)) || null,
      /** Одометр (км) или наработка (моточасы) — зависит от вида техники. */
      meter,
      meterDateIso,
      fuelLiters,
    })
  })

  return { byPlate, issues }
}

/* ============================================================
   Лист «ремонты»: плановое ТО и открытые работы с пробегом
   ============================================================ */

export async function parseServiceSheet(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('ремонты')
  if (!ws) return { byPlate: new Map(), issues: [] }

  const byPlate = new Map()
  const issues = []
  let categoryId = null

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    /* Лист разбит на разделы по видам техники. Заголовок объединён по
       колонкам, поэтому в колонке номера стоит название раздела. */
    const plateRaw = text(row.getCell(4))
    const asCategory = CATEGORY_BY_TITLE[plateRaw.toLowerCase()]
    if (asCategory) {
      categoryId = asCategory
      return
    }
    const vinRaw = text(row.getCell(5))
    const key = plateKey(plateRaw)
    if (!vinRaw && !looksLikePlate(plateRaw)) return
    const work = text(row.getCell(7))
    // Колонка «ТО пройден» — показания счётчика на момент последнего ТО
    const meterAtService = parseNumber(cellValue(row.getCell(8)))
    byPlate.set(key || vinKey(vinRaw), {
      row: rowNumber,
      categoryId,
      plate: formatPlate(plateRaw),
      plateKey: key,
      vinOrFrame: vinRaw || null,
      model: text(row.getCell(6)) || null,
      work: work || null,
      meterAtService,
    })
  })

  return { byPlate, issues }
}

/* ============================================================
   Лист «тралы»: габариты и грузоподъёмность сцепок
   ============================================================ */

export async function parseTrailers(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('тралы')
  if (!ws) return { byPlate: new Map(), issues: [] }

  const byPlate = new Map()
  const issues = []

  ws.eachRow({ includeEmpty: false }, (row) => {
    const plateRaw = text(row.getCell(3))
    if (!looksLikePlate(plateRaw)) return
    const key = plateKey(plateRaw)
    if (!key) return
    const lengthCm = parseNumber(cellValue(row.getCell(5)))
    const maxMassKg = parseNumber(cellValue(row.getCell(6)))
    const payloadKg = parseNumber(cellValue(row.getCell(7)))
    const axleCount = parseNumber(cellValue(row.getCell(8)))
    byPlate.set(key, {
      plate: formatPlate(plateRaw),
      plateKey: key,
      /** Название сцепки («сцепка 1») — тягач и полуприцеп работают парой. */
      coupling: text(row.getCell(1)) || null,
      registeredOwner: text(row.getCell(4)) || null,
      lengthCm,
      maxMassKg,
      payloadKg,
      axleCount,
    })
  })

  return { byPlate, issues }
}
