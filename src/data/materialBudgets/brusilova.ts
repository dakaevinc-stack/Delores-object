import type { MaterialBudget } from '../../domain/materialBudget'

/**
 * Смета расхода материалов — ул. Брусилова.
 *
 * Объёмы — предварительный инженерный расчёт от площадей справки
 * (песок 30 см, щебень 20 см, растительный грунт 15 см и т.д.).
 * Когда придёт точная ведомость — правим цифры здесь.
 */
export const BRUSILOVA_MATERIAL_BUDGET: MaterialBudget = {
  siteId: 'brusilova',
  siteName: 'Брусилова',
  asOfIso: '2026-08-17T00:00:00.000Z',
  articles: [
    {
      id: 'sand-quarry',
      presetId: 'sand-quarry',
      title: 'Песок карьерный',
      group: 'Песок',
      unit: 'm3',
      planned: 8600,
    },
    {
      id: 'crushed-20-40',
      presetId: 'crushed-granite-20-40',
      title: 'Щебень гранитный 20–40',
      group: 'Щебень',
      unit: 'm3',
      planned: 5700,
    },
    {
      id: 'crushed-5-20',
      presetId: 'crushed-granite-5-20',
      title: 'Щебень гранитный 5–20',
      group: 'Щебень',
      unit: 'm3',
      planned: 1800,
    },
    {
      id: 'concrete-b15',
      presetId: 'concrete-b15',
      title: 'Бетон товарный B15 (М200)',
      group: 'Бетон',
      unit: 'm3',
      planned: 800,
    },
    {
      id: 'concrete-b25',
      presetId: 'concrete-b25',
      title: 'Бетон товарный B25 (М350)',
      group: 'Бетон',
      unit: 'm3',
      planned: 350,
    },
    {
      id: 'soil-fill',
      presetId: 'soil-fill',
      title: 'Грунт для обратной засыпки',
      group: 'Грунт',
      unit: 'm3',
      planned: 2200,
    },
    {
      id: 'topsoil',
      presetId: 'topsoil-chernozem',
      title: 'Чернозём (растительный грунт)',
      group: 'Грунт',
      unit: 'm3',
      planned: 5500,
    },
    {
      id: 'geotextile',
      presetId: 'geotextile-200',
      title: 'Геотекстиль 200 г/м²',
      group: 'Основания',
      unit: 'm2',
      planned: 28641,
    },
    {
      id: 'curb-road',
      presetId: 'curb-br-100-30-15',
      title: 'Бордюр БР 100.30.15',
      group: 'Борт',
      unit: 'pcs',
      planned: 20115,
    },
    {
      id: 'asphalt-b',
      presetId: 'asphalt-type-b',
      title: 'Асфальтобетон тип Б',
      group: 'Асфальт',
      unit: 't',
      planned: 8400,
    },
    {
      id: 'asphalt-a',
      presetId: 'asphalt-type-a-15',
      title: 'Асфальтобетон тип А-15',
      group: 'Асфальт',
      unit: 't',
      planned: 5250,
    },
    {
      id: 'pipe-110',
      presetId: 'pipe-pe-d110',
      title: 'Труба ПНД D110',
      group: 'Сети',
      unit: 'lm',
      planned: 8734,
    },
    {
      id: 'pipe-63',
      presetId: 'pipe-pe-d63',
      title: 'Труба ПНД D63',
      group: 'Сети',
      unit: 'lm',
      planned: 4000,
    },
  ],
}
