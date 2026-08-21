/**
 * Зоны страницы объекта и должности.
 * Сейчас все зоны на экране. Когда появится вход — человеку покажем
 * только `ZONES_BY_DUTY[должность]`.
 */
export type SitePageZoneId = 'manager' | 'brigadier' | 'supply' | 'dispatcher'

/** Должность на входе. */
export type SiteDutyRole = 'manager' | 'brigadier' | 'supply' | 'dispatcher'

export const SITE_PAGE_ZONES: Record<
  SitePageZoneId,
  { kicker: string; title: string; lead: string }
> = {
  manager: {
    kicker: 'Руководитель',
    title: 'Объект и план',
    lead: 'Сроки, график и справка план/факт по объекту.',
  },
  brigadier: {
    kicker: 'Бригадир',
    title: 'Смена на объекте',
    lead: 'Поставки на сегодня, задания дня и журнал смены.',
  },
  supply: {
    kicker: 'Снабжение',
    title: 'Материалы и заявки',
    lead: 'Согласование, приёмка на объекте и расход по смете.',
  },
  dispatcher: {
    kicker: 'Диспетчер',
    title: 'Рейс водителю',
    lead: 'Точка на карте, груз и отправка в кабинет.',
  },
}

/**
 * Что можно делать с должности. Рейс водителю — только диспетчер и руководитель.
 * Бригадир заказывает материал и ставит точку выгрузки.
 */
export const SITE_DUTY_CAPABILITIES = {
  manager: {
    seeAllZones: true,
    orderMaterial: true,
    editUnloadPoint: true,
    assignDriverTrip: true,
    approveSupply: true,
  },
  brigadier: {
    seeAllZones: false,
    orderMaterial: true,
    editUnloadPoint: true,
    assignDriverTrip: false,
    approveSupply: false,
  },
  supply: {
    seeAllZones: false,
    orderMaterial: false,
    editUnloadPoint: false,
    assignDriverTrip: false,
    approveSupply: true,
  },
  dispatcher: {
    seeAllZones: false,
    orderMaterial: false,
    editUnloadPoint: false,
    assignDriverTrip: true,
    approveSupply: false,
  },
} as const satisfies Record<
  SiteDutyRole,
  {
    seeAllZones: boolean
    orderMaterial: boolean
    editUnloadPoint: boolean
    assignDriverTrip: boolean
    approveSupply: boolean
  }
>

/** Какие зоны открыть человеку после входа. */
export const ZONES_BY_DUTY: Record<SiteDutyRole, readonly SitePageZoneId[]> = {
  manager: ['manager', 'brigadier', 'supply', 'dispatcher'],
  brigadier: ['brigadier'],
  supply: ['supply'],
  dispatcher: ['dispatcher'],
}

/** @deprecated используйте ZONES_BY_DUTY */
export const ZONES_BY_SITE_ROLE = ZONES_BY_DUTY
