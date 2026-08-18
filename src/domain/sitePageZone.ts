/**
 * Зоны страницы объекта. Сейчас все видны сразу.
 * Позже вход по должности покажет только свои зоны.
 */
export type SitePageZoneId = 'manager' | 'brigadier' | 'supply' | 'dispatcher'

export const SITE_PAGE_ZONES: Record<
  SitePageZoneId,
  { kicker: string; title: string; lead: string }
> = {
  manager: {
    kicker: 'Руководитель',
    title: 'Объект и план',
    lead: 'Срок, график, отчётность и справка план/факт.',
  },
  brigadier: {
    kicker: 'Бригадир',
    title: 'Смена на объекте',
    lead: 'Задания дня, приёмка материала и журнал смены.',
  },
  supply: {
    kicker: 'Снабжение',
    title: 'Материал',
    lead: 'Заявки, согласование и расход по смете.',
  },
  dispatcher: {
    kicker: 'Диспетчер',
    title: 'Рейсы',
    lead: 'Точка разгрузки и маршрут водителю.',
  },
}

/** Какие зоны открыть человеку. Подключим, когда появится должность на входе. */
export const ZONES_BY_SITE_ROLE: Record<SitePageZoneId, readonly SitePageZoneId[]> = {
  manager: ['manager', 'brigadier', 'supply', 'dispatcher'],
  brigadier: ['brigadier'],
  supply: ['supply'],
  dispatcher: ['dispatcher'],
}
