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
    startDateIso: '2026-04-07',
    endDateIso: '2026-05-15',
    executive: {
      planPercent: 64,
      factPercent: 62,
      summaryLine: 'Сети и колодцы: −2 п.п. к плану',
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
    startDateIso: '2026-04-17',
    endDateIso: '2026-08-31',
    executive: {
      planPercent: 71,
      factPercent: 63,
      summaryLine: 'Бордюр 48/70 · асфальт 12/18',
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
    startDateIso: '2026-04-07',
    endDateIso: '2026-05-15',
    executive: {
      planPercent: 58,
      factPercent: 59,
      summaryLine: 'Опережение плана · люки закрыты',
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
      summaryLine: 'Покрытие: критическое отставание',
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
      summaryLine: 'Инжсети: риск по срокам',
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
    startDateIso: '2026-04-03',
    endDateIso: '2026-05-15',
    executive: {
      planPercent: 41,
      factPercent: 41,
      summaryLine: 'План = факт',
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
      summaryLine: 'Покрытие · дефицит бригад',
      hasOpenRisks: true,
      stages: [
        { id: 'prep', name: 'Подготовка', planPercent: 100, factPercent: 100 },
        { id: 'base', name: 'Основание', planPercent: 88, factPercent: 64 },
        { id: 'cover', name: 'Покрытие', planPercent: 58, factPercent: 22 },
      ],
    },
  },
] as const
