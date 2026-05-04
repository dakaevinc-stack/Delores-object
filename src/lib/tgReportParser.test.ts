import { describe, expect, it } from 'vitest'
import {
  looksLikeBrigadierReport,
  parseBrigadierReportText,
} from './tgReportParser.mjs'
import { resolveSiteId } from './siteIdResolver.mjs'

const SITES = [
  { id: 'kirpichnogo-zavoda', name: 'пос. Кирпичного завода' },
  { id: 'brusilova', name: 'Брусилова' },
  { id: 'scherbinka-vokzalnaya', name: 'Щербинка, Вокзальная' },
  { id: 'proezd-28b', name: 'Проезд к вл. 28Б' },
  { id: 'mcd2-butovo', name: 'МЦД-2 Бутово' },
  { id: 'krekshino-ryabinovaya', name: 'Крекшино, Рябиновая' },
  { id: 'koshtoyantsa', name: 'Коштоянца' },
] as const

const META = {
  responsible: 'Армен',
  reportedAtIso: '2026-05-04T20:41:00.000Z',
  sourceMessageId: '-1001:42',
}

describe('Распознавание ТГ-отчёта', () => {
  it('узнаёт сообщение по слову «Отчёт»', () => {
    expect(looksLikeBrigadierReport('Отчёт:\nОбъект: Брусилова')).toBe(true)
  })

  it('узнаёт сообщение и без слова «Отчёт», если есть «Объект:»', () => {
    expect(looksLikeBrigadierReport('Объект: Брусилова\n* Демонтаж')).toBe(true)
  })

  it('игнорирует обычное сообщение в группе', () => {
    expect(looksLikeBrigadierReport('Доброе утро, как дела?')).toBe(false)
    expect(looksLikeBrigadierReport('')).toBe(false)
  })
})

describe('Парсер бригадирского отчёта (реальный пример из ТГ-группы)', () => {
  const realText = [
    'Отчёт:',
    'Объект: Брусилова',
    '* Демонтаж тротуаров -250м2',
    '* Выкоп траншеи под БК- 110мп',
    '* Устройство щебня под БК- 50мп',
    '* Выкоп траншеи под НО и ПО - 150мп+ 45мп (пересечка)',
    '* Труба 63я - 370мп',
    '* Труба 110я- 112мп',
    '* Прием материала',
    '*Итр -2чел',
    '*Количество рабочих- 16чел',
    '* Техники- 7шт',
  ].join('\n')

  it('извлекает имя объекта', () => {
    const r = parseBrigadierReportText(realText, META)
    expect(r?.siteName).toBe('Брусилова')
  })

  it('собирает 7 пунктов работ (все * без ИТР/рабочих/техники)', () => {
    const r = parseBrigadierReportText(realText, META)
    expect(r?.workLines).toEqual([
      'Демонтаж тротуаров -250м2',
      'Выкоп траншеи под БК- 110мп',
      'Устройство щебня под БК- 50мп',
      'Выкоп траншеи под НО и ПО - 150мп+ 45мп (пересечка)',
      'Труба 63я - 370мп',
      'Труба 110я- 112мп',
      'Прием материала',
    ])
  })

  it('вытаскивает ресурсы (ИТР / рабочие / техника)', () => {
    const r = parseBrigadierReportText(realText, META)
    expect(r?.resources).toEqual({ itr: 2, workers: 16, equipment: 7 })
  })

  it('сохраняет исходный текст в `comment` и метаданные', () => {
    const r = parseBrigadierReportText(realText, META)
    expect(r?.comment).toContain('Отчёт:')
    expect(r?.responsible).toBe('Армен')
    expect(r?.reportedAtIso).toBe(META.reportedAtIso)
    expect(r?.sourceMessageId).toBe(META.sourceMessageId)
  })
})

describe('Парсер: вариативность написания', () => {
  it('понимает разные пробелы и регистр в служебных строках', () => {
    const r = parseBrigadierReportText(
      [
        'отчет',
        'Объект - Коштоянца',
        '— Бетонирование 80м3',
        '* ИТР: 3 человека',
        '* Рабочих 12 чел.',
        '* Техника - 5 шт',
      ].join('\n'),
      META,
    )
    expect(r?.siteName).toBe('Коштоянца')
    expect(r?.workLines).toEqual(['Бетонирование 80м3'])
    expect(r?.resources).toEqual({ itr: 3, workers: 12, equipment: 5 })
  })

  it('допускает 1) / 1. в качестве маркера пункта', () => {
    const r = parseBrigadierReportText(
      [
        'Отчёт:',
        'Объект: Брусилова',
        '1) Снятие асфальта 200м2',
        '2. Подсыпка 30м3',
      ].join('\n'),
      META,
    )
    expect(r?.workLines).toEqual([
      'Снятие асфальта 200м2',
      'Подсыпка 30м3',
    ])
  })

  it('возвращает null, если не похоже на отчёт', () => {
    expect(parseBrigadierReportText('Привет всем', META)).toBeNull()
  })

  it('возвращает null, если нет строки «Объект»', () => {
    expect(
      parseBrigadierReportText('Отчёт:\n* что-то\n* ещё', META),
    ).toBeNull()
  })
})

describe('Резолвер siteId', () => {
  it('точное совпадение', () => {
    expect(resolveSiteId('Брусилова', SITES)).toBe('brusilova')
    expect(resolveSiteId('Коштоянца', SITES)).toBe('koshtoyantsa')
  })

  it('кейс из реальной группы: имя топика «БРУСИЛОВА ул.»', () => {
    expect(resolveSiteId('БРУСИЛОВА ул.', SITES)).toBe('brusilova')
  })

  it('подстрочный матч: «Щербинка» → Щербинка, Вокзальная', () => {
    // в имени объекта 2 слова, в пробе 1 — токен «щербинка» совпадает,
    // других объектов с «щербинкой» нет
    expect(resolveSiteId('Щербинка', SITES)).toBe('scherbinka-vokzalnaya')
  })

  it('ё/е и пунктуация не мешают', () => {
    expect(resolveSiteId('пос Кирпичного завода', SITES)).toBe(
      'kirpichnogo-zavoda',
    )
  })

  it('возвращает null на полное «не то»', () => {
    expect(resolveSiteId('Москва', SITES)).toBeNull()
    expect(resolveSiteId('', SITES)).toBeNull()
  })
})
