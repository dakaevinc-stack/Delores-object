import type { ConstructionSite } from '../types/constructionSite'

/**
 * Управленческие mock-данные: статус пока ручной, цифры план/факт и этапы — основа
 * для будущего автоматического расчёта и drill-down в карточку объекта.
 */
export const MOCK_CONSTRUCTION_SITES: readonly ConstructionSite[] = [
  {
    id: 'kirpichnogo-zavoda',
    name: 'пос. Кирпичного завода',
    status: 'normal',
    executive: {
      planPercent: 64,
      factPercent: 62,
      summaryLine: 'Лёгкое отклонение по сетям и колодцам, в целом в графике.',
      hasOpenRisks: false,
      stages: [
        { id: 'prep', name: 'Подготовка площадки', planPercent: 100, factPercent: 100 },
        { id: 'net', name: 'Сети и колодцы', planPercent: 34, factPercent: 32 },
      ],
    },
  },
  {
    id: 'brusilova',
    name: 'Брусилова',
    status: 'attention',
    executive: {
      planPercent: 71,
      factPercent: 63,
      summaryLine: 'Отставание по бортовому камню и выходу на асфальтобетон.',
      hasOpenRisks: true,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'curb', name: 'Бортовой камень', planPercent: 70, factPercent: 48 },
        { id: 'asphalt', name: 'Асфальтобетон', planPercent: 18, factPercent: 12 },
      ],
    },
  },
  {
    id: 'scherbinka-vokzalnaya',
    name: 'Щербинка, Вокзальная',
    status: 'normal',
    executive: {
      planPercent: 58,
      factPercent: 59,
      summaryLine: 'Факт опережает план; риски по срокам поставки люков закрыты.',
      hasOpenRisks: false,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'cover', name: 'Покрытие', planPercent: 42, factPercent: 44 },
        { id: 'mark', name: 'Разметка', planPercent: 0, factPercent: 0 },
      ],
    },
  },
  {
    id: 'proezd-28b',
    name: 'Проезд к вл. 28Б',
    status: 'critical',
    executive: {
      planPercent: 55,
      factPercent: 38,
      summaryLine: 'Критическое отклонение по срокам и объёму работ на покрытии.',
      hasOpenRisks: true,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 95 },
        { id: 'base', name: 'Основание', planPercent: 68, factPercent: 40 },
        { id: 'cover', name: 'Покрытие', planPercent: 32, factPercent: 8 },
      ],
    },
  },
  {
    id: 'mcd2-butovo',
    name: 'МЦД-2 Бутово',
    status: 'attention',
    executive: {
      planPercent: 49,
      factPercent: 44,
      summaryLine: 'Риск по срокам на этапе прокладки инженерных сетей.',
      hasOpenRisks: true,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'util', name: 'Инженерные сети', planPercent: 62, factPercent: 48 },
        { id: 'struct', name: 'Конструктив', planPercent: 28, factPercent: 26 },
        { id: 'fin', name: 'Ограждения и знаки', planPercent: 8, factPercent: 6 },
      ],
    },
  },
  {
    id: 'krekshino-ryabinovaya',
    name: 'Крекшино, Рябиновая',
    status: 'normal',
    executive: {
      planPercent: 41,
      factPercent: 41,
      summaryLine: 'План и факт совпадают; отклонений по ключевым этапам нет.',
      hasOpenRisks: false,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'cover', name: 'Покрытие', planPercent: 22, factPercent: 22 },
        { id: 'sign', name: 'Ограждение и знаки', planPercent: 6, factPercent: 6 },
      ],
    },
  },
  {
    id: 'koshtoyantsa',
    name: 'Коштоянца',
    status: 'critical',
    executive: {
      planPercent: 68,
      factPercent: 51,
      summaryLine: 'Сильное отставание по покрытию и дефицит бригад на участке.',
      hasOpenRisks: true,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'base', name: 'Основание', planPercent: 88, factPercent: 64 },
        { id: 'cover', name: 'Покрытие', planPercent: 58, factPercent: 22 },
      ],
    },
  },
] as const
