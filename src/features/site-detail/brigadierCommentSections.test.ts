import { describe, expect, it } from 'vitest'
import { parseBrigadierComment } from './brigadierCommentSections'

describe('parseBrigadierComment', () => {
  it('возвращает пустую структуру для пустой/пустяковой строки', () => {
    expect(parseBrigadierComment('').hasStructure).toBe(false)
    expect(parseBrigadierComment('   ').hasStructure).toBe(false)
    expect(parseBrigadierComment(undefined).hasStructure).toBe(false)
    expect(parseBrigadierComment(null).hasStructure).toBe(false)
  })

  it('разбирает реальный комментарий бригадира — работы, уложено, бригада', () => {
    const text =
      'Выкоп траншеи под бортовой камень — 110 м.п. Устройство щебёночного основания под БК — 50 м.п. ' +
      'Уложено: труба Ø63 — 370 м.п., труба Ø110 — 112 м.п. Приём материала. ' +
      'Бригада: 2 ИТР, 16 рабочих, 7 ед. техники.'

    const out = parseBrigadierComment(text)
    expect(out.hasStructure).toBe(true)

    expect(out.works).toEqual([
      { activity: 'Выкоп траншеи под бортовой камень', quantity: '110 м.п' },
      { activity: 'Устройство щебёночного основания под БК', quantity: '50 м.п' },
      { activity: 'Приём материала' },
    ])

    expect(out.laid).toEqual([
      { name: 'труба Ø63', quantity: '370 м.п' },
      { name: 'труба Ø110', quantity: '112 м.п' },
    ])

    expect(out.crew).toEqual({
      itr: 2,
      workers: 16,
      equipment: 7,
      people: undefined,
      raw: '2 ИТР, 16 рабочих, 7 ед. техники',
    })
  })

  it('распознаёт «N человек» в составе бригады', () => {
    const out = parseBrigadierComment('Бригада: 12 человек.')
    expect(out.crew?.people).toBe(12)
    expect(out.hasStructure).toBe(true)
  })

  it('падает в плоский fallback, если в тексте нет ни одного знакомого паттерна', () => {
    const out = parseBrigadierComment('Сегодня по плану, без замечаний')
    expect(out.hasStructure).toBe(true) // одно работа без количества тоже считается структурой
    expect(out.works).toEqual([{ activity: 'Сегодня по плану, без замечаний' }])
    expect(out.laid).toHaveLength(0)
    expect(out.crew).toBeNull()
  })

  it('не считает дефис внутри слова за разделитель «активность — количество»', () => {
    const out = parseBrigadierComment('Выполнено по-новому ограждение.')
    expect(out.works).toEqual([{ activity: 'Выполнено по-новому ограждение' }])
  })

  it('игнорирует пустые куски и многоточие', () => {
    const out = parseBrigadierComment('Работы по графику... Уложено: трубы.')
    expect(out.works.map((w) => w.activity)).toContain('Работы по графику')
    expect(out.laid).toEqual([{ name: 'трубы' }])
  })
})
