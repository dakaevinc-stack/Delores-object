import { describe, expect, it } from 'vitest'
import {
  PROCUREMENT_CATEGORIES,
  PROCUREMENT_MATERIAL_PRESETS,
  findProcurementCategory,
  findProcurementPreset,
  groupProcurementPresets,
  searchProcurementPresets,
} from './procurementCatalog'

describe('Каталог снабжения: целостность данных', () => {
  it('у каждой позиции уникальный id', () => {
    const ids = new Set<string>()
    for (const p of PROCUREMENT_MATERIAL_PRESETS) {
      expect(ids.has(p.id), `дубль id: ${p.id}`).toBe(false)
      ids.add(p.id)
    }
  })

  it('у каждой позиции есть существующая категория', () => {
    const cats = new Set(PROCUREMENT_CATEGORIES.map((c) => c.id))
    for (const p of PROCUREMENT_MATERIAL_PRESETS) {
      expect(cats.has(p.categoryId), `${p.id} → ${p.categoryId}`).toBe(true)
    }
  })

  it('у каждой позиции непустой title и subtitle', () => {
    for (const p of PROCUREMENT_MATERIAL_PRESETS) {
      expect(p.title.trim().length).toBeGreaterThan(0)
      expect(p.subtitle.trim().length).toBeGreaterThan(0)
    }
  })

  it('каждая категория представлена хотя бы одной позицией', () => {
    for (const c of PROCUREMENT_CATEGORIES) {
      const inCat = PROCUREMENT_MATERIAL_PRESETS.filter((p) => p.categoryId === c.id)
      expect(inCat.length, `категория «${c.title}» пуста`).toBeGreaterThan(0)
    }
  })

  it('категория «Спецтехника» содержит ровно 13 пресетов — все классы парка', () => {
    const machinery = PROCUREMENT_MATERIAL_PRESETS.filter((p) => p.categoryId === 'machinery')
    expect(machinery).toHaveLength(13)
  })

  it('категория «Бригада» содержит позиции рабочие / ИТР / разнорабочие', () => {
    const labor = PROCUREMENT_MATERIAL_PRESETS.filter((p) => p.categoryId === 'labor')
    expect(labor.map((p) => p.id).sort()).toEqual(
      ['labor-helpers', 'labor-itr', 'labor-workers'].sort(),
    )
    for (const p of labor) {
      expect(p.defaultUnit).toBe('person')
    }
  })
})

describe('Каталог: поиск', () => {
  it('пустой запрос возвращает все позиции в исходном порядке', () => {
    const out = searchProcurementPresets('')
    expect(out.length).toBe(PROCUREMENT_MATERIAL_PRESETS.length)
    expect(out[0]?.id).toBe(PROCUREMENT_MATERIAL_PRESETS[0]?.id)
  })

  it('находит трубу ПНД D110 по «труба 110»', () => {
    const out = searchProcurementPresets('труба 110')
    expect(out.some((p) => p.id === 'pipe-pe-d110')).toBe(true)
  })

  it('находит трубу ПНД D110 по бытовому «110я»', () => {
    const out = searchProcurementPresets('110я')
    expect(out.some((p) => p.id === 'pipe-pe-d110')).toBe(true)
  })

  it('находит щебень гранитный 5–20 по «5-20»', () => {
    const out = searchProcurementPresets('5-20')
    expect(out.some((p) => p.id === 'crushed-granite-5-20')).toBe(true)
  })

  it('находит экскаватор-погрузчик по бренду «JCB»', () => {
    const out = searchProcurementPresets('JCB')
    expect(out.some((p) => p.id === 'machinery-backhoes')).toBe(true)
  })

  it('находит минипогрузчик по «Bobcat»', () => {
    const out = searchProcurementPresets('Bobcat')
    expect(out.some((p) => p.id === 'machinery-mini-loaders')).toBe(true)
  })

  it('находит асфальтоукладчик по «укладчик»', () => {
    const out = searchProcurementPresets('укладчик')
    expect(out.some((p) => p.id === 'machinery-pavers')).toBe(true)
  })

  it('находит дорожную фрезу по «фрезеровка»', () => {
    const out = searchProcurementPresets('фрезеровка')
    expect(out.some((p) => p.id === 'machinery-cold-mills')).toBe(true)
  })

  it('находит дополнительных рабочих по «усиление»', () => {
    const out = searchProcurementPresets('усиление')
    expect(out.some((p) => p.id === 'labor-workers')).toBe(true)
  })

  it('находит ИТР по «прораб»', () => {
    const out = searchProcurementPresets('прораб')
    expect(out.some((p) => p.id === 'labor-itr')).toBe(true)
  })

  it('игнорирует регистр и пунктуацию', () => {
    expect(searchProcurementPresets('ПЕСОК')[0]?.categoryId).toBe('sand')
    expect(searchProcurementPresets('песок!')[0]?.categoryId).toBe('sand')
  })

  it('возвращает пусто на бессмысленный запрос', () => {
    expect(searchProcurementPresets('xyzzy-нет-такого')).toHaveLength(0)
  })
})

describe('Каталог: группировка', () => {
  it('группирует найденные позиции в порядке категорий каталога', () => {
    const groups = groupProcurementPresets(PROCUREMENT_MATERIAL_PRESETS)
    expect(groups.length).toBeGreaterThan(0)
    const expectedOrder = PROCUREMENT_CATEGORIES.map((c) => c.id).filter((id) =>
      PROCUREMENT_MATERIAL_PRESETS.some((p) => p.categoryId === id),
    )
    expect(groups.map((g) => g.category.id)).toEqual(expectedOrder)
  })

  it('пропускает категории, в которые не попало ни одного результата поиска', () => {
    const filtered = searchProcurementPresets('песок')
    const groups = groupProcurementPresets(filtered)
    expect(groups.every((g) => g.presets.length > 0)).toBe(true)
    expect(groups.some((g) => g.category.id === 'sand')).toBe(true)
    expect(groups.some((g) => g.category.id === 'asphalt')).toBe(false)
  })
})

describe('Каталог: обратная совместимость со старыми presetId', () => {
  it('старый id «sand» открывается как песок карьерный', () => {
    const p = findProcurementPreset('sand')
    expect(p?.id).toBe('sand-quarry')
  })

  it('старый id «pipes» открывается как ПНД D110', () => {
    expect(findProcurementPreset('pipes')?.id).toBe('pipe-pe-d110')
  })

  it('старый id «curb» открывается как БР 100.30.15', () => {
    expect(findProcurementPreset('curb')?.id).toBe('curb-br-100-30-15')
  })

  it('старый id «asphalt» открывается как тип А-15', () => {
    expect(findProcurementPreset('asphalt')?.id).toBe('asphalt-type-a-15')
  })

  it('старый id «crushed-stone» открывается как гранит 20–40', () => {
    expect(findProcurementPreset('crushed-stone')?.id).toBe('crushed-granite-20-40')
  })

  it('ранний machinery-id «machinery-backhoe» открывается как новый «-backhoes»', () => {
    expect(findProcurementPreset('machinery-backhoe')?.id).toBe('machinery-backhoes')
  })

  it('ранний «machinery-roller» открывается как «-rollers»', () => {
    expect(findProcurementPreset('machinery-roller')?.id).toBe('machinery-rollers')
  })

  it('null/undefined/неизвестный id возвращают null без ошибок', () => {
    expect(findProcurementPreset(null)).toBeNull()
    expect(findProcurementPreset(undefined)).toBeNull()
    expect(findProcurementPreset('made-up-id')).toBeNull()
  })

  it('прямой id новой позиции возвращает её саму', () => {
    expect(findProcurementPreset('sand-quarry')?.id).toBe('sand-quarry')
  })
})

describe('Каталог: категории', () => {
  it('findProcurementCategory работает для всех заявленных id', () => {
    for (const c of PROCUREMENT_CATEGORIES) {
      expect(findProcurementCategory(c.id)?.id).toBe(c.id)
    }
  })

  it('null/неизвестный id → null', () => {
    expect(findProcurementCategory(null)).toBeNull()
    expect(findProcurementCategory('unknown')).toBeNull()
  })
})
