import type { WorkPlan } from '../../domain/workPlan'

/**
 * Производственный план объекта «ул. Брусилова».
 *
 * Нумерация сквозная 1…5 после вычистки неведущихся разделов.
 * Исторические id позиций из справки Excel сменились — при сверке
 * с офисом опираемся на названия, не на старые номера.
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
        { number: '1.1', title: 'Бетон', unit: 'm', total: 15461, done: 0, startIso: '2026-05-01', endIso: '2026-07-03' },
        { number: '1.2', title: 'Гранит', unit: 'm', total: 4654, done: 0, startIso: '2026-06-02', endIso: '2026-07-10' },
        // Демонтаж добавлен по отчётам бригадира (раньше был 1.4 в справке).
        { number: '1.3', title: 'Демонтаж бортового камня', unit: 'm', total: 15461, done: 0, startIso: '2026-04-30', endIso: '2026-07-03' },
      ],
    },
    {
      number: '2',
      title: 'Тротуары',
      items: [
        { number: '2.1', title: 'Разборка покрытия тротуаров', unit: 'm2', total: 28637, done: 0, startIso: '2026-05-01', endIso: '2026-06-22' },
        { number: '2.2', title: 'Устройство песчаного основания', unit: 'm2', total: 28641, done: 0, startIso: '2026-05-15', endIso: '2026-07-13' },
        { number: '2.3', title: 'Устройство основания из щебня / бетона / ЩПС', unit: 'm2', total: 28641, done: 0, startIso: '2026-05-22', endIso: '2026-07-20' },
      ],
    },
    {
      number: '3',
      title: 'Асфальтирование и фрезерование',
      items: [
        { number: '3.1', title: 'Фрезерование / разборка покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-03', endIso: '2026-07-13' },
        { number: '3.2', title: 'Устройство нижнего слоя покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-06', endIso: '2026-07-24' },
        { number: '3.3', title: 'Устройство верхнего слоя покрытия', unit: 'm2', total: 43774, done: 0, startIso: '2026-07-07', endIso: '2026-08-06' },
      ],
    },
    {
      number: '4',
      title: 'Благоустройство',
      items: [
        { number: '4.1', title: 'Газоны — планировка', unit: 'm2', total: 36828, done: 0, startIso: '2026-06-02', endIso: '2026-07-30' },
        { number: '4.2', title: 'Газоны — посев', unit: 'm2', total: 36828, done: 0, startIso: '2026-07-17', endIso: '2026-08-13' },
      ],
    },
    {
      number: '5',
      title: 'Электрические сети',
      items: [
        { number: '5.1', title: 'Кабельная канализация (КК)', unit: 'm', total: 8734, done: 0, startIso: '2026-04-17', endIso: '2026-07-06' },
        { number: '5.2', title: 'Прокладка кабеля', unit: 'm', total: 17045, done: 0, startIso: '2026-05-08', endIso: '2026-07-20' },
      ],
    },
  ],
}
