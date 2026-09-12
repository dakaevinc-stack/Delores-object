import type {
  FleetCategory,
  FleetCategoryId,
  FleetMaintenancePlan,
  FleetOwnership,
  FleetPass,
  FleetPresetCategoryId,
  FleetRepairRecord,
  FleetSpecs,
  FleetVehicle,
} from '../domain/fleet'
import { IMPORTED_FLEET, type ImportedFleetUnit } from './fleet.imported'

/** Preset-классы со строго narrow id — так TS различает заранее известные категории. */
export const FLEET_CATEGORIES: readonly (FleetCategory & { id: FleetPresetCategoryId })[] = [
  { id: 'cars', title: 'Легковые автомобили', shortTitle: 'Легковые' },
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
    case 'cars':
    case 'trailers':
    case 'cold-mills':
      return 'generic'
    default:
      return 'truck'
  }
}

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
  if (/ammann/i.test(model)) return { brand: 'AMMANN', country: 'Швейцария' }
  if (/hamm|arx/i.test(model)) return { brand: 'HAMM', country: 'Германия' }
  if (/wirtgen/i.test(model)) return { brand: 'Wirtgen', country: 'Германия' }
  if (/bomag/i.test(model)) return { brand: 'BOMAG', country: 'Германия' }
  if (/\bмаз\b|\bmaz\b/i.test(model)) return { brand: 'МАЗ', country: 'Беларусь' }
  if (/лиаз|liaz/i.test(model)) return { brand: 'ЛиАЗ', country: 'Россия' }
  if (/муп[-\s]?351|муп\b/i.test(model)) return { brand: 'МУП‑351', country: 'Россия' }
  if (/регион[-\s]?45|ас[-\s]?с41/i.test(model)) return { brand: 'Регион‑45', country: 'Россия' }
  if (/lada|лада|нива|niva|21214|4x4/i.test(model)) return { brand: 'LADA', country: 'Россия' }
  if (/skoda|škoda|octavia/i.test(model)) return { brand: 'Škoda', country: 'Чехия' }
  if (/toyota|camry|land\s*cruiser/i.test(model)) return { brand: 'Toyota', country: 'Япония' }
  if (/geely|monjaro/i.test(model)) return { brand: 'Geely', country: 'Китай' }
  if (/haval|dargo/i.test(model)) return { brand: 'Haval', country: 'Китай' }
  if (/land\s*rover|range\s*rover/i.test(model)) {
    return { brand: 'Land Rover', country: 'Великобритания' }
  }
  if (/\bkia\b|sportage|optima/i.test(model)) return { brand: 'Kia', country: 'Корея' }
  if (/volkswagen|\bvw\b|caddy/i.test(model)) return { brand: 'Volkswagen', country: 'Германия' }
  if (/sitrak/i.test(model)) return { brand: 'SITRAK', country: 'Китай' }
  if (/liugong/i.test(model)) return { brand: 'LiuGong', country: 'Китай' }
  if (/\bzdm\b/i.test(model)) return { brand: 'ZDM', country: 'Китай' }
  if (/specpricep|спецприцеп/i.test(model)) return { brand: 'Спецприцеп', country: 'Россия' }
  if (/sinanli/i.test(model)) return { brand: 'Sinanli', country: 'Турция' }
  return null
}

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
   Сборка парка из учётных таблиц
   ------------------------------------------------------------
   Единственный источник данных — `fleet.imported.ts`, который
   генерируется из рабочих таблиц (см. scripts/fleet-excel).
   Здесь только то, что выводится из этих же данных: силуэт для
   схемы, фото, марка по названию модели и форма владения по
   собственнику. Ничего не додумываем: нет данных — поле пустое.
   ============================================================ */

/** Латиница в категориях прав: в таблице они набраны и «С», и «C». */
function normalizeLicenseCategory(value: string | undefined): string | undefined {
  if (!value) return undefined
  const map: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', Д: 'D', М: 'M' }
  return [...value].map((ch) => map[ch] ?? ch).join('')
}

/**
 * Форма владения по записи в графе «Собственник».
 * Лизинговые компании — лизинг; наше юрлицо — собственность;
 * всё остальное (машина оформлена на частное лицо или другую фирму) —
 * аренда: юридически это не наша техника.
 */
function ownershipFromOwner(owner: string | undefined): FleetOwnership | undefined {
  if (!owner) return undefined
  if (/лизинг|дойче финанс/i.test(owner)) return 'leased'
  if (/деловые решения/i.test(owner)) return 'owned'
  return 'rented'
}

/** Латинский вид номера — чтобы id техники и ссылки были читаемыми. */
function latinPlate(plateKey: string): string {
  const map: Record<string, string> = {
    А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H',
    О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
  }
  return [...plateKey].map((ch) => map[ch] ?? ch).join('').toLowerCase()
}

/**
 * id единицы техники. Привязан к госномеру, а не к позиции в списке:
 * правки и удаления пользователя хранятся по id, и они не должны
 * «переезжать» на другую машину при добавлении новой в парк.
 */
function vehicleId(unit: ImportedFleetUnit): string {
  return `${unit.categoryId}-${latinPlate(unit.plateKey)}`
}

function specsFrom(unit: ImportedFleetUnit): FleetSpecs {
  const brand = guessBrand(unit.model)
  const ownership = ownershipFromOwner(unit.registeredOwner)
  const isHours = unit.meter?.kind === 'hours'
  return {
    year: unit.year,
    manufacturer: brand?.brand,
    countryOfOrigin: brand?.country,
    licenseCategory: normalizeLicenseCategory(unit.licenseCategory),
    odometerKm: unit.meter && !isHours ? unit.meter.value : undefined,
    engineHours: isHours ? unit.meter?.value : undefined,
    meterAsOfIso: unit.meter?.asOfIso,
    fuelRemainingL: unit.meter?.fuelRemainingL,
    ownership,
    registeredOwner: unit.registeredOwner,
    leasingCompany: ownership === 'leased' ? unit.registeredOwner : undefined,
    leaseEndIso: unit.leaseEndIso,
    registrationCertificate: unit.registrationCertificate,
    registrationCertificateIssuedIso: unit.registrationCertificateIssuedIso,
    vehiclePassport: unit.vehiclePassport,
    vehiclePassportIssuedIso: unit.vehiclePassportIssuedIso,
    /* Графа «Виалон» в таблице — это подключение к мониторингу Wialon. */
    trackerProvider: unit.equipment.telematics === 'yes' ? 'Wialon' : undefined,
    telematics: unit.equipment.telematics,
    fuelSensor: unit.equipment.fuelSensor,
    transponder: unit.equipment.transponder,
    platon: unit.equipment.platon,
    tachograph: unit.equipment.tachograph,
    payloadKg: unit.dimensions?.payloadKg,
    maxMassKg: unit.dimensions?.maxMassKg,
    lengthCm: unit.dimensions?.lengthCm,
    axleCount: unit.dimensions?.axleCount,
  }
}

function maintenanceFrom(unit: ImportedFleetUnit): FleetMaintenancePlan {
  const isHours = unit.meter?.kind === 'hours'
  const at = unit.service?.meterAtService
  return {
    lastServiceMileageKm: at != null && !isHours ? at : undefined,
    lastServiceEngineHours: at != null && isHours ? at : undefined,
    notes: unit.service?.plannedWork,
  }
}

function repairsFrom(unit: ImportedFleetUnit): FleetRepairRecord[] {
  return unit.repairs.map((r) => ({
    id: r.id,
    dateIso: r.dateIso ?? '',
    mileageKm: r.mileage,
    title: r.title,
    details: r.details,
    affectedParts: r.affectedParts,
    open: r.open,
    costRub: r.costRub,
  }))
}

function passesFrom(unit: ImportedFleetUnit): FleetPass[] {
  return unit.passes.map((p) => ({
    id: p.id,
    name: p.name,
    required: p.required,
    validUntilIso: p.validUntilIso,
    notes: p.notes,
  }))
}

function buildVehicles(): FleetVehicle[] {
  return IMPORTED_FLEET.map((unit) => ({
    id: vehicleId(unit),
    categoryId: unit.categoryId,
    plate: unit.plate,
    vinOrFrame: unit.vinOrFrame,
    model: unit.model,
    heroPhotoUrl: fleetHeroPhotoUrl(unit.categoryId, unit.model),
    schematicVariant: schematicFor(unit.categoryId),
    repairs: repairsFrom(unit),
    maintenance: maintenanceFrom(unit),
    insurance: {
      policyNumber: unit.insurance.policyNumber,
      validUntilIso: unit.insurance.validUntilIso,
      notRequired: unit.insurance.notRequired,
    },
    passes: passesFrom(unit),
    specs: specsFrom(unit),
    technicalInspection: unit.technicalInspection,
    notes: unit.notes,
  }))
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
