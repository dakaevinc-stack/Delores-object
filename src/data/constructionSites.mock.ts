import type { ConstructionSite } from '../types/constructionSite'

const emptyExecutive = (summaryLine: string) => ({
  planPercent: 0,
  factPercent: 0,
  summaryLine,
  hasOpenRisks: false,
  stages: [],
})

/**
 * Живые площадки с ведомостью расхода.
 * Один и тот же субчик на двух улицах — два разных учёта.
 */
export const MOCK_CONSTRUCTION_SITES: readonly ConstructionSite[] = [
  {
    id: 'olympiyskaya-derevnya',
    name: 'Олимпийская деревня',
    status: 'normal',
    lifecycle: 'active',
    executive: emptyExecutive('ДР · Шираз · Сасун · Араик Армен'),
  },
  {
    id: 'anokhina',
    name: 'Анохина',
    status: 'normal',
    lifecycle: 'active',
    executive: emptyExecutive('12 бригад по ведомости'),
  },
  {
    id: 'brusilova',
    name: 'Брусилова',
    status: 'normal',
    lifecycle: 'active',
    executive: emptyExecutive('ДР · Агван · Зоро · Денис · Бату'),
  },
  {
    id: 'mcd2-butovo',
    name: 'Бутово',
    status: 'normal',
    lifecycle: 'active',
    executive: emptyExecutive('ДР · Вартан · Вануш'),
  },
  {
    id: 'koshtoyantsa',
    name: 'Коштоянца',
    status: 'normal',
    lifecycle: 'active',
    executive: emptyExecutive('ДР · МСК-ХОРТ · Сасун'),
  },
] as const
