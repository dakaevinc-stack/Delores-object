/** Узел на схеме «как в паспорте техники» — id совпадает с repair.affectedParts */
export type FleetSchematicPartId =
  | 'engine'
  | 'steering'
  | 'transmission'
  | 'hydraulics'
  | 'brakes'
  | 'suspension'
  | 'body'
  | 'crane'
  | 'bucket'
  | 'undercarriage'
  | 'electronics'

/** Подписи узлов на схеме и в таблице ремонтов */
export const FLEET_PART_LABEL_RU: Record<FleetSchematicPartId, string> = {
  engine: 'Двигатель',
  steering: 'Рулевое',
  transmission: 'КПП',
  hydraulics: 'Гидравлика',
  brakes: 'Тормоза',
  suspension: 'Подвеска',
  body: 'Кузов / рама',
  crane: 'КМУ / стрела',
  bucket: 'Ковш',
  undercarriage: 'Ходовая',
  electronics: 'Электрика',
}

/**
 * Заранее известные классы техники (из оригинального парка).
 * Для поиска в Record-ах и switch-ах — сюда нельзя класть кастомные строки.
 */
export type FleetPresetCategoryId =
  | 'light-trucks'
  | 'buses'
  | 'special-trucks'
  | 'dump-trucks'
  | 'road-tractors'
  | 'trailers'
  | 'front-loaders'
  | 'mini-loaders'
  | 'backhoes'
  | 'excavators'
  | 'rollers'
  | 'pavers'
  | 'cold-mills'

/**
 * Идентификатор класса техники.
 * Может быть одним из preset-значений или произвольной строкой
 * (slug), если пользователь добавил свой класс (например, «автокраны»).
 */
export type FleetCategoryId = FleetPresetCategoryId | (string & {})

export type FleetCategory = {
  id: FleetCategoryId
  title: string
  shortTitle: string
  /** Пользовательская категория (создана вручную, а не в штатном списке). */
  custom?: boolean
}

/** Набор preset-id-шников для быстрых проверок «это из штатного списка?». */
export const FLEET_PRESET_CATEGORY_IDS: readonly FleetPresetCategoryId[] = [
  'light-trucks',
  'buses',
  'special-trucks',
  'dump-trucks',
  'road-tractors',
  'trailers',
  'front-loaders',
  'mini-loaders',
  'backhoes',
  'excavators',
  'rollers',
  'pavers',
  'cold-mills',
]

export function isPresetCategoryId(id: string): id is FleetPresetCategoryId {
  return (FLEET_PRESET_CATEGORY_IDS as readonly string[]).includes(id)
}

export type FleetRepairRecord = {
  id: string
  dateIso: string
  mileageKm?: number
  title: string
  details?: string
  /** Узлы на схеме подсветки (активные неисправности — последняя запись с open=true) */
  affectedParts: FleetSchematicPartId[]
  /** Если true — считаем неисправность ещё актуальной для подсветки */
  open: boolean
  /** Стоимость ремонта/работ, ₽. Для открытых записей — оценка / согласованный бюджет. */
  costRub?: number
}

export type FleetMaintenancePlan = {
  lastServiceDateIso?: string
  lastServiceMileageKm?: number
  nextDueDateIso?: string
  nextDueMileageKm?: number
  intervalKm?: number
  notes?: string
  /** Стоимость последнего ТО, ₽ (факт). */
  lastServiceCostRub?: number
  /** Накоплено расходов на ТО с начала года, ₽ (демо — для KPI). */
  ytdServiceCostRub?: number
}

export type FleetInsurance = {
  policyNumber?: string
  insurer?: string
  validUntilIso: string
  /** Годовая страховая премия, ₽ (стоимость текущего полиса). */
  annualPremiumRub?: number
  /**
   * Страхование ОСАГО не требуется (например, для полуприцепов —
   * ст. 4 п.3 ФЗ №40).
   * Если `true`, срок действия/премия в UI показываются как «Не требуется».
   */
  notRequired?: boolean
}

/** Диагностическая карта (техосмотр) — отдельный документ. */
export type FleetTechnicalInspection = {
  /** Номер диагностической карты (длинный цифровой идентификатор в ЕАИСТО). */
  cardNumber?: string
  /** Срок действия. Если дата в прошлом — ДК считается просроченной. */
  validUntilIso?: string
}

export type FleetPass = {
  id: string
  name: string
  required: boolean
  validUntilIso?: string
  notes?: string
}

/* ============================================================
   Паспорт техники — «живые» технические данные
   ============================================================ */

export type FleetFuel = 'diesel' | 'petrol' | 'gas' | 'hybrid' | 'electric'
export type FleetTransmission = 'manual' | 'automatic' | 'robotic' | 'hydrostatic'
export type FleetOwnership = 'owned' | 'leased' | 'rented'

export type FleetSpecs = {
  /** Год выпуска */
  year?: number
  /** Бренд / производитель (КАМАЗ, Shacman, Volvo, …) */
  manufacturer?: string
  /** Страна производства (Россия, Китай, Швеция, …) */
  countryOfOrigin?: string
  /** Мощность двигателя, л.с. */
  enginePowerHp?: number
  /** Объём двигателя, л (опционально) */
  engineVolumeL?: number
  /** Тип топлива */
  fuel?: FleetFuel
  /** Тип коробки передач */
  transmission?: FleetTransmission
  /** Пробег, км (для колёсной техники) */
  odometerKm?: number
  /** Моточасы (для спецтехники — экскаваторы, катки, погрузчики) */
  engineHours?: number
  /** Цвет кузова / кабины */
  color?: string
  /** Форма владения */
  ownership?: FleetOwnership
  /** Дата постановки в парк (ISO) */
  acquiredDateIso?: string
  /** Закреплённый водитель / оператор */
  responsibleOperator?: string
  /**
   * Контактный телефон ответственного за технику.
   * Хранится в нормализованном виде (например, «+7 999 000‑00‑00»),
   * в UI рендерится как `tel:` для быстрого набора с мобильного.
   */
  responsiblePhone?: string
  /** GPS‑трекер — провайдер (Wialon, ГлонассСофт…) */
  trackerProvider?: string
  /** Идентификатор трекера в системе */
  trackerId?: string
  /** Грузоподъёмность, кг (грузовики / тягачи / самосвалы) */
  payloadKg?: number
  /** Объём кузова, м³ (самосвалы / фургоны) */
  bodyVolumeM3?: number
  /** Требуемая категория прав (B, C, CE, D, тракторист‑машинист…) */
  licenseCategory?: string
  /** Серия и номер СТС. */
  registrationCertificate?: string
  /** Дата выдачи СТС. */
  registrationCertificateIssuedIso?: string
  /** Номер ПТС (или ЭПТС — в этом случае будет длинный цифровой идентификатор). */
  vehiclePassport?: string
  /** Дата выдачи ПТС/ЭПТС. */
  vehiclePassportIssuedIso?: string
  /** Лизингодатель (актуально, когда `ownership: 'leased'`). */
  leasingCompany?: string
  /**
   * Фактический владелец по документам (СТС/ПТС) — юр. или физ. лицо.
   * Используется для аренды у частников и для случаев, когда машина
   * зарегистрирована не на основное юрлицо.
   */
  registeredOwner?: string
}

export type FleetVehicle = {
  id: string
  categoryId: FleetCategoryId
  plate: string
  vinOrFrame: string
  model: string
  repairs: FleetRepairRecord[]
  maintenance: FleetMaintenancePlan
  insurance: FleetInsurance
  passes: FleetPass[]
  /** Диагностическая карта (техосмотр) — отдельный документ. */
  technicalInspection?: FleetTechnicalInspection
  /** Техпаспорт: мощность, топливо, пробег и т.д. */
  specs?: FleetSpecs
  /** Если задано — в карточке вместо схемы показываем фото (путь из `/public` или URL). */
  heroPhotoUrl?: string
  /** Какой силуэт рисовать до появления ваших PDF/SVG */
  schematicVariant: 'truck' | 'articulated' | 'excavator' | 'loader' | 'roller' | 'paver' | 'generic'
}

export type InsuranceUrgency = 'ok' | 'soon' | 'critical' | 'expired'

const MS_DAY = 86400000

export function daysUntil(isoDate: string, from = new Date()): number {
  const end = new Date(isoDate)
  const t0 = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const t1 = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  return Math.round((t1 - t0) / MS_DAY)
}

export function insuranceUrgency(validUntilIso: string, from = new Date()): InsuranceUrgency {
  const d = daysUntil(validUntilIso, from)
  if (d < 0) return 'expired'
  if (d <= 14) return 'critical'
  if (d <= 45) return 'soon'
  return 'ok'
}

/** Срочность ДК/техосмотра — для единообразных индикаторов в UI. */
export function technicalInspectionUrgency(
  validUntilIso: string | undefined,
  from = new Date(),
): InsuranceUrgency | 'missing' {
  if (!validUntilIso) return 'missing'
  return insuranceUrgency(validUntilIso, from)
}

export function activeFaultParts(vehicle: FleetVehicle): FleetSchematicPartId[] {
  const open = vehicle.repairs.filter((r) => r.open)
  if (open.length === 0) return []
  const last = open.reduce((a, b) => (a.dateIso >= b.dateIso ? a : b))
  return last.affectedParts
}

/* ============================================================
   Финансовый блок — стоимость владения техникой
   ============================================================ */

export type FleetCostBreakdown = {
  /** Сумма закрытых (фактически оплаченных) ремонтов. */
  repairsClosedRub: number
  /** Сумма открытых ремонтов (оценка/бюджет в работе). */
  repairsOpenRub: number
  /** Ремонты всего (closed + open). */
  repairsTotalRub: number
  /** Накоплено по ТО с начала года. */
  maintenanceYtdRub: number
  /** Годовая страховая премия. */
  insuranceAnnualRub: number
  /** Итого по всем статьям. */
  totalRub: number
}

function sumRepairs(vehicle: FleetVehicle, predicate: (r: FleetRepairRecord) => boolean): number {
  return vehicle.repairs
    .filter(predicate)
    .reduce((acc, r) => acc + (r.costRub ?? 0), 0)
}

export function costBreakdown(vehicle: FleetVehicle): FleetCostBreakdown {
  const repairsClosedRub = sumRepairs(vehicle, (r) => !r.open)
  const repairsOpenRub = sumRepairs(vehicle, (r) => r.open)
  const repairsTotalRub = repairsClosedRub + repairsOpenRub
  const maintenanceYtdRub = vehicle.maintenance.ytdServiceCostRub ?? 0
  const insuranceAnnualRub = vehicle.insurance.annualPremiumRub ?? 0
  const totalRub = repairsTotalRub + maintenanceYtdRub + insuranceAnnualRub
  return {
    repairsClosedRub,
    repairsOpenRub,
    repairsTotalRub,
    maintenanceYtdRub,
    insuranceAnnualRub,
    totalRub,
  }
}

/** Суммарные расходы (ремонты + ТО YTD + страховка) — короткий accessor. */
export function totalCostRub(vehicle: FleetVehicle): number {
  return costBreakdown(vehicle).totalRub
}

/** Форматирование суммы в ₽ (без копеек, с неразрывными пробелами). */
export function formatRub(rub: number): string {
  return rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽'
}
