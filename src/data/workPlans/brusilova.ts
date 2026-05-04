import type { WorkPlan } from '../../domain/workPlan'

/**
 * Производственный план объекта «ул. Брусилова» — снимок справки
 * (Excel) на 1 мая 2026 г. Пока без факта (везде 0) — заявленный план
 * проекта.
 *
 * Сроки в исходнике записаны как «31/12/29» там, где график не
 * утверждён, — здесь это null. Объёмы 0 = позиция в реестре, но не
 * планируется в текущем сезоне (например, «Кустарники»).
 *
 * Структура повторяет нумерацию из справки 1:1 (1.1, 1.2 … 11.8) —
 * чтобы при сверке с офисом строки совпадали по номеру.
 */
export const BRUSILOVA_WORK_PLAN: WorkPlan = {
  siteId: 'brusilova',
  siteName: 'Брусилова',
  asOfIso: '2026-05-04T00:00:00.000Z',
  sections: [
    {
      number: '1',
      title: 'Бортовой камень',
      items: [
        { number: '1.1', title: 'Бетон', unit: 'm', total: 15461, done: 0, startIso: '2025-05-01', endIso: '2025-07-03' },
        { number: '1.2', title: 'Гранит', unit: 'm', total: 4654, done: 0, startIso: '2025-06-02', endIso: '2025-07-10' },
        { number: '1.3', title: 'Металл', unit: 'm', total: 0, done: 0, startIso: '2025-06-20', endIso: '2025-07-06' },
      ],
    },
    {
      number: '2',
      title: 'Тротуары, детские площадки',
      items: [
        { number: '2.1', title: 'Разборка покрытия тротуаров', unit: 'm2', total: 28637, done: 0, startIso: '2025-05-01', endIso: '2025-06-22' },
        { number: '2.2', title: 'Устройство песчаного основания', unit: 'm2', total: 28641, done: 0, startIso: '2025-05-15', endIso: '2025-07-13' },
        { number: '2.3', title: 'Устройство основания из щебня / бетона / ЩПС', unit: 'm2', total: 28641, done: 0, startIso: '2025-05-22', endIso: '2025-07-20' },
        { number: '2.4', title: 'Устройство нижнего слоя покрытия', unit: 'm2', total: 30342, done: 0, startIso: '2025-06-02', endIso: '2025-07-24' },
        { number: '2.5', title: 'Устройство верхнего слоя покрытия', unit: 'm2', total: 30342, done: 0, startIso: '2025-07-20', endIso: '2025-07-30' },
        { number: '2.6', title: 'Устройство спецпокрытия', unit: 'm2', total: 20, done: 0, startIso: '2025-07-17', endIso: '2025-07-24' },
      ],
    },
    {
      number: '3',
      title: 'Проезжая часть двора / проезды',
      items: [
        { number: '3.1', title: 'Фрезерование / разборка покрытия', unit: 'm2', total: 0, done: 0, startIso: '2025-06-02', endIso: '2025-06-26' },
        { number: '3.2', title: 'Устройство нижнего слоя покрытия', unit: 'm2', total: 0, done: 0, startIso: '2025-06-08', endIso: '2025-07-03' },
        { number: '3.3', title: 'Устройство верхнего слоя покрытия', unit: 'm2', total: 0, done: 0, startIso: '2025-06-22', endIso: '2025-07-05' },
      ],
    },
    {
      number: '4',
      title: 'Проезжая часть, основной створ',
      items: [
        { number: '4.1', title: 'Фрезерование / разборка покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2025-07-03', endIso: '2025-07-13' },
        { number: '4.2', title: 'Устройство нижнего слоя покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2025-07-06', endIso: '2025-07-24' },
        { number: '4.3', title: 'Устройство верхнего слоя покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2025-07-07', endIso: '2025-08-06' },
      ],
    },
    {
      number: '5',
      title: 'Благоустройство',
      items: [
        { number: '5.1', title: 'Газоны — планировка', unit: 'm2', total: 36828, done: 0, startIso: '2025-06-02', endIso: '2025-07-30' },
        { number: '5.2', title: 'Газоны — посев', unit: 'm2', total: 36828, done: 0, startIso: '2025-07-17', endIso: '2025-08-13' },
        { number: '5.3', title: 'Кустарники', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '5.4', title: 'Деревья', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '6',
      title: 'МАФ (малые архитектурные формы)',
      items: [
        { number: '6.1', title: 'Скамейки', unit: 'pcs', total: 3, done: 0, startIso: '2025-07-27', endIso: '2025-07-30' },
        { number: '6.2', title: 'Урны', unit: 'pcs', total: 39, done: 0, startIso: '2025-07-27', endIso: '2025-07-30' },
        { number: '6.3', title: 'Игровые комплексы', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '6.4', title: 'Велопарковки', unit: 'pcs', total: 23, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '7',
      title: 'МГН (маломобильные группы населения)',
      items: [
        { number: '7.1', title: 'Тактильные плитки / ОТТ', unit: 'pcs', total: 9, done: 0, startIso: '2025-07-30', endIso: '2025-08-03' },
        { number: '7.2', title: 'Пандусы', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '7.3', title: 'Стелы', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '8',
      title: 'Наружное и комплексное освещение (НО + КО)',
      items: [
        { number: '8.1', title: 'Опоры НО', unit: 'pcs', total: 186, done: 0, startIso: '2025-05-12', endIso: '2025-07-27' },
        { number: '8.2', title: 'Кронштейны НО', unit: 'pcs', total: 170, done: 0, startIso: '2025-05-12', endIso: '2025-07-27' },
        { number: '8.3', title: 'Светильники НО', unit: 'pcs', total: 346, done: 0, startIso: '2025-05-12', endIso: '2025-07-27' },
        { number: '8.4', title: 'Опоры КО', unit: 'pcs', total: 49, done: 0, startIso: '2025-05-12', endIso: '2025-07-27' },
        { number: '8.5', title: 'Кронштейны КО', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '8.6', title: 'Светильники КО', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '8.7', title: 'Демонтаж старых опор', unit: 'pcs', total: 152, done: 0, startIso: '2025-05-22', endIso: '2025-05-27' },
      ],
    },
    {
      number: '9',
      title: 'Электрические сети',
      items: [
        { number: '9.1', title: 'Кабельная канализация (КК)', unit: 'm', total: 8734, done: 0, startIso: '2025-04-17', endIso: '2025-07-06' },
        { number: '9.2', title: 'Прокладка кабеля', unit: 'm', total: 17045, done: 0, startIso: '2025-05-08', endIso: '2025-07-20' },
        { number: '9.3', title: 'ВРЩ (вводно-распределительные щиты)', unit: 'pcs', total: 4, done: 0, startIso: '2025-08-03', endIso: '2025-08-03' },
        { number: '9.4', title: 'Техническая документация', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '10',
      title: 'Организация дорожного движения (ОДД)',
      items: [
        { number: '10.1', title: 'Дорожная разметка', unit: 'm2', total: 1934, done: 0, startIso: null, endIso: null },
        { number: '10.2', title: 'Дорожные знаки', unit: 'pcs', total: 510, done: 0, startIso: null, endIso: null },
      ],
    },
    {
      number: '11',
      title: 'Прочие',
      items: [
        { number: '11.1', title: 'Гранитные парковочные ограничители', unit: 'pcs', total: 2, done: 0, startIso: '2025-08-03', endIso: '2025-08-03' },
        { number: '11.2', title: 'Контейнерные площадки', unit: 'pcs', total: 5, done: 0, startIso: '2025-08-03', endIso: '2025-08-06' },
        { number: '11.3', title: 'Пешеходные ограждения', unit: 'm', total: 34, done: 0, startIso: '2025-08-03', endIso: '2025-08-06' },
        { number: '11.4', title: 'Кабель ЛЭТ', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '11.5', title: 'Ограждение остановок', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '11.6', title: 'Перильные ограждения', unit: 'm', total: 0, done: 0, startIso: null, endIso: null },
        { number: '11.7', title: 'Приствольные решётки', unit: 'pcs', total: 0, done: 0, startIso: null, endIso: null },
        { number: '11.8', title: 'Вентиляционные кожухи', unit: 'pcs', total: 40, done: 0, startIso: '2025-08-10', endIso: '2025-08-13' },
      ],
    },
  ],
}
