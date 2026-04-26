import type {
  FleetCategory,
  FleetCategoryId,
  FleetFuel,
  FleetInsurance,
  FleetMaintenancePlan,
  FleetOwnership,
  FleetPass,
  FleetPresetCategoryId,
  FleetRepairRecord,
  FleetSpecs,
  FleetTechnicalInspection,
  FleetTransmission,
  FleetVehicle,
} from '../domain/fleet'
import { isPresetCategoryId } from '../domain/fleet'

/** Preset-классы со строго narrow id — так TS различает заранее известные категории. */
export const FLEET_CATEGORIES: readonly (FleetCategory & { id: FleetPresetCategoryId })[] = [
  { id: 'light-trucks', title: 'Малотоннажные автомобили', shortTitle: 'Малотоннажные' },
  { id: 'buses', title: 'Автобусы', shortTitle: 'Автобусы' },
  { id: 'special-trucks', title: 'Автомобили специальные', shortTitle: 'Спецавто' },
  { id: 'dump-trucks', title: 'Самосвалы', shortTitle: 'Самосвалы' },
  { id: 'road-tractors', title: 'Седельные тягачи', shortTitle: 'Тягачи' },
  { id: 'trailers', title: 'Полуприцепы (прицепы)', shortTitle: 'Прицепы' },
  { id: 'front-loaders', title: 'Фронтальные погрузчики', shortTitle: 'Фронт. погрузчики' },
  { id: 'mini-loaders', title: 'Минипогрузчики', shortTitle: 'Мини-погрузчики' },
  { id: 'backhoes', title: 'Экскаваторы погрузчики', shortTitle: 'Экскаваторы-погрузчики' },
  { id: 'excavators', title: 'Экскаваторы', shortTitle: 'Экскаваторы' },
  { id: 'rollers', title: 'Катки', shortTitle: 'Катки' },
  { id: 'pavers', title: 'Асфальтоукладчики', shortTitle: 'Укладчики' },
  { id: 'cold-mills', title: 'Фрезы', shortTitle: 'Фрезы' },
]

type Sch = FleetVehicle['schematicVariant']

function schematicFor(cat: FleetCategoryId): Sch {
  switch (cat) {
    case 'excavators':
      return 'excavator'
    case 'front-loaders':
    case 'mini-loaders':
      return 'loader'
    case 'rollers':
      return 'roller'
    case 'pavers':
      return 'paver'
    case 'special-trucks':
    case 'backhoes':
      return 'articulated'
    case 'trailers':
    case 'cold-mills':
      return 'generic'
    default:
      return 'truck'
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const today = new Date().toISOString().slice(0, 10)

/**
 * Базовые диапазоны стоимостей по категориям (демо, ₽).
 * service — один плановый регламент, insurance — годовая премия,
 * repair — диапазон для типового ремонта/узла.
 * Цифры приближены к рыночным на 2025 год для стройтехники
 * и коммерческого парка в Московском регионе.
 */
type CostRange = {
  service: [number, number]
  insurance: [number, number]
  repair: [number, number]
  majorRepair: [number, number]
}

const COST_RANGES: Record<FleetPresetCategoryId, CostRange> = {
  'light-trucks':   { service: [14_000, 32_000], insurance: [28_000, 58_000], repair: [6_000, 45_000],   majorRepair: [60_000, 180_000] },
  buses:            { service: [18_000, 38_000], insurance: [35_000, 70_000], repair: [8_000, 55_000],   majorRepair: [80_000, 220_000] },
  'special-trucks': { service: [38_000, 75_000], insurance: [70_000, 140_000], repair: [18_000, 130_000], majorRepair: [150_000, 420_000] },
  'dump-trucks':    { service: [45_000, 90_000], insurance: [85_000, 160_000], repair: [22_000, 160_000], majorRepair: [220_000, 650_000] },
  'road-tractors':  { service: [42_000, 85_000], insurance: [95_000, 180_000], repair: [20_000, 150_000], majorRepair: [220_000, 580_000] },
  trailers:         { service: [6_000, 18_000],  insurance: [12_000, 28_000],  repair: [4_000, 28_000],   majorRepair: [45_000, 140_000] },
  'front-loaders':  { service: [55_000, 120_000],insurance: [45_000, 95_000],  repair: [25_000, 180_000], majorRepair: [280_000, 780_000] },
  'mini-loaders':   { service: [28_000, 65_000], insurance: [28_000, 65_000],  repair: [14_000, 95_000],  majorRepair: [120_000, 360_000] },
  backhoes:         { service: [48_000, 110_000],insurance: [48_000, 100_000], repair: [22_000, 170_000], majorRepair: [240_000, 640_000] },
  excavators:       { service: [60_000, 150_000],insurance: [60_000, 130_000], repair: [35_000, 240_000], majorRepair: [340_000, 980_000] },
  rollers:          { service: [32_000, 75_000], insurance: [30_000, 62_000],  repair: [18_000, 140_000], majorRepair: [180_000, 520_000] },
  pavers:           { service: [70_000, 160_000],insurance: [55_000, 120_000], repair: [40_000, 280_000], majorRepair: [380_000, 1_100_000] },
  'cold-mills':     { service: [75_000, 180_000],insurance: [60_000, 130_000], repair: [45_000, 320_000], majorRepair: [420_000, 1_400_000] },
}

/** Детерминированный выбор числа из диапазона по seed — даёт стабильные демо-значения. */
function pickInRange(seed: number, range: [number, number], step = 500): number {
  const [min, max] = range
  const span = Math.max(0, Math.floor((max - min) / step))
  const v = min + (seed % (span + 1)) * step
  return v
}

/** Для custom-классов ориентируемся на «специальную технику» как нейтральный средний вариант. */
const FALLBACK_PRESET: FleetPresetCategoryId = 'special-trucks'

function presetId(categoryId: FleetCategoryId): FleetPresetCategoryId {
  return isPresetCategoryId(categoryId) ? categoryId : FALLBACK_PRESET
}

function defaultInsurance(seed: number, categoryId: FleetCategoryId): FleetInsurance {
  const offsets = [120, 25, 8, 200, 40, 60, 15, 90, 5, 300]
  const days = offsets[seed % offsets.length]
  const ranges = COST_RANGES[presetId(categoryId)]
  const premium = pickInRange(seed * 7 + 3, ranges.insurance, 1000)
  return {
    policyNumber: `ПС-${10000 + (seed % 89999)}`,
    insurer: 'АО «Страховой партнёр» (демо)',
    validUntilIso: addDays(today, days),
    annualPremiumRub: premium,
  }
}

function defaultMaintenance(seed: number, categoryId: FleetCategoryId): FleetMaintenancePlan {
  const ranges = COST_RANGES[presetId(categoryId)]
  const lastServiceCost = pickInRange(seed * 3 + 1, ranges.service, 500)
  /* Накоплено за год: в среднем 2–4 регламента (зависит от сезонности/загрузки). */
  const servicesThisYear = 2 + (seed % 3)
  const ytd = Math.round(lastServiceCost * (0.85 + (seed % 30) / 100) * servicesThisYear)
  return {
    lastServiceDateIso: addDays(today, -((seed % 40) + 10)),
    lastServiceMileageKm: 120000 + (seed % 80) * 1000,
    nextDueDateIso: addDays(today, (seed % 25) + 5),
    nextDueMileageKm: 127000 + (seed % 50) * 500,
    intervalKm: 10000,
    notes: 'Нормативы ТО — демо-данные, замените на факт из 1С / журнала.',
    lastServiceCostRub: lastServiceCost,
    ytdServiceCostRub: ytd,
  }
}

function defaultPasses(seed: number): FleetPass[] {
  /* Пропуск по СК — не у каждой единицы, но у тех, кто работает на крупных
     площадках. Состояние выбираем детерминированно по seed, чтобы в демо
     было и «действует», и «истёк», и «нет пропуска». */
  const mode = seed % 5
  if (mode === 0 || mode === 1) {
    return [
      {
        id: 'p-sk',
        name: 'Пропуск по СК',
        required: true,
        validUntilIso: addDays(today, 40 + (seed % 90)),
        notes: 'Доступ в зону строительства',
      },
    ]
  }
  if (mode === 2) {
    return [
      {
        id: 'p-sk',
        name: 'Пропуск по СК',
        required: true,
        validUntilIso: addDays(today, 5 + (seed % 10)),
        notes: 'Доступ в зону строительства',
      },
    ]
  }
  if (mode === 3) {
    return [
      {
        id: 'p-sk',
        name: 'Пропуск по СК',
        required: true,
        validUntilIso: addDays(today, -((seed % 20) + 5)),
        notes: 'Продлить до выхода техники',
      },
    ]
  }
  return []
}

/* ============================================================
   Паспорт техники — выдуманные, но правдоподобные данные.
   Значения детерминированы по seed, чтобы в демо были
   стабильные «приличные» характеристики.
   ============================================================ */

function guessBrand(model: string): { brand: string; country: string } | null {
  if (/камаз|kamaz|ko\s*-?\s*806|нефаз/i.test(model)) return { brand: 'КАМАЗ', country: 'Россия' }
  if (/\bгаз[-\s]?|gazelle|газель|a22r32|а22r32|2705|278865|3302/i.test(model)) {
    return { brand: 'ГАЗ', country: 'Россия' }
  }
  if (/shacman|шакман/i.test(model)) return { brand: 'Shacman', country: 'Китай' }
  if (/howo/i.test(model)) return { brand: 'HOWO', country: 'Китай' }
  if (/sany|sy\s?\d{2,3}/i.test(model)) return { brand: 'SANY', country: 'Китай' }
  if (/foton/i.test(model)) return { brand: 'FOTON', country: 'Китай' }
  if (/xcmg|zl\s?30/i.test(model)) return { brand: 'XCMG', country: 'Китай' }
  if (/ensign|yx\s?635/i.test(model)) return { brand: 'Ensign', country: 'Китай' }
  if (/ford|transit/i.test(model)) return { brand: 'Ford', country: 'Турция' }
  if (/scania/i.test(model)) return { brand: 'Scania', country: 'Швеция' }
  if (/\bvolvo\b/i.test(model)) return { brand: 'Volvo', country: 'Швеция' }
  if (/mercedes|мерседес|actros/i.test(model)) return { brand: 'Mercedes-Benz', country: 'Германия' }
  if (/\bman\b/i.test(model)) return { brand: 'MAN', country: 'Германия' }
  if (/caterpillar|\bcat\b|\b318\s*cl\b|432\s*f2|\b428\b/i.test(model)) {
    return { brand: 'Caterpillar', country: 'США' }
  }
  if (/\bcase\b|sr\s?2\d{2}|570\s*st|580\s*t/i.test(model)) return { brand: 'CASE', country: 'США' }
  if (/jcb/i.test(model)) return { brand: 'JCB', country: 'Великобритания' }
  if (/komatsu/i.test(model)) return { brand: 'Komatsu', country: 'Япония' }
  if (/hitachi/i.test(model)) return { brand: 'Hitachi', country: 'Япония' }
  if (/hyundai|хундай/i.test(model)) return { brand: 'Hyundai', country: 'Корея' }
  if (/doosan/i.test(model)) return { brand: 'Doosan', country: 'Корея' }
  if (/liebherr/i.test(model)) return { brand: 'Liebherr', country: 'Германия' }
  if (/vogele|vögele|super\s?\d{3,4}/i.test(model)) return { brand: 'VÖGELE', country: 'Германия' }
  if (/hamm|arx/i.test(model)) return { brand: 'HAMM', country: 'Германия' }
  if (/wirtgen/i.test(model)) return { brand: 'Wirtgen', country: 'Германия' }
  if (/bomag/i.test(model)) return { brand: 'BOMAG', country: 'Германия' }
  if (/\bмаз\b|\bmaz\b/i.test(model)) return { brand: 'МАЗ', country: 'Беларусь' }
  if (/лиаз|liaz/i.test(model)) return { brand: 'ЛиАЗ', country: 'Россия' }
  if (/муп[-\s]?351|муп\b/i.test(model)) return { brand: 'МУП‑351', country: 'Россия' }
  if (/регион[-\s]?45|ас[-\s]?с41/i.test(model)) return { brand: 'Регион‑45', country: 'Россия' }
  return null
}

const POWER_BY_CATEGORY: Record<FleetPresetCategoryId, [number, number]> = {
  'light-trucks':   [106, 170],
  buses:            [125, 205],
  'special-trucks': [240, 400],
  'dump-trucks':    [380, 500],
  'road-tractors':  [420, 540],
  trailers:         [0, 0],
  'front-loaders':  [220, 340],
  'mini-loaders':   [60, 92],
  backhoes:         [92, 110],
  excavators:       [110, 220],
  rollers:          [75, 140],
  pavers:           [110, 175],
  'cold-mills':     [230, 570],
}

const ODO_KM_BY_CATEGORY: Partial<Record<FleetPresetCategoryId, [number, number]>> = {
  'light-trucks':   [38_000, 240_000],
  buses:            [70_000, 320_000],
  'special-trucks': [50_000, 280_000],
  'dump-trucks':    [60_000, 340_000],
  'road-tractors':  [180_000, 720_000],
}

const HOURS_BY_CATEGORY: Partial<Record<FleetPresetCategoryId, [number, number]>> = {
  'front-loaders':  [2_500, 12_000],
  'mini-loaders':   [1_500, 8_000],
  backhoes:         [2_000, 10_000],
  excavators:       [2_500, 14_000],
  rollers:          [1_500, 9_000],
  pavers:           [1_500, 8_000],
  'cold-mills':     [1_500, 8_000],
}

const TRANSMISSION_BY_CATEGORY: Record<FleetPresetCategoryId, FleetTransmission> = {
  'light-trucks':   'manual',
  buses:            'manual',
  'special-trucks': 'automatic',
  'dump-trucks':    'automatic',
  'road-tractors':  'automatic',
  trailers:         'manual',
  'front-loaders':  'automatic',
  'mini-loaders':   'hydrostatic',
  backhoes:         'automatic',
  excavators:       'hydrostatic',
  rollers:          'hydrostatic',
  pavers:           'hydrostatic',
  'cold-mills':     'hydrostatic',
}

const LICENSE_BY_CATEGORY: Record<FleetPresetCategoryId, string> = {
  'light-trucks':   'B, BC',
  buses:            'D',
  'special-trucks': 'C, CE',
  'dump-trucks':    'CE',
  'road-tractors':  'CE',
  trailers:         'CE',
  'front-loaders':  'Тракторист‑машинист C',
  'mini-loaders':   'Тракторист‑машинист C',
  backhoes:         'Тракторист‑машинист C',
  excavators:       'Тракторист‑машинист D',
  rollers:          'Тракторист‑машинист B',
  pavers:           'Тракторист‑машинист D',
  'cold-mills':     'Тракторист‑машинист D',
}

const COLORS = ['белый', 'оранжевый', 'жёлтый', 'синий', 'красный', 'серый', 'чёрный', 'зелёный']
const OPERATORS = [
  'Петров И. А.',
  'Иванов С. В.',
  'Смирнов Д. О.',
  'Кузнецов А. Н.',
  'Попов В. С.',
  'Соколов М. Ю.',
  'Михайлов Е. И.',
  'Фёдоров К. В.',
  'Новиков П. А.',
  'Васильев Р. Т.',
  'Зайцев О. Д.',
  'Морозов И. С.',
  'Семёнов А. В.',
  'Егоров Д. А.',
]
const TRACKERS = ['Wialon', 'ГЛОНАССSoft', 'Omnicomm', 'Fort Monitor', 'СКАУТ']
const OWNERSHIPS: FleetOwnership[] = ['owned', 'owned', 'owned', 'leased', 'rented']
const FUELS_TRUCKS: FleetFuel[] = ['diesel', 'diesel', 'diesel', 'gas']

function pickSpecsYear(seed: number): number {
  const min = 2015
  const max = 2024
  return min + (seed % (max - min + 1))
}

function extractYearFromModel(model: string): number | null {
  const m = model.match(/\b(19|20)\d{2}\b/)
  if (!m) return null
  const y = Number(m[0])
  return y >= 1980 && y <= new Date().getFullYear() ? y : null
}

function defaultSpecs(seed: number, categoryId: FleetCategoryId, model: string): FleetSpecs {
  const pid = presetId(categoryId)
  const brand = guessBrand(model)
  const year = extractYearFromModel(model) ?? pickSpecsYear(seed)
  const acquired = addDays(`${year}-06-15`, (seed % 120) - 60)
  const fuel: FleetFuel | undefined =
    pid === 'trailers' ? undefined : FUELS_TRUCKS[seed % FUELS_TRUCKS.length]

  const power = POWER_BY_CATEGORY[pid]
  const enginePowerHp = power[1] === 0 ? undefined : pickInRange(seed * 3 + 9, power, 5)

  const engineVolumeL =
    pid === 'trailers' || !enginePowerHp
      ? undefined
      : Math.round((enginePowerHp / 28 + (seed % 10) / 10) * 10) / 10 // ~3–18 л

  const odo = ODO_KM_BY_CATEGORY[pid]
  const odometerKm = odo ? pickInRange(seed * 11 + 17, odo, 500) : undefined

  const hours = HOURS_BY_CATEGORY[pid]
  const engineHours = hours ? pickInRange(seed * 7 + 3, hours, 50) : undefined

  const isTruckLike =
    pid === 'light-trucks' ||
    pid === 'special-trucks' ||
    pid === 'dump-trucks' ||
    pid === 'road-tractors' ||
    pid === 'trailers'
  const payloadKg = isTruckLike
    ? pid === 'light-trucks'
      ? 1500 + (seed % 12) * 100
      : pid === 'dump-trucks'
        ? 20000 + (seed % 10) * 500
        : pid === 'road-tractors'
          ? 20000 + (seed % 8) * 500
          : pid === 'trailers'
            ? 22000 + (seed % 6) * 500
            : 8000 + (seed % 10) * 500
    : undefined

  const bodyVolumeM3 =
    pid === 'dump-trucks'
      ? 12 + (seed % 16)
      : pid === 'special-trucks'
        ? /гудронатор/i.test(model)
          ? 4 + (seed % 6)
          : undefined
        : undefined

  return {
    year,
    manufacturer: brand?.brand,
    countryOfOrigin: brand?.country,
    enginePowerHp,
    engineVolumeL,
    fuel,
    transmission: pid === 'trailers' ? undefined : TRANSMISSION_BY_CATEGORY[pid],
    odometerKm,
    engineHours,
    color: COLORS[seed % COLORS.length],
    ownership: OWNERSHIPS[seed % OWNERSHIPS.length],
    acquiredDateIso: acquired,
    responsibleOperator: OPERATORS[seed % OPERATORS.length],
    trackerProvider: TRACKERS[seed % TRACKERS.length],
    trackerId: `TR-${1000 + (seed % 8999)}`,
    payloadKg,
    bodyVolumeM3,
    licenseCategory: LICENSE_BY_CATEGORY[pid],
    registrationCertificate: `${99}${String.fromCharCode(1040 + (seed % 32))}${String.fromCharCode(
      1040 + ((seed * 3) % 32),
    )} ${100000 + (seed * 7) % 899999}`,
  }
}

function defaultRepairs(seed: number, categoryId: FleetCategoryId): FleetRepairRecord[] {
  const ranges = COST_RANGES[presetId(categoryId)]

  /* Закрытая запись — плановый регламент (недорогой расход). */
  const closed: FleetRepairRecord = {
    id: `r-${seed}-1`,
    dateIso: addDays(today, -180 - (seed % 60)),
    mileageKm: 110000 + seed * 100,
    title: 'Плановое ТО, диагностика ходовой',
    details: 'Замена масла, фильтров. Замечаний нет.',
    affectedParts: [],
    open: false,
    costRub: pickInRange(seed * 5 + 2, ranges.service, 500),
  }
  const rows: FleetRepairRecord[] = [closed]

  /* Дополнительный закрытый ремонт — «узел» средней тяжести. */
  if (seed % 4 !== 0) {
    rows.push({
      id: `r-${seed}-2`,
      dateIso: addDays(today, -90 - (seed % 45)),
      mileageKm: 118000 + seed * 120,
      title: seed % 2 === 0 ? 'Замена колодок и тормозных дисков' : 'Ремонт электрики, датчики',
      details: seed % 2 === 0 ? 'Комплект передних + задних. Обкатка выполнена.' : 'Замена проводки, диагностика CAN-шины.',
      affectedParts: seed % 2 === 0 ? ['brakes'] : ['electronics'],
      open: false,
      costRub: pickInRange(seed * 11 + 7, ranges.repair, 500),
    })
  }

  /* Крупный восстановительный ремонт у небольшой доли парка. */
  if (seed % 7 === 2) {
    rows.push({
      id: `r-${seed}-3`,
      dateIso: addDays(today, -30 - (seed % 25)),
      mileageKm: 125000 + seed * 140,
      title: 'Капитальный ремонт узла',
      details: 'Переборка, замена расходников, стендовые испытания.',
      affectedParts: categoryId === 'excavators' || categoryId === 'front-loaders' || categoryId === 'backhoes'
        ? ['hydraulics', 'bucket']
        : ['engine', 'transmission'],
      open: false,
      costRub: pickInRange(seed * 13 + 5, ranges.majorRepair, 1000),
    })
  }

  /* Демо: «открытая» неисправность у части парка — подсветка на схеме. */
  if (seed % 11 === 3) {
    rows.push({
      id: `r-${seed}-open`,
      dateIso: addDays(today, -4),
      title: 'Жалобы на работу рулевого / шум в моторном отсеке',
      details: 'На согласовании у механика. Демо-запись для подсветки узлов.',
      affectedParts: ['steering', 'engine'],
      open: true,
      costRub: pickInRange(seed * 17 + 3, ranges.repair, 500),
    })
  } else if (seed % 13 === 5) {
    rows.push({
      id: `r-${seed}-open2`,
      dateIso: addDays(today, -2),
      title: 'Течь гидроцилиндра стрелы',
      affectedParts: ['hydraulics', 'bucket'],
      open: true,
      costRub: pickInRange(seed * 19 + 5, ranges.repair, 500),
    })
  }
  return rows
}

type Row = readonly [FleetCategoryId, string, string, string]

/** Реестр из переданного списка (госномер, VIN/рама, марка/модель) */
const FLEET_ROWS: Row[] = [
  ['light-trucks', 'Е 789 ТУ 799', 'Х96А22R32G2656379', 'ГАЗ А22R32 (грузовой бортовой)'],
  [
    'light-trucks',
    'Т 171 СС 750',
    'X96A22R32E2582297',
    'ГАЗ-А22R32 платформа с каркасом и тентом',
  ],
  ['light-trucks', 'В 456 АО 797', 'Х96A22R32E2580173', 'ГАЗ-A22R32 (грузовой с бортом)'],
  ['light-trucks', 'Н 900 ВО 977', 'X96A32R32M0915045', 'Газель GAZelle NEXT'],
  ['light-trucks', 'Т 189 УВ 777', 'Х96270500В0697236', 'ГАЗ 2705 (грузовой цельнометаллический 6 п/мест)'],
  ['light-trucks', 'С 982 ОА 797', 'Х96270500С1744419', 'ГАЗ 2705 грузовой фургон'],
  ['light-trucks', 'О 503 РТ 777', 'X96A22R32G2652087', 'ГАЗ-А22R32 (грузовой бортовой)'],
  ['light-trucks', 'О 035 КН 799', 'X8B278865J0018642', '278865 (бортовая платформа)'],
  ['light-trucks', 'У 479 МС 797', 'X2FXXXESGXKP43412', 'Ford Transit (техпомощь)'],
  ['light-trucks', 'У 978 ММ 797', 'XUS22278CG0002627', 'Ford Transit 22278С (автобус грузопассажирский)'],
  ['light-trucks', 'Е 335 ВК 977', 'XUS3227ARK0002907', 'Ford Transit 3227AR двойная кабина (бортовая платформа)'],
  ['light-trucks', 'Е 344 ВК 977', 'XUS3227ARK0003018', 'Ford Transit 3227AR двойная кабина'],

  ['buses', 'Х 908 УК 799', 'X96A65R52N0932985', 'Газель GAZelle NN'],
  ['buses', 'Н 680 ВО 977', 'X2FXXXESGXKM42540', 'Ford Transit'],
  ['buses', 'А 382 МН 977', 'Z6FXXXESGXJJ06015', 'Ford Transit (автобус)'],

  [
    'special-trucks',
    'Н 152 ЕТ 977',
    'X89TU1T13R1GP3006',
    'Специальный грузовой бортовой с КМУ TH-T13 FOTON 3006A7Н',
  ],
  [
    'special-trucks',
    'М 711 ХУ 799',
    'X5H806015M0000355',
    'Специальная комбинированная дорожная машина КО-806-01',
  ],
  [
    'special-trucks',
    'Н 421 УА 799',
    'X89503670M0FZ1033',
    'Специальный автогудронатор РЕГИОН 45 АС-С41R',
  ],

  ['dump-trucks', 'К 877 ТУ 799', 'XTC652005L1424014', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'М 320 КО 977', 'XTC652005K1407605', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'К 927 ТУ 799', 'XTC652005L1418059', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'К 983 ТУ 799', 'XTC652005L1424011', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'К 994 ТУ 799', 'XTC652005L1423865', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'Н 487 АА 977', 'XTC652005K1409565', 'Автосамосвал КАМАЗ К3340 6520-53'],
  ['dump-trucks', 'Х 152 НО 799', 'LZGJRDR47HX063924', 'Самосвал SHACMAN SX3256DR384'],
  ['dump-trucks', 'Х 287 НО 799', 'LZGJRDR45HX063923', 'Самосвал SHACMAN SX3256DR384'],
  ['dump-trucks', 'Х 265 НО 799', 'LZGJRDR42HX063927', 'Самосвал SHACMAN SX3256DR384'],

  ['road-tractors', 'H 478 BO 977', 'LZZ7CCWDXPC609266', 'Sitrak C7H ZZ4186V361HE'],
  ['road-tractors', 'М 949 ХУ 799', '9BSP6X40003888559', 'Scania R400 6×4 седельный тягач'],

  ['trailers', 'ЕО 7112 77', 'Х89994273М0ВА2539', 'Specpricep 9942L3 полуприцеп тяжеловоз'],
  ['trailers', 'ХХ 0555 77', 'NP9ST4FLFP0225021', 'Прицеп Sinanli Tanker ST4FLF'],
  ['trailers', '—', 'Х89714911L0FM4073', 'Прицеп 71491-0000010-01 (госномер уточнить)'],

  ['front-loaders', '77 МН 8102', '567006LDPNB279771', 'Погрузчик фронтальный ENSIGN YX635'],
  ['front-loaders', '77 МН 8101', '567006LDVNB279761', 'Погрузчик фронтальный ENSIGN YX635'],
  ['front-loaders', '77 ММ 7009', 'XUG0300KVNCB20676', 'Фронтальный погрузчик XCMG ZL30GV'],

  ['mini-loaders', '77 РЕ 4294', 'JAFSR220PJM450990', 'Погрузчик фронтальный CASE SR220'],
  ['mini-loaders', '77 ММ 7010', 'JAFSR200LNM413973', 'Колесный мини-погрузчик CASE SR200B'],

  ['backhoes', '77 РЕ 4293', 'FNH0580TNJHH01925', 'Экскаватор-погрузчик Case 580T'],
  ['backhoes', '77 МХ 0605', 'NKJ570STHHKH00184', 'Экскаватор-погрузчик Case 570ST'],
  ['backhoes', '77 ММ 7056', 'CAT00428CL7D00383', 'Экскаватор-погрузчик Caterpillar 428'],
  ['backhoes', '77 РВ 6800', 'САТ0432FVLYJ00794', 'Экскаватор-погрузчик Caterpillar 432F2'],
  [
    'backhoes',
    '77 РМ 6819',
    '404(Y4R900Z01L1102335)',
    'МУП-351.ТСТ — машина для коммунального хозяйства',
  ],

  [
    'excavators',
    '77 РМ 6996',
    'SY0058CC38558/0F5110063N4L70066CK',
    'Гусеничный экскаватор SANY SY55C',
  ],
  ['excavators', '77 МН 8147', 'SY0079CC30958/0F5110070N4', 'Гусеничный экскаватор SANY SY75C'],
  [
    'excavators',
    '77 МН 9524',
    'SY0151СС28158/SANWS6706NK004367',
    'Колесный экскаватор SANY SY155W (158)',
  ],
  [
    'excavators',
    '77 МН 9525',
    'SY0151CC25368/SANW6706NK004361',
    'Колесный экскаватор SANY SY155W (368)',
  ],
  ['excavators', '77 МХ 3409', 'SY0151CC16818/SANWS6706NK004059', 'Экскаватор SANY SY155W'],
  ['excavators', '77 ММ 7013', 'SY0151CC25018/SANWS6701NK004339', 'Самоходная машина SANY SY155W'],
  ['excavators', '77 РК 7946', 'CAT0318CJDAH00858', 'Экскаватор Caterpillar 318CL'],

  ['rollers', '77 ММ 7012', 'LGJ6614ETNR059175', 'Каток вибрационный Liugong CLG6614E'],
  ['rollers', '77 ММ 7057', 'ACZ16234EN3046027', 'Каток дорожный Ammann ARX45-2'],
  ['rollers', '77 ММ 7011', 'АСZ16234PN3046467', 'Каток дорожный Ammann ARX45-2'],
  ['rollers', '77 МО 4698', 'H1812561', 'Каток дорожный Hamm HD110'],
  ['rollers', '77 МН 9579', 'DM3425', 'Каток ZDM DM-10-VD'],
  ['rollers', '77 МН 9580', 'DM3419', 'Каток ZDM ZDM-10-VC'],
  ['rollers', '77 РА 4897', '6152062', 'Каток Ammann ARX 26'],
  ['rollers', '77 МН 4897', 'H1531477', 'Каток Hamm HD 090V'],
  ['rollers', '77 МН 4901', '101920091188', 'Каток Bomag BW 161 AD-4'],

  ['pavers', '77 РВ 6821', '07191650', 'Асфальтоукладчик Vogele Super 1900-2 (6 м)'],
  ['pavers', '77 РЕ 5812', '07191989', 'Асфальтоукладчик Vogele Super 1900-2/1 (5 м)'],
  ['pavers', '77 МН 7351', '08110159', 'Асфальтоукладчик Vogele Super 1300-2'],

  ['cold-mills', '77 РЕ 4341', '13200264', 'Фреза дорожная Wirtgen W210'],
  ['cold-mills', '77 РВ 6822', '122000115', 'Холодная дорожная фреза Wirtgen W200'],
]

function fleetHeroPhotoUrl(categoryId: FleetCategoryId, model: string): string | undefined {
  if (categoryId === 'dump-trucks') {
    if (/shacman/i.test(model)) return 'fleet/vehicles/shacman-sx3256dr384-hero.png'
    return 'fleet/vehicles/kamaz-6520-hero.png'
  }
  if (categoryId === 'cold-mills') {
    if (/\bW\s*210\b/i.test(model)) return 'fleet/vehicles/wirtgen-w210-hero.png'
    if (/\bW\s*200\b/i.test(model)) return 'fleet/vehicles/wirtgen-w200-hero.png'
  }
  if (categoryId === 'trailers') {
    if (/specpricep|9942\s*L\s*3/i.test(model)) return 'fleet/vehicles/specpricep-9942l3-hero.png'
    if (/sinanli|ST4FLF/i.test(model)) return 'fleet/vehicles/sinanli-tanker-st4flf-hero.png'
    if (/71491/i.test(model)) return 'fleet/vehicles/trailer-71491-hero.png'
  }
  if (categoryId === 'rollers') {
    if (/DM-10-VD/i.test(model)) return 'fleet/vehicles/zdm-dm10-vd-hero.png'
    if (/ZDM-10-VC/i.test(model)) return 'fleet/vehicles/zdm-zdm10-vc-hero.png'
    if (/ARX\s*45\s*[-–]?\s*2|ARX45\s*[-–]?\s*2/i.test(model)) return 'fleet/vehicles/ammann-arx45-2-hero.png'
    if (/ARX\s*26\b/i.test(model)) return 'fleet/vehicles/ammann-arx26-hero.png'
    if (/\bHD\s*110\b/i.test(model)) return 'fleet/vehicles/hamm-hd110-hero.png'
    if (/\bHD\s*090|090\s*V/i.test(model)) return 'fleet/vehicles/hamm-hd090v-hero.png'
    if (/BW\s*161|161\s*AD/i.test(model)) return 'fleet/vehicles/bomag-bw161-ad4-hero.png'
    if (/CLG6614E|Liugong/i.test(model)) return 'fleet/vehicles/liugong-clg6614e-hero.png'
  }
  if (categoryId === 'road-tractors') {
    if (/sitrak|c7h/i.test(model)) return 'fleet/vehicles/sitrak-c7h-hero.png'
    if (/scania|p400|r400/i.test(model)) return 'fleet/vehicles/scania-tractor-hero.png'
  }
  if (categoryId === 'light-trucks') {
    if (/^278865|278865\s*\(/i.test(model)) return 'fleet/vehicles/gaz-278865-flatbed-hero.png'
    if (/ford/i.test(model)) {
      if (/3227\s*AR/i.test(model) && /бортовая платформа|платформ/i.test(model)) {
        return 'fleet/vehicles/ford-transit-3227ar-flatbed-hero.png'
      }
      if (/3227\s*AR/i.test(model)) return 'fleet/vehicles/ford-transit-3227ar-doublecab-hero.png'
      if (/22278/i.test(model)) return 'fleet/vehicles/ford-transit-22278-hero.png'
      return 'fleet/vehicles/ford-transit-van-hero.png'
    }
    if (/2705/i.test(model)) return 'fleet/vehicles/gaz-2705-van-hero.png'
    if (/каркасом и тентом|с тентом/i.test(model)) return 'fleet/vehicles/gaz-a22r32-tilt-hero.png'
    if (/(?:A|А)22(?:\s*R\s*32|R32)/i.test(model)) return 'fleet/vehicles/gaz-a22r32-flatbed-hero.png'
    if (/gazelle|next/i.test(model)) return 'fleet/vehicles/gaz-a22r32-flatbed-hero.png'
  }
  if (categoryId === 'pavers') {
    if (/1300\s*[-–]?\s*2/i.test(model)) return 'fleet/vehicles/vogele-super-1300-2-hero.png'
    if (/1900\s*[-–]?\s*2\/1/i.test(model)) return 'fleet/vehicles/vogele-super-1900-2-slash1-hero.png'
    if (/1900\s*[-–]?\s*2/i.test(model)) return 'fleet/vehicles/vogele-super-1900-2-hero.png'
  }
  if (categoryId === 'buses') {
    if (/газель|gazelle|\bnn\b/i.test(model)) return 'fleet/vehicles/gaz-gazelle-nn-hero.png'
    if (/ford|transit/i.test(model)) return 'fleet/vehicles/ford-transit-minibus-hero.png'
  }
  if (categoryId === 'special-trucks') {
    if (/гудронатор|AC-C41R|АС-С41R|АС-С41|С41R|регион\s*45/i.test(model)) {
      return 'fleet/vehicles/special-region45-autogudronator-hero.png'
    }
    if (/КО-806|KO-806|806-01/i.test(model)) return 'fleet/vehicles/special-kamaz-ko806-01-hero.png'
    if (/foton|th-t13|th\s*t\s*13|3006a7/i.test(model)) return 'fleet/vehicles/special-foton-th-t13-hero.png'
  }
  if (categoryId === 'excavators') {
    if (/318\s*CL|318CL|caterpillar|cat\s*318/i.test(model)) {
      return 'fleet/vehicles/excavator-cat-318cl-hero.png'
    }
    if (/SY\s*55\s*C|SY55C/i.test(model)) return 'fleet/vehicles/excavator-sany-sy55c-hero.png'
    if (/SY\s*75\s*C|SY75C/i.test(model)) return 'fleet/vehicles/excavator-sany-sy75c-hero.png'
    if (/\(\s*158\s*\)|SY155W\s*\(\s*158/i.test(model)) {
      return 'fleet/vehicles/excavator-sany-sy155w-158-hero.png'
    }
    if (/\(\s*368\s*\)|SY155W\s*\(\s*368/i.test(model)) {
      return 'fleet/vehicles/excavator-sany-sy155w-368-hero.png'
    }
    if (/самоходная/i.test(model)) return 'fleet/vehicles/excavator-sany-sy155w-b-hero.png'
    if (/SY\s*155\s*W|SY155W/i.test(model)) return 'fleet/vehicles/excavator-sany-sy155w-a-hero.png'
  }
  if (categoryId === 'mini-loaders') {
    if (/SR\s*220|SR220/i.test(model)) return 'fleet/vehicles/mini-loader-case-sr220-hero.png'
    if (/SR\s*200\s*B|SR200B/i.test(model)) return 'fleet/vehicles/mini-loader-case-sr200b-hero.png'
  }
  if (categoryId === 'front-loaders') {
    if (/xcmg|zl30gv/i.test(model)) return 'fleet/vehicles/front-loader-xcmg-zl30gv-hero.png'
    if (/ensign|yx635/i.test(model)) return 'fleet/vehicles/front-loader-ensign-yx635-hero.png'
  }
  if (categoryId === 'backhoes') {
    if (/муп-351|муп\s*351|коммунального хозяйства/i.test(model)) {
      return 'fleet/vehicles/backhoe-mup-351-hero.png'
    }
    if (/432\s*F\s*2|432F2/i.test(model)) return 'fleet/vehicles/backhoe-cat-432f2-hero.png'
    if (/\b428\b|caterpillar.*428/i.test(model)) return 'fleet/vehicles/backhoe-cat-428-hero.png'
    if (/570\s*ST|570ST/i.test(model)) return 'fleet/vehicles/backhoe-case-570st-hero.png'
    if (/580\s*T|580T/i.test(model)) return 'fleet/vehicles/backhoe-case-580t-hero.png'
  }
  return undefined
}

/* ============================================================
   Реальные данные — переопределения по госномеру
   ------------------------------------------------------------
   Ключ — plate «как в FLEET_ROWS», нормализация: только
   заглавные буквы и цифры без пробелов (см. `plateKey`).
   Любое поле, не указанное здесь, берётся из авто-генерации.
   ============================================================ */

type VehicleOverride = {
  specs?: Partial<FleetSpecs>
  insurance?: Partial<FleetInsurance>
  maintenance?: Partial<FleetMaintenancePlan>
  technicalInspection?: FleetTechnicalInspection
}

function plateKey(plate: string): string {
  return plate.replace(/\s+/g, '').toUpperCase()
}

/**
 * Реестр «живых» единиц техники, переданных заказчиком.
 * Добавляй сюда новые записи — при совпадении госномера в FLEET_ROWS
 * поля будут мёржиться поверх автосгенерированных.
 */
const REAL_VEHICLES: Record<string, VehicleOverride> = {
  /* ---------- Автобусы ---------- */

  // Газель GAZelle NN — в лизинге, с ГЛОНАСС
  [plateKey('Х 908 УК 799')]: {
    specs: {
      year: 2021,
      manufacturer: 'ГАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'D',
      ownership: 'leased',
      leasingCompany: 'ООО «Ресо-Лизинг»',
      registrationCertificate: '99 58 992773',
      registrationCertificateIssuedIso: '2024-03-06',
      vehiclePassport: '164301041073774',
      vehiclePassportIssuedIso: '2022-01-13',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0609234326',
      validUntilIso: '2027-02-11',
    },
  },

  // Ford Transit (пассажирский) — в лизинге, с ГЛОНАСС
  [plateKey('Н 680 ВО 977')]: {
    specs: {
      year: 2019,
      manufacturer: 'Ford',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'D',
      ownership: 'leased',
      leasingCompany: 'ООО «Ресо-Лизинг»',
      registrationCertificate: '99 58 991975',
      registrationCertificateIssuedIso: '2024-02-15',
      vehiclePassport: '164301005701350',
      vehiclePassportIssuedIso: '2020-03-28',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0692354468',
      validUntilIso: '2027-02-08',
    },
  },

  /* ---------- Автомобили специальные ---------- */

  // FOTON 3006 с КМУ TH-T13 — собственность, новая (2024), ДК ещё не требуется
  [plateKey('Н 152 ЕТ 977')]: {
    specs: {
      year: 2024,
      manufacturer: 'FOTON',
      countryOfOrigin: 'Китай',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 63 809225',
      registrationCertificateIssuedIso: '2024-07-17',
      vehiclePassport: '164301092779538',
      vehiclePassportIssuedIso: '2024-06-27',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0547641563',
      validUntilIso: '2026-07-21',
    },
  },

  // КО-806-01 (комбинированная дорожная машина) — собственность, ДК ПРОСРОЧЕНА
  [plateKey('М 711 ХУ 799')]: {
    specs: {
      year: 2021,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 61 430881',
      registrationCertificateIssuedIso: '2023-09-19',
      vehiclePassport: '164301020009665',
      vehiclePassportIssuedIso: '2021-02-12',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0528715165',
      validUntilIso: '2026-05-19',
    },
    technicalInspection: {
      cardNumber: '127811012401650',
      validUntilIso: '2025-11-07',
    },
  },

  // Автогудронатор РЕГИОН 45 АС-С41R — собственность, ДК ПРОСРОЧЕНА
  // NB: В исходных данных дата выдачи СТС «19.19.2023» (невалидный месяц).
  // Принято «19.09.2023» как наиболее вероятный вариант (та же партия, что и КО-806-01).
  [plateKey('Н 421 УА 799')]: {
    specs: {
      year: 2021,
      manufacturer: 'Регион-45',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 61 430879',
      registrationCertificateIssuedIso: '2023-09-19',
      vehiclePassport: '164301019135264',
      vehiclePassportIssuedIso: '2021-01-29',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0528715955',
      validUntilIso: '2026-05-19',
    },
    technicalInspection: {
      cardNumber: '127811052500327',
      validUntilIso: '2026-02-18',
    },
  },

  /* ---------- Самосвалы ---------- */

  // КАМАЗ К3340 6520-53 (2020) — ДК просрочена, ГЛОНАСС
  [plateKey('К 877 ТУ 799')]: {
    specs: {
      year: 2020,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 59 398181',
      registrationCertificateIssuedIso: '2023-08-01',
      vehiclePassport: '164301007545983',
      vehiclePassportIssuedIso: '2020-06-23',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0561461778',
      validUntilIso: '2026-09-03',
    },
    technicalInspection: {
      cardNumber: '127811052401512',
      validUntilIso: '2025-11-26',
    },
  },

  // КАМАЗ К3340 6520-53 (2019) — СТС в источнике не указан, без ДК и ГЛОНАСС
  [plateKey('М 320 КО 977')]: {
    specs: {
      year: 2019,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      // СТС в переданных данных не указан — поле намеренно пустое
      vehiclePassport: '77 ХА 285519',
      vehiclePassportIssuedIso: '2022-10-04',
    },
    insurance: {
      policyNumber: 'ХХХ 0606898029',
      validUntilIso: '2027-01-16',
    },
  },

  // КАМАЗ К3340 6520-53 (2020) — ДК просрочена, ГЛОНАСС
  [plateKey('К 927 ТУ 799')]: {
    specs: {
      year: 2020,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 59 398183',
      registrationCertificateIssuedIso: '2023-08-01',
      vehiclePassport: '164301005353452',
      vehiclePassportIssuedIso: '2020-03-23',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0561462786',
      validUntilIso: '2026-09-03',
    },
    technicalInspection: {
      cardNumber: '127811042400858',
      validUntilIso: '2025-07-30',
    },
  },

  // КАМАЗ К3340 6520-53 (2020) — ВНИМАНИЕ: ОСАГО УЖЕ ПРОСРОЧЕН (до 29.07.2025)
  [plateKey('К 983 ТУ 799')]: {
    specs: {
      year: 2020,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 59 397412',
      registrationCertificateIssuedIso: '2023-07-25',
      vehiclePassport: '164301007545940',
      vehiclePassportIssuedIso: '2020-06-23',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0433163411',
      validUntilIso: '2025-07-29',
    },
  },

  // КАМАЗ К3340 6520-53 (2020) — ДК просрочена, ГЛОНАСС
  [plateKey('К 994 ТУ 799')]: {
    specs: {
      year: 2020,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 59 397408',
      registrationCertificateIssuedIso: '2023-07-25',
      vehiclePassport: '164301007545994',
      vehiclePassportIssuedIso: '2020-06-23',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0561461225',
      validUntilIso: '2026-09-03',
    },
    technicalInspection: {
      cardNumber: '127811052401422',
      validUntilIso: '2025-11-15',
    },
  },

  // КАМАЗ К3340 6520-53 (2019), ПТС бумажный, ДК просрочена
  // NB: VIN в источнике «XTC652005К1409565(6)» (кириллическая К + «(6)»).
  // Нормализовано до стандартного 17-значного XTC652005K1409565.
  [plateKey('Н 487 АА 977')]: {
    specs: {
      year: 2019,
      manufacturer: 'КАМАЗ',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: '99 43 558435',
      registrationCertificateIssuedIso: '2022-10-06',
      vehiclePassport: '77 ХА 285542',
      vehiclePassportIssuedIso: '2022-10-06',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0568561431',
      validUntilIso: '2026-09-28',
    },
    technicalInspection: {
      cardNumber: '127811042401200',
      validUntilIso: '2025-10-02',
    },
  },

  // SHACMAN SX3256DR384 (2017) — оформлен на физлицо, ОСАГО и ДК просрочены
  [plateKey('Х 152 НО 799')]: {
    specs: {
      year: 2017,
      manufacturer: 'Shacman',
      countryOfOrigin: 'Китай',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'Астоян Азиза Геворковна',
      registrationCertificate: '99 40 083262',
      registrationCertificateIssuedIso: '2022-04-14',
      vehiclePassport: '75 УВ 250058',
      vehiclePassportIssuedIso: '2017-08-30',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0511752204',
      validUntilIso: '2026-03-26',
    },
    technicalInspection: {
      cardNumber: '132511042400950',
      validUntilIso: '2025-05-21',
    },
  },

  // SHACMAN SX3256DR384 (2017) — оформлен на физлицо, ОСАГО просрочен, без ДК
  [plateKey('Х 287 НО 799')]: {
    specs: {
      year: 2017,
      manufacturer: 'Shacman',
      countryOfOrigin: 'Китай',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'Астоян Азиза Геворковна',
      registrationCertificate: '99 40 084139',
      registrationCertificateIssuedIso: '2022-04-18',
      vehiclePassport: '74 УВ 250057',
      vehiclePassportIssuedIso: '2017-08-30',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0511744726',
      validUntilIso: '2026-03-26',
    },
  },

  // SHACMAN SX3256DR384 (2017) — оформлен на физлицо, ОСАГО и ДК просрочены
  [plateKey('Х 265 НО 799')]: {
    specs: {
      year: 2017,
      manufacturer: 'Shacman',
      countryOfOrigin: 'Китай',
      fuel: 'diesel',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'Астоян Азиза Геворковна',
      registrationCertificate: '99 40 083745',
      registrationCertificateIssuedIso: '2022-04-15',
      vehiclePassport: '77 РН 194287',
      vehiclePassportIssuedIso: '2022-04-15',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0511745770',
      validUntilIso: '2026-03-26',
    },
    technicalInspection: {
      cardNumber: '157141022500162',
      validUntilIso: '2026-04-05',
    },
  },

  /* ---------- Седельные тягачи ---------- */

  // Sitrak C7H (2023) — собственность, ДК свежепросрочена, ГЛОНАСС
  [plateKey('H 478 BO 977')]: {
    specs: {
      year: 2023,
      manufacturer: 'SITRAK',
      countryOfOrigin: 'Китай',
      fuel: 'diesel',
      licenseCategory: 'CE',
      ownership: 'owned',
      registrationCertificate: '99 58 991071',
      registrationCertificateIssuedIso: '2024-01-26',
      vehiclePassport: '164302062558491',
      // Дата выдачи ЭПТС в источнике не указана
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0534005074',
      validUntilIso: '2026-06-20',
    },
    technicalInspection: {
      cardNumber: '127811022500219',
      validUntilIso: '2026-02-06',
    },
  },

  // Scania R400 6×4 седельный тягач (2016) — собственность, ОСАГО скоро истекает, ДК просрочена
  [plateKey('М 949 ХУ 799')]: {
    specs: {
      year: 2016,
      manufacturer: 'Scania',
      countryOfOrigin: 'Швеция',
      fuel: 'diesel',
      licenseCategory: 'CE',
      ownership: 'owned',
      registrationCertificate: '99 50 087874',
      registrationCertificateIssuedIso: '2023-11-08',
      vehiclePassport: '50 РМ 428576',
      vehiclePassportIssuedIso: '2020-07-15',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0523193971',
      validUntilIso: '2026-04-30',
    },
    technicalInspection: {
      cardNumber: '127811042401576',
      validUntilIso: '2025-11-28',
    },
  },

  // Ford Transit (автобус) — в собственности, ДК уже ПРОСРОЧЕНА, с ГЛОНАСС
  [plateKey('А 382 МН 977')]: {
    specs: {
      year: 2018,
      manufacturer: 'Ford',
      countryOfOrigin: 'Россия',
      fuel: 'diesel',
      licenseCategory: 'D',
      ownership: 'owned',
      registrationCertificate: '99 70 529490',
      registrationCertificateIssuedIso: '2025-06-27',
      vehiclePassport: '77 ХА 187222',
      vehiclePassportIssuedIso: '2022-11-09',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0574017820',
      validUntilIso: '2026-10-13',
    },
    technicalInspection: {
      cardNumber: '156671032500513',
      validUntilIso: '2025-12-25',
    },
  },

  /* ---------- Полуприцепы ---------- */

  // СпецПрицеп 9942L3 — тяжеловоз, собственность, ДК действителен, ОСАГО не требуется
  [plateKey('ЕО 7112 77')]: {
    specs: {
      year: 2021,
      manufacturer: 'СпецПрицеп',
      countryOfOrigin: 'Россия',
      licenseCategory: 'CE',
      ownership: 'owned',
      registrationCertificate: '99 47 749208',
      registrationCertificateIssuedIso: '2023-03-15',
      vehiclePassport: '164301019313035',
      vehiclePassportIssuedIso: '2021-02-02',
    },
    insurance: {
      notRequired: true,
    },
    technicalInspection: {
      cardNumber: '127811012401801',
      validUntilIso: '2026-11-28',
    },
  },

  // Sinanli Tanker ST4FLF — цистерна, собственность, ДК действителен, ОСАГО не требуется
  [plateKey('ХХ 0555 77')]: {
    specs: {
      year: 2023,
      manufacturer: 'Sinanli',
      countryOfOrigin: 'Турция',
      licenseCategory: 'CE',
      ownership: 'owned',
      registrationCertificate: '99 61 475803',
      registrationCertificateIssuedIso: '2023-10-05',
      vehiclePassport: '164302062316150',
      vehiclePassportIssuedIso: '2023-05-17',
    },
    insurance: {
      notRequired: true,
    },
    technicalInspection: {
      cardNumber: '127811042500238',
      validUntilIso: '2027-02-06',
    },
  },

  // НЕФАЗ 71491-0000010-01 (без госномера в учёте) — бумажный ПТС, ОСАГО не требуется
  [plateKey('—')]: {
    specs: {
      year: 2020,
      manufacturer: 'НЕФАЗ',
      countryOfOrigin: 'Россия',
      licenseCategory: 'CE',
      ownership: 'owned',
      vehiclePassport: '52 РК 612877',
      vehiclePassportIssuedIso: '2020-03-27',
    },
    insurance: {
      notRequired: true,
    },
  },

  /* ---------- Фронтальные погрузчики ---------- */

  // ENSIGN YX635 (2022) — арендован у ООО «АСС», ОСАГО ПРОСРОЧЕНО, ДК не заведена, с ГЛОНАСС
  [plateKey('77 МН 8102')]: {
    specs: {
      year: 2022,
      manufacturer: 'ENSIGN',
      countryOfOrigin: 'Китай',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'ООО «АСС»',
      registrationCertificate: 'СН 414785',
      registrationCertificateIssuedIso: '2024-05-15',
      vehiclePassport: '364302002022992',
      vehiclePassportIssuedIso: '2023-10-03',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0504809104',
      validUntilIso: '2026-03-12',
    },
  },

  // ENSIGN YX635 (2022) — арендован у ООО «АСС», ОСАГО ПРОСРОЧЕНО, ДК ПРОСРОЧЕНА (номер не указан), с ГЛОНАСС
  [plateKey('77 МН 8101')]: {
    specs: {
      year: 2022,
      manufacturer: 'ENSIGN',
      countryOfOrigin: 'Китай',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'ООО «АСС»',
      registrationCertificate: 'СН 414784',
      // В источнике дата «15.15.2024» — очевидная опечатка; по аналогии с 8102 принято 15.05.2024.
      registrationCertificateIssuedIso: '2024-05-15',
      vehiclePassport: '364302002023102',
      vehiclePassportIssuedIso: '2023-10-03',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0504807657',
      validUntilIso: '2026-03-26',
    },
    technicalInspection: {
      // Номер ДК в источнике не указан, есть только срок.
      validUntilIso: '2025-05-01',
    },
  },

  // XCMG ZL30GV (2022) — собственность, ОСАГО ПРОСРОЧЕНО (полгода), ДК не заведена, с ГЛОНАСС
  [plateKey('77 ММ 7009')]: {
    specs: {
      year: 2022,
      manufacturer: 'XCMG',
      countryOfOrigin: 'Китай',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 076018',
      registrationCertificateIssuedIso: '2023-10-18',
      vehiclePassport: '364302000816116',
      vehiclePassportIssuedIso: '2023-03-31',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0448688878',
      validUntilIso: '2025-09-15',
    },
  },

  /* ---------- Мини-погрузчики ---------- */

  // CASE SR220 (2018) — бумажный ПСМ; владелец в источнике не указан; ДК не заведена; с ГЛОНАСС
  [plateKey('77 РЕ 4294')]: {
    specs: {
      year: 2018,
      manufacturer: 'CASE',
      countryOfOrigin: 'Италия',
      licenseCategory: 'C',
      // ownership и registeredOwner не заданы — оставляем значение по умолчанию до уточнения.
      registrationCertificate: 'СК 147023',
      registrationCertificateIssuedIso: '2020-07-31',
      vehiclePassport: 'RU TK 183194',
      vehiclePassportIssuedIso: '2018-10-27',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0528713934',
      validUntilIso: '2026-05-19',
    },
  },

  // CASE SR200B (2022) — собственность; ОСАГО действует; ДК не заведена; без трекера
  [plateKey('77 ММ 7010')]: {
    specs: {
      year: 2022,
      manufacturer: 'CASE',
      countryOfOrigin: 'Италия',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 076019',
      registrationCertificateIssuedIso: '2023-10-18',
      vehiclePassport: '364302000268107',
      vehiclePassportIssuedIso: '2022-12-28',
      /* В источнике колонка «Глонасс» пуста — телематики на этом погрузчике нет. */
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0568541991',
      validUntilIso: '2026-09-24',
    },
  },

  /* ---------- Экскаваторы-погрузчики ---------- */

  // CASE 580T (2018) — собственность, ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 РЕ 4293')]: {
    specs: {
      year: 2018,
      manufacturer: 'CASE',
      countryOfOrigin: 'США',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СК 147022',
      registrationCertificateIssuedIso: '2020-07-31',
      vehiclePassport: 'RU TK 140668',
      vehiclePassportIssuedIso: '2018-08-25',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0565843375',
      validUntilIso: '2026-09-16',
    },
  },

  // CASE 570ST (2017) — аренда у физлица, ОСАГО действует, ДК до сентября 2026, без трекера
  [plateKey('77 МХ 0605')]: {
    specs: {
      year: 2017,
      manufacturer: 'CASE',
      countryOfOrigin: 'США',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'Арамян Г. К.',
      registrationCertificate: 'СН 795100',
      registrationCertificateIssuedIso: '2025-09-17',
      vehiclePassport: 'RU СВ 487198',
      vehiclePassportIssuedIso: '2022-06-14',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0552482105',
      validUntilIso: '2026-08-05',
    },
    technicalInspection: {
      /* В источнике срок ДК указан без дня — «09.2026». Принят как конец месяца. */
      validUntilIso: '2026-09-30',
    },
  },

  // Caterpillar 428 (2020) — собственность, ОСАГО ПРОСРОЧЕНО, ДК не заведена, без трекера
  [plateKey('77 ММ 7056')]: {
    specs: {
      year: 2020,
      manufacturer: 'Caterpillar',
      countryOfOrigin: 'Великобритания',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 076093',
      registrationCertificateIssuedIso: '2023-11-07',
      vehiclePassport: 'RU ТК 210631',
      vehiclePassportIssuedIso: '2020-12-05',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0511736119',
      validUntilIso: '2026-03-30',
    },
  },

  // Caterpillar 432F2 (2018) — аренда у физлица, ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 РВ 6800')]: {
    specs: {
      year: 2018,
      manufacturer: 'Caterpillar',
      countryOfOrigin: 'Великобритания',
      licenseCategory: 'C',
      ownership: 'rented',
      registeredOwner: 'Арамян Норайр Геворкович',
      registrationCertificate: 'СМ 068135',
      registrationCertificateIssuedIso: '2021-08-10',
      vehiclePassport: 'RU TK 148722',
      vehiclePassportIssuedIso: '2018-04-20',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0549795270',
      validUntilIso: '2026-07-29',
    },
  },

  // МУП-351.ТСТ (2020) — коммунальная машина на базе экскаватора-погрузчика,
  //                     собственность, ОСАГО ПРОСРОЧЕНО (~5 мес.), с ГЛОНАСС
  [plateKey('77 РМ 6819')]: {
    specs: {
      year: 2020,
      manufacturer: 'МУП',
      countryOfOrigin: 'Россия',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 085504',
      registrationCertificateIssuedIso: '2024-02-20',
      vehiclePassport: 'RU СВ 364120',
      vehiclePassportIssuedIso: '2020-09-15',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0463600028',
      validUntilIso: '2025-11-09',
    },
  },

  /* ---------- Экскаваторы ---------- */

  // SANY SY55C гусеничный (2022) — собственность, ОСАГО ПРОСРОЧЕНО (~4.5 мес.), ДК не заведена, без трекера
  [plateKey('77 РМ 6996')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'E',
      ownership: 'owned',
      registrationCertificate: 'СН 804805',
      registrationCertificateIssuedIso: '2025-11-01',
      vehiclePassport: 'RU TK 436886',
      vehiclePassportIssuedIso: '2022-10-31',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0467687011',
      validUntilIso: '2025-12-04',
    },
  },

  // SANY SY75C гусеничный — в лизинге у «Газпромбанк Автолизинг», ОСАГО действует,
  //                        ДК ПРОСРОЧЕНА (с июля 2025), с ГЛОНАСС.
  //                        В источнике не указаны год выпуска и номер ПСМ —
  //                        год принят 2022 по партии SANY, ПСМ оставлен пустым.
  [plateKey('77 МН 8147')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'E',
      ownership: 'leased',
      leasingCompany: 'ООО «Газпромбанк Автолизинг»',
      registrationCertificate: 'СН 414870',
      registrationCertificateIssuedIso: '2022-02-23',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0565576512',
      validUntilIso: '2026-09-15',
    },
    technicalInspection: {
      /* Номер ДК в источнике не указан, только срок. */
      validUntilIso: '2025-07-01',
    },
  },

  // SANY SY155W (158) колесный — собственность, ОСАГО действует, ДК ПРОСРОЧЕНА, без трекера.
  //                              В источнике нет года — принят 2022 по партии.
  [plateKey('77 МН 9524')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'D',
      ownership: 'owned',
      registrationCertificate: 'СН 416720',
      registrationCertificateIssuedIso: '2024-07-02',
      vehiclePassport: '364302000299622',
      vehiclePassportIssuedIso: '2023-01-08',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0535135187',
      validUntilIso: '2026-06-10',
    },
    technicalInspection: {
      validUntilIso: '2025-06-01',
    },
  },

  // SANY SY155W (368) колесный (2022) — собственность, ОСАГО действует, ДК ПРОСРОЧЕНА, без трекера.
  //                                    Номер ОСАГО в источнике «ХХХ 535134038» — принят как
  //                                    стандартный 10-значный «ХХХ 0535134038».
  [plateKey('77 МН 9525')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'D',
      ownership: 'owned',
      registrationCertificate: 'СН 416721',
      registrationCertificateIssuedIso: '2024-07-02',
      vehiclePassport: '364302000299325',
      vehiclePassportIssuedIso: '2023-01-08',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0535134038',
      validUntilIso: '2026-06-10',
    },
    technicalInspection: {
      validUntilIso: '2025-06-01',
    },
  },

  // SANY SY155W (2022) — собственность, ОСАГО ПРОСРОЧЕНО (~5 мес.), ДК действует, с ГЛОНАСС
  [plateKey('77 МХ 3409')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'D',
      ownership: 'owned',
      registrationCertificate: 'СН 804705',
      registrationCertificateIssuedIso: '2025-10-22',
      vehiclePassport: 'RU TK 435363',
      vehiclePassportIssuedIso: '2022-10-22',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0651849720',
      validUntilIso: '2025-11-16',
    },
    technicalInspection: {
      cardNumber: 'ТН 100458',
      validUntilIso: '2026-10-01',
    },
  },

  // SANY SY155W «Самоходная машина» (2022) — в лизинге у «Газпромбанк Автолизинг»,
  //                                          ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 ММ 7013')]: {
    specs: {
      year: 2022,
      manufacturer: 'SANY',
      countryOfOrigin: 'Китай',
      licenseCategory: 'D',
      ownership: 'leased',
      leasingCompany: 'ООО «Газпромбанк Автолизинг»',
      registrationCertificate: 'СН 076022',
      registrationCertificateIssuedIso: '2023-10-18',
      vehiclePassport: '364302000202041',
      vehiclePassportIssuedIso: '2022-12-15',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0565577145',
      validUntilIso: '2026-09-15',
    },
  },

  // Caterpillar 318CL (2005) — «возрастной» экскаватор, аренда у физлица,
  //                            ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 РК 7946')]: {
    specs: {
      year: 2005,
      manufacturer: 'Caterpillar',
      countryOfOrigin: 'США',
      licenseCategory: 'D',
      ownership: 'rented',
      registeredOwner: 'Арамян Норайр Геворкович',
      registrationCertificate: 'СН 084773',
      registrationCertificateIssuedIso: '2024-02-14',
      vehiclePassport: 'ТА 185263',
      vehiclePassportIssuedIso: '2005-12-14',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0568547573',
      validUntilIso: '2026-09-24',
    },
  },

  /* ---------- Катки ---------- */

  // LIUGONG CLG6614E (2022) — собственность, ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 ММ 7012')]: {
    specs: {
      year: 2022,
      manufacturer: 'LIUGONG',
      countryOfOrigin: 'Китай',
      licenseCategory: 'D',
      ownership: 'owned',
      registrationCertificate: 'СН 076021',
      registrationCertificateIssuedIso: '2023-10-18',
      vehiclePassport: '364302000568330',
      vehiclePassportIssuedIso: '2023-02-27',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0568543850',
      validUntilIso: '2026-09-24',
    },
  },

  // AMMANN ARX45-2 (2022) — собственность, ОСАГО ПРОСРОЧЕНО (~7 мес.), ДК не заведена, с ГЛОНАСС
  [plateKey('77 ММ 7057')]: {
    specs: {
      year: 2022,
      manufacturer: 'AMMANN',
      countryOfOrigin: 'Швейцария',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 076094',
      registrationCertificateIssuedIso: '2023-11-07',
      vehiclePassport: '364302000325340',
      vehiclePassportIssuedIso: '2023-01-13',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0454170680',
      validUntilIso: '2025-10-02',
    },
  },

  // AMMANN ARX45-2 (2022) — собственность, ОСАГО ПРОСРОЧЕНО (~7.5 мес.), ДК не заведена, с ГЛОНАСС
  [plateKey('77 ММ 7011')]: {
    specs: {
      year: 2022,
      manufacturer: 'AMMANN',
      countryOfOrigin: 'Швейцария',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 076020',
      registrationCertificateIssuedIso: '2023-10-18',
      vehiclePassport: '364302000334734',
      vehiclePassportIssuedIso: '2023-01-17',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0445486557',
      validUntilIso: '2025-09-05',
    },
  },

  // HAMM HD110 (2013) — собственность, ОСАГО действует, ДК не заведена, с ГЛОНАСС
  [plateKey('77 МО 4698')]: {
    specs: {
      year: 2013,
      manufacturer: 'HAMM',
      countryOfOrigin: 'Германия',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 423862',
      registrationCertificateIssuedIso: '2024-11-08',
      vehiclePassport: '364303004380227',
      vehiclePassportIssuedIso: '2024-11-13',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0568545456',
      validUntilIso: '2026-09-24',
    },
  },

  // ZDM DM-10-VD (2024) — собственность, ОСАГО действует, ДК не заведена, без трекера
  [plateKey('77 МН 9579')]: {
    specs: {
      year: 2024,
      manufacturer: 'ZDM',
      countryOfOrigin: 'Китай',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 427843',
      registrationCertificateIssuedIso: '2025-02-07',
      vehiclePassport: '364301003368764',
      vehiclePassportIssuedIso: '2024-05-23',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0568540085',
      validUntilIso: '2026-09-24',
    },
  },

  // ZDM ZDM-10-VC (2024) — собственность, без трекера.
  //                        В источнике срок действия ОСАГО не указан —
  //                        сохранили только номер полиса; дату требуется уточнить.
  [plateKey('77 МН 9580')]: {
    specs: {
      year: 2024,
      manufacturer: 'ZDM',
      countryOfOrigin: 'Китай',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 416816',
      registrationCertificateIssuedIso: '2024-07-09',
      vehiclePassport: '364301002716684',
      vehiclePassportIssuedIso: '2024-02-02',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0445778203',
      /* validUntilIso не указан в источнике — оставлен auto-generated; уточнить вручную. */
    },
  },

  // AMMANN ARX 26 K (2019) — собственность, ОСАГО ПРОСРОЧЕНО (~7.5 мес.), ДК не заведена, с ГЛОНАСС
  [plateKey('77 РА 4897')]: {
    specs: {
      year: 2019,
      manufacturer: 'AMMANN',
      countryOfOrigin: 'Швейцария',
      licenseCategory: 'B',
      ownership: 'owned',
      registrationCertificate: 'СВ 716831',
      registrationCertificateIssuedIso: '2019-09-25',
      vehiclePassport: 'RU TK 188196',
      vehiclePassportIssuedIso: '2019-08-05',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0445778295',
      validUntilIso: '2025-09-05',
    },
  },

  // HAMM HD 090V (2005) — «возрастной» каток; в источнике не указаны
  //                      ОСАГО, категория и номер ДК. ДК — только срок (02.2025, просрочена).
  [plateKey('77 МН 4897')]: {
    specs: {
      year: 2005,
      manufacturer: 'HAMM',
      countryOfOrigin: 'Германия',
      /* licenseCategory не указана в источнике — оставляем значение по умолчанию. */
      ownership: 'owned',
      registrationCertificate: 'СН 085432',
      registrationCertificateIssuedIso: '2024-02-14',
      vehiclePassport: 'RU СВ 556917',
      vehiclePassportIssuedIso: '2020-04-29',
      trackerProvider: 'ГЛОНАСС',
    },
    /* ОСАГО в источнике не указан — страховка остаётся auto-generated, требует уточнения. */
    technicalInspection: {
      /* Срок ДК в источнике указан без дня — «02.2025»; принят как конец февраля 2025. */
      validUntilIso: '2025-02-28',
    },
  },

  // BOMAG BW 161 AD-4 (2010) — собственность, ОСАГО ПРОСРОЧЕНО, ДК ПРОСРОЧЕНА (02.2025), с ГЛОНАСС
  [plateKey('77 МН 4901')]: {
    specs: {
      year: 2010,
      manufacturer: 'BOMAG',
      countryOfOrigin: 'Германия',
      licenseCategory: 'C',
      ownership: 'owned',
      registrationCertificate: 'СН 085436',
      registrationCertificateIssuedIso: '2024-02-14',
      vehiclePassport: 'ТС 347208',
      vehiclePassportIssuedIso: '2010-04-30',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0445778198',
      validUntilIso: '2025-09-05',
    },
    technicalInspection: {
      /* В источнике срок ДК без дня — «02.2025»; принят как конец месяца. */
      validUntilIso: '2025-02-28',
    },
  },

  /* ---------- Асфальтоукладчики ---------- */

  // VÖGELE SUPER 1900-2 (6 м, 2011) — собственность, ОСАГО ПРОСРОЧЕНО,
  //                                  ДК ПРОСРОЧЕНА (15.11.2025), с ГЛОНАСС
  [plateKey('77 РВ 6821')]: {
    specs: {
      year: 2011,
      manufacturer: 'VÖGELE',
      countryOfOrigin: 'Германия',
      licenseCategory: 'E',
      ownership: 'owned',
      registrationCertificate: 'СН 423874',
      registrationCertificateIssuedIso: '2024-11-12',
      vehiclePassport: 'ТС 363659',
      vehiclePassportIssuedIso: '2024-02-15',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0516197738',
      validUntilIso: '2026-04-09',
    },
    technicalInspection: {
      validUntilIso: '2025-11-15',
    },
  },

  // VÖGELE SUPER 1900-2/1 (5 м, 2012) — собственность, ОСАГО ПРОСРОЧЕНО,
  //                                    ДК не заведена, без трекера
  [plateKey('77 РЕ 5812')]: {
    specs: {
      year: 2012,
      manufacturer: 'VÖGELE',
      countryOfOrigin: 'Германия',
      licenseCategory: 'E',
      ownership: 'owned',
      registrationCertificate: 'СЕ 896090',
      registrationCertificateIssuedIso: '2020-06-19',
      vehiclePassport: 'ТС 825968',
      vehiclePassportIssuedIso: '2012-04-11',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0516196709',
      validUntilIso: '2026-04-09',
    },
  },

  // VÖGELE SUPER 1300-2 (2008) — аренда у физлица, ОСАГО ПРОСРОЧЕНО более года,
  //                             ДК ПРОСРОЧЕНА, без трекера
  [plateKey('77 МН 7351')]: {
    specs: {
      year: 2008,
      manufacturer: 'VÖGELE',
      countryOfOrigin: 'Германия',
      licenseCategory: 'E',
      ownership: 'rented',
      registeredOwner: 'Арамян Норайр Геворкович',
      registrationCertificate: 'СН 414008',
      registrationCertificateIssuedIso: '2024-04-27',
      vehiclePassport: 'RU CB 122086',
      vehiclePassportIssuedIso: '2024-02-27',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0379791247',
      validUntilIso: '2025-02-12',
    },
    technicalInspection: {
      /* В источнике «02.05.25» — трактовано как 02.05.2025. */
      validUntilIso: '2025-05-02',
    },
  },

  /* ---------- Фрезы ---------- */

  // WIRTGEN W210 (2012) — в лизинге у «Дойче Лизинг Восток»,
  //                      ОСАГО ПРОСРОЧЕНО (~9 мес.), ДК не заведена, без трекера
  [plateKey('77 РЕ 4341')]: {
    specs: {
      year: 2012,
      manufacturer: 'WIRTGEN',
      countryOfOrigin: 'Германия',
      licenseCategory: 'E',
      ownership: 'leased',
      leasingCompany: 'АО «Дойче Лизинг Восток»',
      registrationCertificate: 'СК 147084',
      registrationCertificateIssuedIso: '2020-09-10',
      vehiclePassport: 'RU CB 496675',
      vehiclePassportIssuedIso: '2020-09-10',
      trackerProvider: undefined,
    },
    insurance: {
      policyNumber: 'ХХХ 0428733606',
      validUntilIso: '2025-07-14',
    },
  },

  // WIRTGEN W200 (2010) — собственность, ОСАГО ПРОСРОЧЕНО (~7.5 мес.),
  //                      ДК не заведена, с ГЛОНАСС
  [plateKey('77 РВ 6822')]: {
    specs: {
      year: 2010,
      manufacturer: 'WIRTGEN',
      countryOfOrigin: 'Германия',
      licenseCategory: 'E',
      ownership: 'owned',
      registrationCertificate: 'СМ 069314',
      registrationCertificateIssuedIso: '2021-09-16',
      vehiclePassport: 'ТС 166873',
      vehiclePassportIssuedIso: '2013-05-28',
      trackerProvider: 'ГЛОНАСС',
    },
    insurance: {
      policyNumber: 'ХХХ 0445778288',
      validUntilIso: '2025-09-05',
    },
  },
}

function applyOverride<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base
  return { ...base, ...patch }
}

function buildVehicles(): FleetVehicle[] {
  const perCat = new Map<FleetCategoryId, number>()
  return FLEET_ROWS.map(([categoryId, plate, vinOrFrame, model], i) => {
    const n = (perCat.get(categoryId) ?? 0) + 1
    perCat.set(categoryId, n)
    const id = `${categoryId}-${String(n).padStart(2, '0')}`
    const modelTrimmed = model.trim()
    const plateTrimmed = plate.trim()
    const override = REAL_VEHICLES[plateKey(plateTrimmed)]

    const baseSpecs = defaultSpecs(i, categoryId, modelTrimmed)
    const baseInsurance = defaultInsurance(i, categoryId)
    const baseMaintenance = defaultMaintenance(i, categoryId)

    return {
      id,
      categoryId,
      plate: plateTrimmed,
      vinOrFrame: vinOrFrame.trim(),
      model: modelTrimmed,
      heroPhotoUrl: fleetHeroPhotoUrl(categoryId, modelTrimmed),
      schematicVariant: schematicFor(categoryId),
      repairs: defaultRepairs(i, categoryId),
      maintenance: applyOverride(baseMaintenance, override?.maintenance),
      insurance: applyOverride(baseInsurance, override?.insurance),
      passes: defaultPasses(i),
      specs: applyOverride(baseSpecs, override?.specs),
      technicalInspection: override?.technicalInspection,
    }
  })
}

export const FLEET_VEHICLES: FleetVehicle[] = buildVehicles()

export function getFleetVehicle(id: string): FleetVehicle | undefined {
  return FLEET_VEHICLES.find((v) => v.id === id)
}

export function getFleetVehiclesByCategory(categoryId: FleetCategoryId): FleetVehicle[] {
  return FLEET_VEHICLES.filter((v) => v.categoryId === categoryId)
}

export function getFleetCategory(id: string): FleetCategory | undefined {
  return FLEET_CATEGORIES.find((c) => c.id === id)
}

export function fleetVehicleCount(categoryId: FleetCategoryId): number {
  return FLEET_VEHICLES.filter((v) => v.categoryId === categoryId).length
}
