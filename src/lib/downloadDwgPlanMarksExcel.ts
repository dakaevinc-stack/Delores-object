import {
  buildDwgPlanMarkExportRows,
  type DwgPlanMark,
  type DwgPlanMarkKind,
  type DwgPlanMarksExportContext,
} from './dwgPlanMarksRepository'
import type { Alignment, Borders, Cell, Fill, Font, Worksheet } from 'exceljs'

type SheetCell = string | number

export type BrandLogoAsset = {
  base64: string
  width: number
  height: number
}

const COLS = 6
const META_LABEL_ROW = 6
const META_VALUE_ROW = 7
const HEADER_ROW = 9
const DATA_START_ROW = 10

/** A–B — зона логотипа (фиксированная); C–F — данные. */
const COL_MIN = [11, 13, 15, 22, 14, 19] as const
const COL_MAX = [11, 13, 17, 58, 24, 28] as const
const LOGO_COL_WIDTHS = [11, 13] as const
const HEADER_BAND_ROWS = 3
const HEADER_BAND_ROW_PT = 18
/** Excel: 1 символ ширины ≈ 7 px, 1 pt высоты ≈ 96/72 px */
const COL_PX = 7
const PT_PX = 96 / 72

/** Палитра бренда: тёмный navy + красный акцент из logotype */
const C = {
  navy: 'FF1A202C',
  navySoft: 'FF2D3748',
  red: 'FFE53E3E',
  paper: 'FFFFFFFF',
  zebra: 'FFF9FAFB',
  line: 'FFE5E7EB',
  lineStrong: 'FFD1D5DB',
  label: 'FF6B7280',
  text: 'FF111827',
  muted: 'FF9CA3AF',
  footerBg: 'FFF3F4F6',
} as const

const STATUS: Record<DwgPlanMarkKind, { fill: string; text: string; edge: string }> = {
  accepted: { fill: 'FFECFDF5', text: 'FF047857', edge: 'FF10B981' },
  ckkb: { fill: 'FFF5F3FF', text: 'FF6D28D9', edge: 'FFA78BFA' },
  issue: { fill: 'FFFEF2F2', text: 'FFB91C1C', edge: 'FFEF4444' },
  note: { fill: 'FFFFFBEB', text: 'FFB45309', edge: 'FFF59E0B' },
  marker: { fill: 'FFF8FAFC', text: 'FF334155', edge: 'FF94A3B8' },
}

const HEADERS = ['№', 'Статус', 'Площадь, м²', 'Описание', 'Автор', 'Дата'] as const
const FONT = 'Calibri'

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('logo read failed'))
    reader.readAsDataURL(blob)
  })
}

function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('logo decode failed'))
    }
    img.src = url
  })
}

/** Логотип «Деловые Решения» для шапки отчёта. */
export async function loadBrandLogoAsset(): Promise<BrandLogoAsset | null> {
  if (typeof fetch === 'undefined') return null
  try {
    const res = await fetch('/brand-logotype.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const [base64, dims] = await Promise.all([blobToBase64(blob), measureImage(blob)])
    /** Высота логотипа под шапку 3×18 pt ≈ 72 px, с равными полями. */
    const height = 42
    const width = Math.round((dims.width / dims.height) * height)
    return { base64, width, height }
  } catch {
    return null
  }
}

function sanitizeFileToken(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'объект'
}

function formatExportStamp(): string {
  const raw = new Date().toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return raw.charAt(0).toLocaleUpperCase('ru-RU') + raw.slice(1)
}

function formatTotalArea(m2: number): string {
  if (m2 >= 10_000) {
    return `${(m2 / 10_000).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га`
  }
  return `${m2.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м²`
}

function plainText(value: string): string {
  return value === '—' ? '' : value
}

function cellText(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function fill(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function edge(color: string, style: 'thin' | 'medium' | 'hair' = 'thin'): Borders['top'] {
  return { style, color: { argb: color } }
}

function hLine(color: string = C.line): Partial<Borders> {
  return { bottom: edge(color) }
}

function setCell(
  cell: Cell,
  value: string | number | null | undefined,
  opts: {
    font?: Partial<Font>
    fg?: string
    align?: Partial<Alignment>
    border?: Partial<Borders>
    numFmt?: string
    wrap?: boolean
  } = {},
): void {
  cell.value = value ?? ''
  cell.font = { name: FONT, size: 11, color: { argb: C.text }, ...opts.font }
  if (opts.fg) cell.fill = fill(opts.fg)
  cell.alignment = {
    vertical: 'middle',
    wrapText: opts.wrap ?? false,
    ...opts.align,
  }
  if (opts.border) cell.border = opts.border
  if (opts.numFmt) cell.numFmt = opts.numFmt
}

function textWidth(chars: number): number {
  return Math.min(COL_MAX[3], Math.max(COL_MIN[3], chars * 0.92 + 2))
}

function rowHeight(text: string, colWidth: number, base = 22): number {
  if (!text) return base
  const perLine = Math.max(12, Math.floor(colWidth * 1.05))
  const lines = Math.ceil(text.length / perLine)
  return Math.min(108, base + (lines - 1) * 14)
}

function autoFit(sheet: Worksheet, top: number, bottom: number): void {
  /** Колонки A–B не трогаем — под них рассчитана зона логотипа. */
  for (let col = 3; col <= COLS; col += 1) {
    let max: number = COL_MIN[col - 1]
    for (let row = top; row <= bottom; row += 1) {
      max = Math.max(max, cellText(sheet.getRow(row).getCell(col).value).length)
    }
    sheet.getColumn(col).width = Math.min(COL_MAX[col - 1], Math.max(COL_MIN[col - 1], max + 2))
  }
  sheet.getColumn(1).width = LOGO_COL_WIDTHS[0]
  sheet.getColumn(2).width = LOGO_COL_WIDTHS[1]
}

/** Дробная колонка/строка для центрирования картинки в прямоугольнике A1:B3. */
function logoTopLeft(logo: BrandLogoAsset): { col: number; row: number } {
  const zoneW = (LOGO_COL_WIDTHS[0] + LOGO_COL_WIDTHS[1]) * COL_PX
  const zoneH = HEADER_BAND_ROWS * HEADER_BAND_ROW_PT * PT_PX
  const padX = Math.max(0, (zoneW - logo.width) / 2)
  const padY = Math.max(0, (zoneH - logo.height) / 2)

  const col1W = LOGO_COL_WIDTHS[0] * COL_PX
  const col =
    padX <= col1W ? padX / col1W : 1 + (padX - col1W) / (LOGO_COL_WIDTHS[1] * COL_PX)

  const rowH = HEADER_BAND_ROW_PT * PT_PX
  const row = padY / rowH
  return { col, row }
}

/** Строки — для тестов. */
export function buildDwgPlanMarksSheetAoa(
  marks: readonly DwgPlanMark[],
  ctx: DwgPlanMarksExportContext = {},
): SheetCell[][] {
  const rows = buildDwgPlanMarkExportRows(marks)
  const totalArea = rows.reduce((s, r) => s + (r.areaM2 ?? 0), 0)
  const table: SheetCell[][] = [
    ['Реестр отметок на плане'],
    [],
    ['Объект', ctx.siteName?.trim() || '—', 'План', ctx.planName?.trim() || '—', 'Дата', formatExportStamp()],
    [],
    [...HEADERS],
  ]
  for (const row of rows) {
    table.push([
      row.n ?? '',
      row.status,
      row.areaM2 != null ? Math.round(row.areaM2 * 100) / 100 : '',
      plainText(row.comment) || '—',
      plainText(row.author) || '—',
      plainText(row.dateLabel) || '—',
    ])
  }
  if (rows.length > 0) {
    table.push(['Итого', `${rows.length} отм.`, totalArea > 0 ? Math.round(totalArea * 100) / 100 : ''])
  }
  return table
}

function paintHeaderBlock(
  sheet: Worksheet,
  siteName: string,
  summary: string,
  logo: BrandLogoAsset | null | undefined,
): void {
  sheet.getColumn(1).width = LOGO_COL_WIDTHS[0]
  sheet.getColumn(2).width = LOGO_COL_WIDTHS[1]

  for (let r = 1; r <= HEADER_BAND_ROWS; r += 1) {
    sheet.getRow(r).height = HEADER_BAND_ROW_PT
  }
  sheet.getRow(4).height = 6
  sheet.getRow(5).height = 6

  /** Зона логотипа A1:B3 — чистый прямоугольник с равными полями. */
  sheet.mergeCells(1, 1, HEADER_BAND_ROWS, 2)
  setCell(sheet.getCell(1, 1), '', {
    fg: C.paper,
    border: { bottom: edge(C.red, 'medium') },
  })

  /** Текстовый блок справа — выровнен по вертикали к той же полосе. */
  sheet.mergeCells(1, 3, 1, COLS)
  setCell(sheet.getCell(1, 3), 'Реестр отметок на плане', {
    font: { size: 18, bold: true, color: { argb: C.navy } },
    fg: C.paper,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: { bottom: edge(C.line, 'hair') },
  })

  sheet.mergeCells(2, 3, 2, COLS)
  setCell(sheet.getCell(2, 3), `${siteName} · ${summary}`, {
    font: { size: 11, color: { argb: C.label } },
    fg: C.paper,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
  })

  sheet.mergeCells(3, 3, 3, COLS)
  setCell(sheet.getCell(3, 3), 'Когда бизнес — личное.', {
    font: { size: 10, italic: true, color: { argb: C.red } },
    fg: C.paper,
    align: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: { bottom: edge(C.red, 'medium') },
  })

  if (logo) {
    const imageId = sheet.workbook.addImage({ base64: logo.base64, extension: 'png' })
    const tl = logoTopLeft(logo)
    sheet.addImage(imageId, {
      tl,
      ext: { width: logo.width, height: logo.height },
      editAs: 'oneCell',
    })
  } else {
    setCell(sheet.getCell(1, 1), 'Деловые\nРешения', {
      font: { size: 12, bold: true, color: { argb: C.navy } },
      fg: C.paper,
      align: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: { bottom: edge(C.red, 'medium') },
    })
  }
}

function paintMeta(sheet: Worksheet, siteName: string, planName: string, stamp: string): void {
  const blocks: Array<[string, string]> = [
    ['Объект', siteName],
    ['План', planName],
    ['Дата', stamp],
  ]
  blocks.forEach(([label, value], i) => {
    const c0 = i * 2 + 1
    const c1 = c0 + 1
    sheet.mergeCells(META_LABEL_ROW, c0, META_LABEL_ROW, c1)
    sheet.mergeCells(META_VALUE_ROW, c0, META_VALUE_ROW, c1)

    setCell(sheet.getCell(META_LABEL_ROW, c0), label.toUpperCase(), {
      font: { size: 9, bold: true, color: { argb: C.label } },
      fg: C.footerBg,
      align: { horizontal: 'left', indent: 1 },
      border: hLine(C.line),
    })
    setCell(sheet.getCell(META_VALUE_ROW, c0), value, {
      font: { size: 11, bold: true, color: { argb: C.navy } },
      fg: C.paper,
      align: { horizontal: 'left', indent: 1, wrapText: true },
      border: { ...hLine(C.lineStrong), top: edge(C.line, 'hair') },
    })
  })
  sheet.getRow(META_LABEL_ROW).height = 18
  sheet.getRow(META_VALUE_ROW).height = 28
  sheet.getRow(8).height = 10
}

function paintTableHeader(sheet: Worksheet): void {
  const row = sheet.getRow(HEADER_ROW)
  row.height = 24
  HEADERS.forEach((title, i) => {
    const center = i === 0 || i === 2
    setCell(row.getCell(i + 1), title, {
      font: { size: 10, bold: true, color: { argb: C.paper } },
      fg: C.navy,
      align: { horizontal: center ? 'center' : 'left', indent: center ? 0 : 1 },
      border: {
        bottom: edge(C.red, 'medium'),
        top: edge(C.navy, 'thin'),
        left: edge(C.navy, 'hair'),
        right: edge(C.navy, 'hair'),
      },
    })
  })
}

function paintDataRow(
  sheet: Worksheet,
  rowNum: number,
  row: ReturnType<typeof buildDwgPlanMarkExportRows>[number],
  index: number,
): void {
  const bg = index % 2 === 0 ? C.paper : C.zebra
  const s = STATUS[row.kind]
  const excelRow = sheet.getRow(rowNum)
  const comment = plainText(row.comment) || '—'
  const author = plainText(row.author) || '—'
  const date = plainText(row.dateLabel) || '—'

  setCell(excelRow.getCell(1), row.n ?? '—', {
    font: { size: 11, bold: true, color: { argb: C.navySoft } },
    fg: bg,
    align: { horizontal: 'center' },
    border: hLine(C.line),
  })

  setCell(excelRow.getCell(2), row.status, {
    font: { size: 10, bold: true, color: { argb: s.text } },
    fg: s.fill,
    align: { horizontal: 'center' },
    border: { ...hLine(C.line), left: edge(s.edge, 'medium') },
  })

  if (row.areaM2 != null) {
    setCell(excelRow.getCell(3), Math.round(row.areaM2 * 100) / 100, {
      font: { size: 11, bold: true },
      fg: bg,
      align: { horizontal: 'center' },
      border: hLine(C.line),
      numFmt: '#,##0.00',
    })
  } else {
    setCell(excelRow.getCell(3), '—', {
      font: { size: 11, color: { argb: C.muted } },
      fg: bg,
      align: { horizontal: 'center' },
      border: hLine(C.line),
    })
  }

  setCell(excelRow.getCell(4), comment, {
    fg: bg,
    align: { horizontal: 'left', indent: 1, wrapText: true },
    border: hLine(C.line),
  })

  setCell(excelRow.getCell(5), author, {
    fg: bg,
    align: { horizontal: 'left', indent: 1 },
    border: hLine(C.line),
  })

  setCell(excelRow.getCell(6), date, {
    font: { size: 10, color: { argb: C.label } },
    fg: bg,
    align: { horizontal: 'left', indent: 1 },
    border: hLine(C.line),
  })

  excelRow.height = rowHeight(comment, textWidth(comment.length), 22)
}

function paintFooter(sheet: Worksheet, rowNum: number, count: number, totalArea: number): void {
  const row = sheet.getRow(rowNum)
  row.height = 26
  const countLabel =
    count === 1 ? '1 отметка' : count >= 2 && count <= 4 ? `${count} отметки` : `${count} отметок`

  setCell(row.getCell(1), 'Итого', {
    font: { size: 11, bold: true, color: { argb: C.navy } },
    fg: C.footerBg,
    align: { horizontal: 'center' },
    border: { top: edge(C.lineStrong, 'medium'), bottom: edge(C.lineStrong) },
  })

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  setCell(row.getCell(2), countLabel, {
    font: { size: 11, bold: true, color: { argb: C.navySoft } },
    fg: C.footerBg,
    align: { horizontal: 'left', indent: 1 },
    border: { top: edge(C.lineStrong, 'medium'), bottom: edge(C.lineStrong) },
  })

  if (totalArea > 0) {
    setCell(row.getCell(4), Math.round(totalArea * 100) / 100, {
      font: { size: 11, bold: true, color: { argb: C.navy } },
      fg: C.paper,
      align: { horizontal: 'center' },
      border: { top: edge(C.lineStrong, 'medium'), bottom: edge(C.lineStrong) },
      numFmt: '#,##0.00" м²"',
    })
  } else {
    setCell(row.getCell(4), '—', {
      font: { size: 11, color: { argb: C.muted } },
      fg: C.paper,
      align: { horizontal: 'center' },
      border: { top: edge(C.lineStrong, 'medium'), bottom: edge(C.lineStrong) },
    })
  }

  sheet.mergeCells(rowNum, 5, rowNum, COLS)
  setCell(row.getCell(5), 'Деловые Решения · отчёт по отметкам на плане', {
    font: { size: 9, color: { argb: C.muted } },
    fg: C.footerBg,
    align: { horizontal: 'right', indent: 1 },
    border: { top: edge(C.lineStrong, 'medium'), bottom: edge(C.lineStrong) },
  })
}

function frameTable(sheet: Worksheet, top: number, bottom: number): void {
  for (let r = top; r <= bottom; r += 1) {
    for (let c = 1; c <= COLS; c += 1) {
      const cell = sheet.getRow(r).getCell(c)
      const b = cell.border ?? {}
      cell.border = {
        ...b,
        left: c === 1 ? edge(C.lineStrong) : b.left,
        right: c === COLS ? edge(C.lineStrong) : b.right,
      }
    }
  }
}

export async function buildDwgPlanMarksWorkbookBuffer(
  marks: readonly DwgPlanMark[],
  ctx: DwgPlanMarksExportContext = {},
  logo?: BrandLogoAsset | null,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const siteName = ctx.siteName?.trim() || '—'
  const planName = ctx.planName?.trim() || '—'
  const rows = buildDwgPlanMarkExportRows(marks)
  const totalArea = rows.reduce((sum, row) => sum + (row.areaM2 ?? 0), 0)
  const summary = `${rows.length} ${rows.length === 1 ? 'отметка' : rows.length < 5 ? 'отметки' : 'отметок'} · ${formatTotalArea(totalArea)}`

  const book = new ExcelJS.Workbook()
  book.creator = 'Деловые Решения'
  book.created = new Date()

  const sheet = book.addWorksheet('Отметки', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, activeCell: 'A10', showGridLines: false }],
    properties: { defaultRowHeight: 22 },
  })

  for (let i = 0; i < COLS; i += 1) {
    sheet.getColumn(i + 1).width = COL_MIN[i]
  }

  paintHeaderBlock(sheet, siteName, summary, logo)
  paintMeta(sheet, siteName, planName, formatExportStamp())
  paintTableHeader(sheet)

  rows.forEach((row, index) => {
    paintDataRow(sheet, DATA_START_ROW + index, row, index)
  })

  const tableBottom = rows.length > 0 ? DATA_START_ROW + rows.length : HEADER_ROW
  if (rows.length > 0) {
    const footerRow = tableBottom + 1
    sheet.getRow(footerRow - 1).height = 6
    paintFooter(sheet, footerRow, rows.length, totalArea)
    frameTable(sheet, HEADER_ROW, footerRow)
    autoFit(sheet, HEADER_ROW, footerRow)
    for (let r = DATA_START_ROW; r <= footerRow; r += 1) {
      const comment = cellText(sheet.getRow(r).getCell(4).value)
      const w = sheet.getColumn(4).width ?? COL_MIN[3]
      sheet.getRow(r).height = Math.max(22, rowHeight(comment, w, 22))
    }
  } else {
    frameTable(sheet, HEADER_ROW, HEADER_ROW)
    autoFit(sheet, HEADER_ROW, HEADER_ROW)
  }

  sheet.pageSetup = {
    orientation: 'landscape',
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.5, header: 0.15, footer: 0.15 },
  }

  return book.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

export async function downloadDwgPlanMarksExcel(
  marks: readonly DwgPlanMark[],
  ctx: DwgPlanMarksExportContext = {},
): Promise<{ ok: true; fileName: string; count: number } | { ok: false; reason: string }> {
  const rows = buildDwgPlanMarkExportRows(marks)
  if (rows.length === 0) {
    return { ok: false, reason: 'Нет отметок для выгрузки' }
  }

  const logo = await loadBrandLogoAsset()
  const buffer = await buildDwgPlanMarksWorkbookBuffer(marks, ctx, logo)
  const siteToken = sanitizeFileToken(ctx.siteName?.trim() || 'объект')
  const day = new Date().toISOString().slice(0, 10)
  const fileName = `Отметки_${siteToken}_${day}.xlsx`

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)

  return { ok: true, fileName, count: rows.length }
}
