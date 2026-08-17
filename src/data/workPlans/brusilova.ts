import type { WorkPlan } from '../../domain/workPlan'

/**
 * Производственный план объекта «ул. Брусилова».
 *
 * Разделы — рабочие группы на объекте (борт, тротуар, проезжая часть, …).
 * Подгруппы видны при раскрытии. Объёмы без цифр — 0, сроки null,
 * пока не придут с объекта.
 */
export const BRUSILOVA_WORK_PLAN: WorkPlan = {
  siteId: 'brusilova',
  siteName: 'Брусилова',
  asOfIso: '2026-05-04T00:00:00.000Z',
  sections: [
    {
      number: '1',
      title: 'Борт',
      items: [
        { number: '1.1', title: 'Песчаное основание', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
        { number: '1.2', title: 'Щебёночное основание', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
        // Бетон 15 461 + гранит 4 654 — пока одной строкой «монтаж».
        { number: '1.3', title: 'Монтаж бортового камня', unit: 'm', total: 20115, done: 0, startIso: '2026-05-01', endIso: '2026-07-10' },
        { number: '1.4', title: 'Демонтаж бортового камня', unit: 'm', total: 15461, done: 0, startIso: '2026-04-30', endIso: '2026-07-03' },
        { number: '1.5', title: 'Разработка грунта под бортовой камень', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '2',
      title: 'Тротуар',
      items: [
        { number: '2.1', title: 'Разборка асфальтобетонного покрытия', unit: 'm2', total: 28637, done: 0, startIso: '2026-05-01', endIso: '2026-06-22' },
        { number: '2.2', title: 'Разборка бетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.3', title: 'Демонтаж плитки', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.4', title: 'Разборка щебёночного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.5', title: 'Разборка железобетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.6', title: 'Разработка грунта под основание', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.7', title: 'Укладка геотекстиля', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.8', title: 'Устройство песчаного основания', unit: 'm2', total: 28641, done: 0, startIso: '2026-05-15', endIso: '2026-07-13' },
        { number: '2.9', title: 'Устройство щебёночного основания', unit: 'm2', total: 28641, done: 0, startIso: '2026-05-22', endIso: '2026-07-20' },
        { number: '2.10', title: 'Устройство бетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.11', title: 'Устройство нижнего слоя покрытия из асфальтобетона', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.12', title: 'Устройство верхнего слоя покрытия из асфальтобетона', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '2.13', title: 'Укладка плитки', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '3',
      title: 'Проезжая часть',
      items: [
        { number: '3.1', title: 'Фрезерование', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-03', endIso: '2026-07-13' },
        { number: '3.2', title: 'Разборка асфальтобетонного покрытия', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.3', title: 'Разборка бетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.4', title: 'Демонтаж плитки', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.5', title: 'Разборка щебёночного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.6', title: 'Разработка грунта под основание', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.7', title: 'Укладка геотекстиля', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.8', title: 'Устройство песчаного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.9', title: 'Устройство щебёночного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.10', title: 'Устройство бетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '3.11', title: 'Устройство нижнего слоя покрытия из асфальтобетона', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-06', endIso: '2026-07-24' },
        { number: '3.12', title: 'Устройство верхнего слоя покрытия из асфальтобетона', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-07', endIso: '2026-08-06' },
      ],
    },
    {
      number: '4',
      title: 'Газоны',
      items: [
        { number: '4.1', title: 'Разборка асфальтобетонного покрытия', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.2', title: 'Разборка бетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.3', title: 'Демонтаж плитки', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.4', title: 'Разборка щебёночного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.5', title: 'Разборка железобетонного основания', unit: 'm2', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.6', title: 'Разработка грунта под основание', unit: 'm3', total: 0, done: 0, startIso: null, endIso: null },
        { number: '4.7', title: 'Подготовка растительного грунта', unit: 'm2', total: 36828, done: 0, startIso: '2026-06-02', endIso: '2026-07-30' },
        { number: '4.8', title: 'Посев трав', unit: 'm2', total: 36828, done: 0, startIso: '2026-07-17', endIso: '2026-08-13' },
      ],
    },
    {
      number: '5',
      title: 'Электрические сети',
      items: [
        { number: '5.1', title: 'Демонтаж существующих труб и кабеля', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.2', title: 'Разработка траншеи', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.3', title: 'Устройство песчаного основания в траншее', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.4', title: 'Укладка трубы ПНД Ø63', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.5', title: 'Укладка трубы ПНД Ø110', unit: 'm', total: 8734, done: 0, startIso: '2026-04-17', endIso: '2026-07-06' },
        { number: '5.6', title: 'Устройство кабельных колодцев', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.7', title: 'Прокладка кабеля', unit: 'm', total: 17045, done: 0, startIso: '2026-05-08', endIso: '2026-07-20' },
        { number: '5.8', title: 'Обратная засыпка траншеи', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '6',
      title: 'Наружное освещение',
      items: [
        { number: '6.1', title: 'Демонтаж опор освещения', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.2', title: 'Демонтаж светильников', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.3', title: 'Устройство фундаментов под опоры', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.4', title: 'Установка опор освещения', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.5', title: 'Установка светильников', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.6', title: 'Подключение светильников', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '7',
      title: 'Дождевая канализация',
      items: [
        { number: '7.1', title: 'Разработка траншеи', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.2', title: 'Устройство песчаного основания под трубы', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.3', title: 'Укладка труб дождевой канализации', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.4', title: 'Установка дождеприёмников', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.5', title: 'Устройство смотровых колодцев', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.6', title: 'Обратная засыпка', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
  ],
}
