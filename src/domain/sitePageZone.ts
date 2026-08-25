/**
 * Зоны страницы объекта и должности.
 *
 * Порядок зон на экране руководителя (сверху вниз) = цепочка работы объекта:
 *   проект и сводка → смена → материалы → рейс.
 * После входа человеку покажем только `zonesForDuty(должность)`.
 *
 * Водитель на страницу объекта не заходит — у него кабинет `/driver`.
 */
export type SitePageZoneId = 'manager' | 'brigadier' | 'supply' | 'dispatcher'

/**
 * Должность на входе.
 * `deputy` = те же зоны и права, что у руководителя / гендиректора.
 * `pto` = документы проекта и сводка (ПТО / инженеры).
 * `driver` = только кабинет рейсов, зоны объекта пустые.
 */
export type SiteDutyRole =
  | 'manager'
  | 'deputy'
  | 'pto'
  | 'brigadier'
  | 'supply'
  | 'dispatcher'
  | 'driver'

/** Канонический порядок зон на полном экране (руководитель / зам). */
export const SITE_PAGE_ZONE_ORDER = [
  'manager',
  'brigadier',
  'supply',
  'dispatcher',
] as const satisfies readonly SitePageZoneId[]

export const SITE_PAGE_ZONES: Record<
  SitePageZoneId,
  { kicker: string; title: string; lead: string }
> = {
  manager: {
    kicker: 'Проект',
    title: 'Документы проекта',
    lead: 'PDF и DWG этого объекта — откройте, если на смене нужно свериться с чертежом или объёмами.',
  },
  brigadier: {
    kicker: 'Бригадир',
    title: 'Смена на объекте',
    lead: 'Задания дня, поставки на сегодня и журнал смены.',
  },
  supply: {
    kicker: 'Снабжение',
    title: 'Материалы и заявки',
    lead: 'Реестр, согласование и расход по смете. Новые заявки создаёт бригадир.',
  },
  dispatcher: {
    kicker: 'Диспетчер',
    title: 'Рейс водителю',
    lead: 'Точка, груз и назначение. Свои рейсы водитель смотрит в личном кабинете.',
  },
}

type DutyCapabilities = {
  /** Видит все зоны страницы объекта (руководитель / зам). */
  seeAllZones: boolean
  /** Может создать заявку на материал. */
  orderMaterial: boolean
  /** Может править точку выгрузки. */
  editUnloadPoint: boolean
  /** Может назначить рейс водителю. */
  assignDriverTrip: boolean
  /** Может согласовывать / проводить заявки снабжения. */
  approveSupply: boolean
}

const FULL_ACCESS = {
  seeAllZones: true,
  orderMaterial: true,
  editUnloadPoint: true,
  assignDriverTrip: true,
  approveSupply: true,
} as const satisfies DutyCapabilities

/**
 * Что можно делать с должности.
 * Рейс водителю — диспетчер, руководитель и зам.
 * Бригадир заказывает материал и ставит точку выгрузки на объекте.
 */
export const SITE_DUTY_CAPABILITIES = {
  manager: FULL_ACCESS,
  deputy: FULL_ACCESS,
  pto: FULL_ACCESS,
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
  driver: {
    seeAllZones: false,
    orderMaterial: false,
    editUnloadPoint: false,
    assignDriverTrip: false,
    approveSupply: false,
  },
} as const satisfies Record<SiteDutyRole, DutyCapabilities>

/**
 * Какие зоны открыть человеку после входа.
 * Порядок внутри массива = порядок на экране.
 */
export const ZONES_BY_DUTY: Record<SiteDutyRole, readonly SitePageZoneId[]> = {
  /** Гендиректор, нач. участка, нач. отдела — весь объект. */
  manager: SITE_PAGE_ZONE_ORDER,
  /** Замгендиректора — весь объект. */
  deputy: SITE_PAGE_ZONE_ORDER,
  /** ПТО / инженеры — весь объект (как руководство). */
  pto: SITE_PAGE_ZONE_ORDER,
  brigadier: ['brigadier'],
  supply: ['supply'],
  dispatcher: ['dispatcher'],
  /** Водитель / машинист / тракторист / механизатор — кабинет `/driver`. */
  driver: [],
}

/** Зоны для должности — единая точка для фильтра страницы объекта. */
export function zonesForDuty(duty: SiteDutyRole): readonly SitePageZoneId[] {
  return ZONES_BY_DUTY[duty]
}

/** Главная: портфельные KPI — руководству и ПТО. */
export function homeShowsPortfolioKpi(duty: SiteDutyRole): boolean {
  return duty === 'manager' || duty === 'deputy' || duty === 'pto'
}

/** Главная: хабы парка и приёмки — руководству и ПТО. */
export function homeShowsHubs(duty: SiteDutyRole): boolean {
  return duty === 'manager' || duty === 'deputy' || duty === 'pto'
}

/** @deprecated используйте ZONES_BY_DUTY / zonesForDuty */
export const ZONES_BY_SITE_ROLE = ZONES_BY_DUTY

/**
 * Пока нет входа — на объекте показываем полный экран руководителя,
 * чтобы все зоны были на месте и в правильном порядке.
 * После auth заменить на должность из сессии.
 */
export const SITE_PAGE_PREVIEW_DUTY: SiteDutyRole = 'manager'
