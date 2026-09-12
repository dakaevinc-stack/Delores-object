import { describe, expect, it } from 'vitest'
import {
  inferLegacyPlanWidth,
  rescalePlanMarksForImage,
  tombstonePlanMarksForFile,
  type DwgPlanMark,
  type DwgPlanMarkMap,
} from './dwgPlanMarksRepository'

const base = {
  siteId: 'site-1',
  fileId: 'file-1',
  kind: 'ckkb' as const,
  space: 'plan' as const,
  text: 'зона',
  author: 'Иванов',
  createdAtIso: '2026-09-01T10:00:00.000Z',
  updatedAtIso: '2026-09-01T10:00:00.000Z',
}

function zone(outline: Array<{ x: number; y: number }>, extra: Partial<DwgPlanMark> = {}): DwgPlanMark {
  return {
    ...base,
    id: 'm-1',
    shape: { type: 'zone', outline, areaM2: 42.5 },
    ...extra,
  }
}

/** Привязка «пиксели плана ↔ координаты чертежа» для плана шириной imgW. */
function mapFor(imgW: number, imgH: number): DwgPlanMarkMap {
  return {
    originX: 1000,
    originY: 2000,
    pixelsPerUnit: imgW / 500,
    offsetX: imgW * 0.02,
    offsetY: imgH * 0.02,
    imgH,
  }
}

describe('rescalePlanMarksForImage', () => {
  it('масштабирует отметку, когда план перерисован мельче', () => {
    const mark = zone([{ x: 4000, y: 2000 }, { x: 4200, y: 2000 }, { x: 4200, y: 2200 }], {
      planW: 4096,
      planH: 2048,
    })
    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 1024)
    expect(changed).toBe(true)
    const shape = marks[0]!.shape
    expect(shape.type).toBe('zone')
    if (shape.type !== 'zone') return
    expect(shape.outline[0]).toEqual({ x: 2000, y: 1000 })
    expect(marks[0]!.planW).toBe(2048)
    // Площадь в м² от разрешения плана не зависит.
    expect(shape.areaM2).toBe(42.5)
  })

  it('ничего не делает, если размер плана тот же', () => {
    const mark = zone([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }], {
      planW: 2048,
      planH: 1024,
    })
    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 1024)
    expect(changed).toBe(false)
    expect(marks[0]).toEqual(mark)
  })

  it('оставляет world-отметки без изменений', () => {
    const mark: DwgPlanMark = {
      ...base,
      id: 'm-world',
      space: 'world',
      shape: { type: 'point', x: 12345, y: 67890 },
    }
    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 1024)
    expect(changed).toBe(false)
    expect(marks[0]!.shape).toEqual({ type: 'point', x: 12345, y: 67890 })
  })

  it('через привязку к чертежу переносит отметку на план с другими габаритами', () => {
    const from = mapFor(4096, 2048)
    const to: DwgPlanMarkMap = { ...mapFor(2048, 1024), originX: 900 }
    // Точка в координатах чертежа, которую отметили на старом плане.
    const world = { x: 1200, y: 2100 }
    const px = {
      x: from.offsetX + (world.x - from.originX) * from.pixelsPerUnit,
      y: from.imgH - from.offsetY - (world.y - from.originY) * from.pixelsPerUnit,
    }
    const mark = zone([px, { x: px.x + 10, y: px.y }, { x: px.x + 10, y: px.y + 10 }], {
      planW: 4096,
      planH: 2048,
      planMap: from,
    })

    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 1024, { map: to })
    expect(changed).toBe(true)
    const shape = marks[0]!.shape
    if (shape.type !== 'zone') throw new Error('ожидалась зона')
    const expected = {
      x: to.offsetX + (world.x - to.originX) * to.pixelsPerUnit,
      y: to.imgH - to.offsetY - (world.y - to.originY) * to.pixelsPerUnit,
    }
    expect(shape.outline[0]!.x).toBeCloseTo(expected.x, 6)
    expect(shape.outline[0]!.y).toBeCloseTo(expected.y, 6)
    expect(marks[0]!.planMap).toEqual(to)
  })

  it('не двигает отметку, если привязка не изменилась', () => {
    const map = mapFor(2048, 1024)
    const mark = zone([{ x: 300, y: 400 }, { x: 320, y: 400 }, { x: 320, y: 420 }], {
      planW: 2048,
      planH: 1024,
      planMap: map,
    })
    const { changed } = rescalePlanMarksForImage([mark], 2048, 1024, { map: { ...map } })
    expect(changed).toBe(false)
  })

  it('старую отметку без planW подгоняет по вылету за пределы плана', () => {
    const mark = zone([{ x: 5000, y: 1200 }, { x: 5100, y: 1200 }, { x: 5100, y: 1300 }])
    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 1024)
    expect(changed).toBe(true)
    const shape = marks[0]!.shape
    if (shape.type !== 'zone') throw new Error('ожидалась зона')
    // Координаты доходят до 5100 → прежний план был 5120 px, масштаб 2048/5120.
    expect(shape.outline[0]!.x).toBeCloseTo(5000 * (2048 / 5120), 6)
    expect(marks[0]!.planW).toBe(2048)
  })

  it('старую отметку внутри плана только помечает размером', () => {
    const outline = [{ x: 500, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 500 }]
    const { marks, changed } = rescalePlanMarksForImage([zone(outline)], 2048, 1024)
    expect(changed).toBe(true)
    const shape = marks[0]!.shape
    if (shape.type !== 'zone') throw new Error('ожидалась зона')
    expect(shape.outline).toEqual(outline)
    expect(marks[0]!.planW).toBe(2048)
  })

  it('повторный вызов ничего не меняет (идемпотентность)', () => {
    const first = rescalePlanMarksForImage(
      [zone([{ x: 4000, y: 2000 }, { x: 4200, y: 2000 }, { x: 4200, y: 2200 }], {
        planW: 4096,
        planH: 2048,
      })],
      2048,
      1024,
    )
    const second = rescalePlanMarksForImage(first.marks, 2048, 1024)
    expect(second.changed).toBe(false)
    expect(second.marks[0]).toEqual(first.marks[0])
  })

  it('не угадывает, если у плана изменились пропорции', () => {
    const mark = zone([{ x: 1000, y: 500 }, { x: 1100, y: 500 }, { x: 1100, y: 600 }], {
      planW: 2048,
      planH: 1024,
    })
    const { marks, changed } = rescalePlanMarksForImage([mark], 2048, 2048)
    expect(changed).toBe(false)
    expect(marks[0]).toEqual(mark)
  })

  it('без размеров изображения список остаётся как есть', () => {
    const mark = zone([{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }])
    const { marks, changed } = rescalePlanMarksForImage([mark], 0, 0)
    expect(changed).toBe(false)
    expect(marks[0]).toEqual(mark)
  })
})

describe('inferLegacyPlanWidth', () => {
  it('возвращает текущую ширину, если координаты влезают', () => {
    const mark = zone([{ x: 1000, y: 500 }])
    expect(inferLegacyPlanWidth(mark, 2048, 1024)).toBe(2048)
  })

  it('восстанавливает прежнюю ширину по шагам рендера', () => {
    const mark = zone([{ x: 7000, y: 900 }])
    expect(inferLegacyPlanWidth(mark, 2048, 1024)).toBe(2048 * (8192 / 2048))
  })
})

describe('tombstonePlanMarksForFile', () => {
  it('гасит отметки удалённого чертежа и убирает геометрию', () => {
    const marks: DwgPlanMark[] = [
      zone([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }], { id: 'a', planW: 2048, planH: 1024 }),
      zone([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }], { id: 'b', fileId: 'file-2' }),
    ]
    const { marks: next, changed } = tombstonePlanMarksForFile(marks, 'file-1', '2026-09-11T12:00:00.000Z')
    expect(changed).toBe(true)
    expect(next[0]!.deletedAtIso).toBe('2026-09-11T12:00:00.000Z')
    expect(next[0]!.shape).toEqual({ type: 'point', x: 0, y: 0 })
    expect(next[0]!.planW).toBeUndefined()
    // Чужой чертёж не трогаем.
    expect(next[1]).toEqual(marks[1])
  })

  it('второй раз не переписывает уже погашенные', () => {
    const marks = [zone([{ x: 1, y: 1 }], { deletedAtIso: '2026-09-01T00:00:00.000Z' })]
    expect(tombstonePlanMarksForFile(marks, 'file-1').changed).toBe(false)
  })
})
