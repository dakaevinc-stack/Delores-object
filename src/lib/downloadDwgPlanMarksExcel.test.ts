import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildDwgPlanMarksSheetAoa,
  buildDwgPlanMarksWorkbookBuffer,
} from './downloadDwgPlanMarksExcel'

const sampleMarks = [
  {
    id: 'm-1',
    siteId: 'export-site',
    fileId: 'plan-1',
    kind: 'ckkb' as const,
    space: 'plan' as const,
    shape: {
      type: 'zone' as const,
      outline: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      areaM2: 142.4,
    },
    text: 'участок А',
    author: 'иванов',
    n: 1,
    createdAtIso: '2026-08-31T12:00:00.000Z',
    updatedAtIso: '2026-08-31T12:00:00.000Z',
  },
]

describe('downloadDwgPlanMarksExcel', () => {
  it('builds readable row data with capitalization', () => {
    const table = buildDwgPlanMarksSheetAoa(sampleMarks, {
      siteName: 'Брусилова',
      planName: 'Генплан.dwg',
    })
    expect(table[0][0]).toBe('Реестр отметок на плане')
    expect(table[5][3]).toBe('Участок А')
    expect(table[5][4]).toBe('Иванов')
  })

  it('creates a clean branded workbook layout', async () => {
    const buffer = await buildDwgPlanMarksWorkbookBuffer(
      sampleMarks,
      { siteName: 'Брусилова', planName: '02_Покрытия_Брусилова.dwg' },
      null,
    )
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer)
    const sheet = book.getWorksheet('Отметки')
    expect(sheet!.getCell('C1').value).toBe('Реестр отметок на плане')
    expect(sheet!.getCell('A9').value).toBe('№')
    expect(sheet!.getCell('D10').value).toBe('Участок А')
    expect(sheet!.getCell('E10').value).toBe('Иванов')
    expect(sheet!.getColumn(1).width).toBe(11)
    expect(sheet!.getColumn(2).width).toBe(13)
    expect(sheet!.getRow(1).height).toBe(18)
    expect(sheet!.getRow(2).height).toBe(18)
    expect(sheet!.getRow(3).height).toBe(18)
    expect(sheet!.views?.[0]?.showGridLines).toBe(false)
  })
})
