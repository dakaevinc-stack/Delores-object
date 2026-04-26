import { Link, Navigate, useParams } from 'react-router-dom'
import {
  activeFaultParts,
  costBreakdown,
  daysUntil,
  FLEET_PART_LABEL_RU,
  formatRub,
  insuranceUrgency,
  technicalInspectionUrgency,
  type FleetFuel,
  type FleetOwnership,
  type FleetPass,
  type FleetTransmission,
  type FleetVehicle,
  type InsuranceUrgency,
} from '../domain/fleet'
import { FleetVehicleSchematic } from '../features/fleet/FleetVehicleSchematic'
import { FleetCategoryIcon } from '../features/fleet/FleetCategoryIcon'
import { RussianLicensePlate } from '../features/fleet/RussianLicensePlate'
import { useFleetRegistry } from '../features/fleet/useFleetRegistry'
import { useFleetVehicleState } from '../features/fleet/useFleetVehicleState'
import {
  DateInput,
  MoneyInput,
  NumberInput,
  Segmented,
  TextInput,
  TextareaInput,
} from '../features/fleet/InlineInputs'
import { RepairsEditor } from '../features/fleet/RepairsEditor'
import { PassesEditor } from '../features/fleet/PassesEditor'
import styles from './FleetVehiclePage.module.css'

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatRubOrDash(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '—'
  return formatRub(v)
}

function insuranceBadgeText(u: InsuranceUrgency): string {
  switch (u) {
    case 'expired':
      return 'Истекла'
    case 'critical':
      return 'Срочно продлить'
    case 'soon':
      return 'Скоро окончание'
    default:
      return 'В норме'
  }
}

function insurancePanelClass(u: InsuranceUrgency): string {
  switch (u) {
    case 'expired':
      return styles.insuranceExpired
    case 'critical':
      return styles.insuranceCritical
    case 'soon':
      return styles.insuranceSoon
    default:
      return styles.insuranceOk
  }
}

function badgeClass(u: InsuranceUrgency): string {
  if (u === 'expired' || u === 'critical') return `${styles.insuranceBadge} ${styles.badgeCritical}`
  if (u === 'soon') return `${styles.insuranceBadge} ${styles.badgeSoon}`
  return styles.insuranceBadge
}

/* ============================================================
   Пропуска: один состоянию — одна подпись, без повторений.
   ============================================================ */

type PassStatus = 'valid' | 'expiring' | 'expired' | 'missing'

type PassView = {
  status: PassStatus
  title: string
  meta?: string
}

function describePass(p: FleetPass): PassView {
  if (!p.validUntilIso) {
    return {
      status: 'missing',
      title: 'Нет пропуска',
    }
  }
  const d = daysUntil(p.validUntilIso)
  if (d < 0) {
    return {
      status: 'expired',
      title: `Истёк ${formatDate(p.validUntilIso)}`,
      meta: `${Math.abs(d)} дн. назад`,
    }
  }
  if (d === 0) {
    return {
      status: 'expiring',
      title: 'Истекает сегодня',
      meta: formatDate(p.validUntilIso),
    }
  }
  if (d <= 30) {
    return {
      status: 'expiring',
      title: `Действует до ${formatDate(p.validUntilIso)}`,
      meta: `через ${d} дн.`,
    }
  }
  return {
    status: 'valid',
    title: `Действует до ${formatDate(p.validUntilIso)}`,
  }
}

function passCardClass(s: PassStatus): string {
  switch (s) {
    case 'valid':
      return `${styles.passCard} ${styles.passValid}`
    case 'expiring':
      return `${styles.passCard} ${styles.passExpiring}`
    case 'expired':
      return `${styles.passCard} ${styles.passExpired}`
    case 'missing':
      return `${styles.passCard} ${styles.passMissing}`
  }
}

/* ============================================================
   Статус-стрип наверху карточки.
   ============================================================ */

type StatusTone = 'ok' | 'soon' | 'warn' | 'muted'

type StatusItem = {
  id: string
  label: string
  value: string
  meta?: string
  tone: StatusTone
  icon: 'shield' | 'wrench' | 'repair' | 'badge'
}

function computeStatusStrip(v: FleetVehicle): StatusItem[] {
  /* Страховка */
  const insNotRequired = v.insurance.notRequired === true
  const insU = insuranceUrgency(v.insurance.validUntilIso)
  const insDays = daysUntil(v.insurance.validUntilIso)
  const insTone: StatusTone = insNotRequired
    ? 'muted'
    : insU === 'expired' || insU === 'critical'
      ? 'warn'
      : insU === 'soon'
        ? 'soon'
        : 'ok'
  const insValue = insNotRequired
    ? 'Не требуется'
    : insU === 'expired'
      ? `Просрочена ${Math.abs(insDays)} дн.`
      : insU === 'critical'
        ? `Истекает через ${insDays} дн.`
        : insU === 'soon'
          ? `Через ${insDays} дн.`
          : 'В норме'
  const insMeta = insNotRequired
    ? 'Полуприцеп — ОСАГО не нужно'
    : `до ${formatDate(v.insurance.validUntilIso)}`

  /* ТО */
  const nextIso = v.maintenance.nextDueDateIso
  const nextD = nextIso ? daysUntil(nextIso) : null
  const toTone: StatusTone =
    nextD == null ? 'muted' : nextD < 0 ? 'warn' : nextD <= 14 ? 'soon' : 'ok'
  const toValue =
    nextD == null
      ? 'Не запланировано'
      : nextD < 0
        ? `Просрочено ${Math.abs(nextD)} дн.`
        : nextD === 0
          ? 'Сегодня'
          : `Через ${nextD} дн.`
  const toMeta = nextIso ? formatDate(nextIso) : undefined

  /* Ремонты */
  const openCount = v.repairs.filter((r) => r.open).length
  const repairTone: StatusTone = openCount === 0 ? 'ok' : openCount >= 2 ? 'warn' : 'soon'
  const repairValue = openCount === 0 ? 'Без активных' : `${openCount} в работе`
  const repairMeta =
    v.repairs.length > 0 ? `Всего записей: ${v.repairs.length}` : 'Журнал пуст'

  /* Пропуска */
  const views = v.passes.map(describePass)
  const worst: PassStatus = views.reduce<PassStatus>((acc, p) => {
    const rank: Record<PassStatus, number> = { valid: 0, expiring: 1, missing: 2, expired: 3 }
    return rank[p.status] > rank[acc] ? p.status : acc
  }, 'valid')
  const passTone: StatusTone =
    worst === 'expired'
      ? 'warn'
      : worst === 'missing'
        ? 'soon'
        : worst === 'expiring'
          ? 'soon'
          : 'ok'
  const passValue =
    v.passes.length === 0
      ? 'Не заведены'
      : worst === 'valid'
        ? 'Все действуют'
        : worst === 'expiring'
          ? 'Скоро закончатся'
          : worst === 'missing'
            ? 'Есть без пропуска'
            : 'Есть просроченные'

  return [
    {
      id: 'ins',
      label: 'Страховка',
      value: insValue,
      meta: insMeta,
      tone: insTone,
      icon: 'shield',
    },
    {
      id: 'to',
      label: 'Следующее ТО',
      value: toValue,
      meta: toMeta,
      tone: toTone,
      icon: 'wrench',
    },
    {
      id: 'repair',
      label: 'Ремонты',
      value: repairValue,
      meta: repairMeta,
      tone: repairTone,
      icon: 'repair',
    },
    {
      id: 'pass',
      label: 'Пропуска',
      value: passValue,
      meta: v.passes.length > 0 ? `Всего: ${v.passes.length}` : undefined,
      tone: passTone,
      icon: 'badge',
    },
  ]
}

/* ============================================================
   Паспорт техники — выдуманные характеристики (год, мощность,
   топливо, оператор и т.д.) с набором «плиток» в премиум-стиле.
   ============================================================ */

type SpecIconKind =
  | 'calendar'
  | 'factory'
  | 'gauge'
  | 'clock'
  | 'bolt'
  | 'fuel'
  | 'gear'
  | 'scales'
  | 'box'
  | 'palette'
  | 'key'
  | 'user'
  | 'satellite'
  | 'id'
  | 'flag'
  | 'doc'

const FUEL_RU: Record<FleetFuel, string> = {
  diesel: 'Дизель',
  petrol: 'Бензин',
  gas: 'Газ',
  hybrid: 'Гибрид',
  electric: 'Электро',
}

const TRANS_RU: Record<FleetTransmission, string> = {
  manual: 'МКПП',
  automatic: 'АКПП',
  robotic: 'Робот',
  hydrostatic: 'Гидростатика',
}

const OWN_RU: Record<FleetOwnership, string> = {
  owned: 'Собственная',
  leased: 'Лизинг',
  rented: 'Аренда',
}

const COLOR_HEX: Record<string, string> = {
  'белый': '#f1f3f6',
  'оранжевый': '#f97316',
  'жёлтый': '#f4b400',
  'желтый': '#f4b400',
  'синий': '#2563eb',
  'красный': '#dc2626',
  'серый': '#6b7280',
  'чёрный': '#111827',
  'черный': '#111827',
  'зелёный': '#16a34a',
  'зеленый': '#16a34a',
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatTons(kg: number): string {
  const tons = kg / 1000
  return tons >= 10 ? `${Math.round(tons)} т` : `${tons.toFixed(1).replace('.', ',')} т`
}

/** Нормализация телефона для атрибута `href="tel:..."` — только + и цифры. */
function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  /* Если пользователь ввёл «8 999…», превращаем в «+7 999…» для совместимости. */
  if (/^8\d{10}$/.test(cleaned)) return `+7${cleaned.slice(1)}`
  return cleaned
}

type SpecTileDef = {
  key: string
  icon: SpecIconKind
  label: string
  value: string
  sub?: string
  /** Если задан — `sub` рендерится как ссылка (tel:, mailto: и т.д.). */
  subHref?: string
  accent?: string
  primary?: boolean
}

function buildSpecTiles(v: FleetVehicle): SpecTileDef[] {
  const s = v.specs ?? {}
  const tiles: SpecTileDef[] = []

  /* Первая линия — самые «сочные» характеристики. */
  if (s.year) {
    tiles.push({ key: 'year', icon: 'calendar', label: 'Год выпуска', value: String(s.year), primary: true })
  }
  if (s.manufacturer) {
    tiles.push({
      key: 'brand',
      icon: 'factory',
      label: 'Производитель',
      value: s.manufacturer,
      sub: s.countryOfOrigin,
      primary: true,
    })
  }
  if (s.odometerKm != null) {
    tiles.push({
      key: 'odo',
      icon: 'gauge',
      label: 'Пробег',
      value: `${s.odometerKm.toLocaleString('ru-RU')} км`,
      primary: true,
    })
  } else if (s.engineHours != null) {
    tiles.push({
      key: 'hours',
      icon: 'clock',
      label: 'Моточасы',
      value: `${s.engineHours.toLocaleString('ru-RU')} ч`,
      primary: true,
    })
  }
  if (s.enginePowerHp) {
    tiles.push({
      key: 'power',
      icon: 'bolt',
      label: 'Мощность',
      value: `${s.enginePowerHp} л.с.`,
      sub: s.engineVolumeL ? `${String(s.engineVolumeL).replace('.', ',')} л` : undefined,
      primary: true,
    })
  }

  /* Вторая линия — детали. */
  if (s.fuel) tiles.push({ key: 'fuel', icon: 'fuel', label: 'Топливо', value: FUEL_RU[s.fuel] })
  if (s.transmission) {
    tiles.push({ key: 'trans', icon: 'gear', label: 'Коробка', value: TRANS_RU[s.transmission] })
  }
  if (s.payloadKg) {
    tiles.push({ key: 'payload', icon: 'scales', label: 'Грузоподъёмность', value: formatTons(s.payloadKg) })
  }
  if (s.bodyVolumeM3) {
    tiles.push({
      key: 'vol',
      icon: 'box',
      label: 'Объём кузова',
      value: `${s.bodyVolumeM3} м³`,
    })
  }
  if (s.color) {
    tiles.push({
      key: 'color',
      icon: 'palette',
      label: 'Цвет',
      value: capitalize(s.color),
      accent: COLOR_HEX[s.color.toLowerCase()] ?? '#e5e7eb',
    })
  }
  if (s.ownership) {
    tiles.push({
      key: 'own',
      icon: 'key',
      label: 'Принадлежность',
      value: OWN_RU[s.ownership],
      sub:
        s.ownership === 'leased'
          ? s.leasingCompany
          : s.ownership === 'rented'
            ? s.registeredOwner
            : s.registeredOwner,
    })
  }
  if (s.responsibleOperator || s.responsiblePhone) {
    tiles.push({
      key: 'op',
      icon: 'user',
      label: 'Ответственный',
      value: s.responsibleOperator ?? 'Не назначен',
      sub: s.responsiblePhone,
      subHref: s.responsiblePhone ? `tel:${telHref(s.responsiblePhone)}` : undefined,
    })
  }
  if (s.trackerProvider) {
    tiles.push({
      key: 'tr',
      icon: 'satellite',
      label: 'GPS‑трекер',
      value: s.trackerProvider,
      sub: s.trackerId,
    })
  }
  if (s.licenseCategory) {
    tiles.push({ key: 'lic', icon: 'id', label: 'Категория прав', value: s.licenseCategory })
  }
  if (s.acquiredDateIso) {
    tiles.push({ key: 'acq', icon: 'flag', label: 'В парке с', value: formatDate(s.acquiredDateIso) })
  }

  return tiles
}

/* ============================================================
   Документы единицы: СТС, ПТС/ЭПТС и диагностическая карта.
   Показываем отдельным блоком, чтобы бумажный юридический статус
   не тонул в технических характеристиках.
   ============================================================ */

type DocTone = 'neutral' | 'ok' | 'soon' | 'warn' | 'missing'

type DocCard = {
  key: string
  label: string
  kicker: string
  number: string
  primaryLine?: string
  secondaryLine?: string
  tone: DocTone
  badge?: string
}

/** ПСМ — паспорт самоходной машины: для экскаваторов, катков, погрузчиков и т.п. */
const SELF_PROPELLED_CATEGORIES = new Set<string>([
  'excavators',
  'backhoes',
  'front-loaders',
  'mini-loaders',
  'rollers',
  'pavers',
  'cold-mills',
])

function detectPtsKind(v: FleetVehicle): { kind: 'ПТС' | 'ЭПТС' | 'ПСМ'; title: string } {
  if (SELF_PROPELLED_CATEGORIES.has(v.categoryId as string)) {
    return { kind: 'ПСМ', title: 'Паспорт самоходной машины' }
  }
  const passport = v.specs?.vehiclePassport ?? ''
  const digits = passport.replace(/\D/g, '')
  if (digits.length >= 13) return { kind: 'ЭПТС', title: 'Электронный паспорт ТС' }
  return { kind: 'ПТС', title: 'Паспорт транспортного средства' }
}

function docToneFromUrgency(u: InsuranceUrgency | 'missing'): DocTone {
  switch (u) {
    case 'ok':
      return 'ok'
    case 'soon':
      return 'soon'
    case 'critical':
    case 'expired':
      return 'warn'
    case 'missing':
      return 'missing'
  }
}

function docBadgeFromUrgency(u: InsuranceUrgency | 'missing', days: number | null): string | undefined {
  if (u === 'missing') return 'Нет данных'
  if (days == null) return undefined
  if (u === 'expired') return `Просрочена ${Math.abs(days)} дн.`
  if (u === 'critical') return `Истекает через ${days} дн.`
  if (u === 'soon') return `Через ${days} дн.`
  return undefined
}

function buildDocumentCards(v: FleetVehicle): DocCard[] {
  const specs = v.specs ?? {}
  const cards: DocCard[] = []

  /* СТС */
  if (specs.registrationCertificate) {
    cards.push({
      key: 'cts',
      label: 'Свидетельство о регистрации',
      kicker: 'СТС',
      number: specs.registrationCertificate,
      primaryLine: specs.registrationCertificateIssuedIso
        ? `Выдано ${formatDate(specs.registrationCertificateIssuedIso)}`
        : undefined,
      tone: 'neutral',
    })
  }

  /* ПТС / ЭПТС / ПСМ */
  if (specs.vehiclePassport) {
    const { kind, title } = detectPtsKind(v)
    cards.push({
      key: 'pts',
      label: title,
      kicker: kind,
      number: specs.vehiclePassport,
      primaryLine: specs.vehiclePassportIssuedIso
        ? `Выдан ${formatDate(specs.vehiclePassportIssuedIso)}`
        : undefined,
      tone: 'neutral',
    })
  }

  /* Диагностическая карта */
  const ti = v.technicalInspection
  if (ti && (ti.cardNumber || ti.validUntilIso)) {
    const u = technicalInspectionUrgency(ti.validUntilIso)
    const days = ti.validUntilIso ? daysUntil(ti.validUntilIso) : null
    const primary = ti.validUntilIso
      ? u === 'expired'
        ? `Срок истёк ${formatDate(ti.validUntilIso)}`
        : `Действует до ${formatDate(ti.validUntilIso)}`
      : undefined
    cards.push({
      key: 'dk',
      label: 'Диагностическая карта',
      kicker: 'ДК',
      number: ti.cardNumber ?? '—',
      primaryLine: primary,
      secondaryLine: ti.validUntilIso && u !== 'missing' ? 'Документ техосмотра' : undefined,
      tone: docToneFromUrgency(u),
      badge: docBadgeFromUrgency(u, days),
    })
  }

  return cards
}

function SpecIcon({ kind }: { kind: SpecIconKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      )
    case 'factory':
      return (
        <svg {...common}>
          <path d="M3 20V10l5 3V10l5 3V8l8 5v7z" />
          <path d="M7 20v-3M12 20v-3M17 20v-3" />
        </svg>
      )
    case 'gauge':
      return (
        <svg {...common}>
          <path d="M3.5 14a8.5 8.5 0 0 1 17 0" />
          <path d="M12 14l4.5-4" />
          <circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
        </svg>
      )
    case 'fuel':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="10" height="17" rx="1.6" />
          <path d="M4 10h10M14 8l3 2v8a2 2 0 0 0 2 2v-9l-3-3" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
        </svg>
      )
    case 'scales':
      return (
        <svg {...common}>
          <path d="M12 4v16M4 20h16M7 9l-3 7h6zM17 9l-3 7h6z" />
          <path d="M12 4l-5 5M12 4l5 5" />
        </svg>
      )
    case 'box':
      return (
        <svg {...common}>
          <path d="M3.5 7.5L12 3l8.5 4.5V17L12 21 3.5 17z" />
          <path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
        </svg>
      )
    case 'palette':
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18 3 3 0 0 0 2-5.2 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3C21 6 17 3 12 3z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="9.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'key':
      return (
        <svg {...common}>
          <circle cx="8" cy="12" r="3.5" />
          <path d="M11.5 12H21l-2.5 2.5M17 12v3" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.5 20c1.5-3.8 4.5-5.5 7.5-5.5s6 1.7 7.5 5.5" />
        </svg>
      )
    case 'satellite':
      return (
        <svg {...common}>
          <path d="M3 3l5 5-3 3-5-5z" transform="translate(4 4)" />
          <path d="M5 13l6 6M14 5a5 5 0 0 1 5 5M12 3a8 8 0 0 1 8 8" />
        </svg>
      )
    case 'id':
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
          <circle cx="9" cy="12" r="2" />
          <path d="M13 10h5M13 14h5M6 16.5c.5-1.4 1.7-2 3-2s2.5.6 3 2" />
        </svg>
      )
    case 'flag':
      return (
        <svg {...common}>
          <path d="M5 3v18M5 4h11l-2 3.5L16 11H5" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" />
        </svg>
      )
  }
}

function StatusIcon({ kind }: { kind: StatusItem['icon'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
          <path d="M9 12l2.2 2.2L15 10.5" />
        </svg>
      )
    case 'wrench':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        </svg>
      )
    case 'repair':
      return (
        <svg {...common}>
          <path d="M14.7 3.3a4.5 4.5 0 0 0-4.9 6l-6.2 6.2a1.5 1.5 0 1 0 2.1 2.1l6.2-6.2a4.5 4.5 0 0 0 6-4.9l-2.6 2.6-2.1-.3-.3-2.1 2.6-2.6z" />
        </svg>
      )
    case 'badge':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      )
  }
}

export function FleetVehiclePage() {
  const { vehicleId = '' } = useParams()
  const { getById, getCategory } = useFleetRegistry()
  const base = getById(vehicleId)

  /* Хук вызывается всегда — передаём стабильный «плейсхолдер», чтобы не нарушать
     правила хуков при редких ранних возвратах (not found / неверная категория). */
  const placeholder = base ?? {
    id: '__placeholder__',
    categoryId: 'light-trucks',
    plate: '',
    model: '',
    vinOrFrame: '',
    schematicVariant: 'generic',
    passes: [],
    maintenance: {},
    insurance: { validUntilIso: new Date().toISOString().slice(0, 10) },
    repairs: [],
  }
  const {
    vehicle,
    isEditing,
    setEditing,
    isEdited,
    reset,
    patchInsurance,
    patchMaintenance,
    patchSpecs,
    setRepairs,
    setPasses,
  } = useFleetVehicleState(placeholder)

  if (!base) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>
          Единица не найдена. <Link to="/spectehnika">К списку классов</Link>
        </p>
      </div>
    )
  }

  const cat = getCategory(vehicle.categoryId)
  if (!cat) return <Navigate to="/spectehnika" replace />

  const insU = insuranceUrgency(vehicle.insurance.validUntilIso)
  const insDays = daysUntil(vehicle.insurance.validUntilIso)
  const faults = activeFaultParts(vehicle)
  const costs = costBreakdown(vehicle)
  const statusItems = computeStatusStrip(vehicle)
  const specTiles = buildSpecTiles(vehicle)
  const primaryTiles = specTiles.filter((t) => t.primary)
  const secondaryTiles = specTiles.filter((t) => !t.primary)
  const documentCards = buildDocumentCards(vehicle)
  const heroPhoto = vehicle.heroPhotoUrl
  const heroSrc = heroPhoto
    ? heroPhoto.startsWith('http')
      ? heroPhoto
      : `${import.meta.env.BASE_URL}${heroPhoto.replace(/^\//, '')}`
    : null

  /* Визуальный прогресс полиса: сколько осталось от условных 365 дней. */
  const insurancePct = Math.max(0, Math.min(100, Math.round((insDays / 365) * 100)))
  const insuranceNotRequired = vehicle.insurance.notRequired === true

  return (
    <div className={`${styles.page} ${isEditing ? styles.editing : ''}`}>
      <nav className={styles.nav} aria-label="Навигация">
        <Link to="/">Главная</Link>
        <span>/</span>
        <Link to="/spectehnika">Спецтехника</Link>
        <span>/</span>
        <Link to={`/spectehnika/${vehicle.categoryId}`}>{cat.shortTitle}</Link>
        <span>/</span>
        <span>{vehicle.plate}</span>
      </nav>

      {/* ============================================================
          Панель инструментов редактирования
          ============================================================ */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarInfo}>
          <span className={styles.toolbarKicker}>Карточка единицы</span>
          {isEdited ? (
            <span className={styles.toolbarSaved} title="Данные сохранены локально">
              <span className={styles.toolbarSavedDot} aria-hidden />
              Локальные правки сохранены
            </span>
          ) : (
            <span className={styles.toolbarHint}>
              Для ввода ТО, страховки и ремонтов — нажмите «Редактировать».
            </span>
          )}
        </div>
        <div className={styles.toolbarActions}>
          {isEdited ? (
            <button
              type="button"
              className={styles.toolbarReset}
              onClick={() => {
                if (window.confirm('Сбросить все локальные правки по этой единице?')) {
                  reset()
                }
              }}
              title="Вернуть данные к исходным из системы"
            >
              Сбросить
            </button>
          ) : null}
          <button
            type="button"
            className={isEditing ? styles.toolbarDone : styles.toolbarEdit}
            onClick={() => setEditing(!isEditing)}
          >
            {isEditing ? (
              <>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                  <path
                    d="M4 10.5l3.5 3.5L16 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Готово
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                  <path
                    d="M13.3 3.7l3 3L7 16H4v-3l9.3-9.3z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Редактировать
              </>
            )}
          </button>
        </div>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.heroKicker}>
            <span className={styles.heroKickerIcon} aria-hidden>
              <FleetCategoryIcon id={vehicle.categoryId} size={14} />
            </span>
            <span>{cat.title}</span>
            <span className={styles.heroKickerSep} aria-hidden>
              ·
            </span>
            <span className={styles.heroKickerId}>Единица парка</span>
          </p>
          <div className={styles.heroPlateRow}>
            <RussianLicensePlate plate={vehicle.plate} size="lg" />
          </div>
          <h1 className={styles.heroModel}>{vehicle.model}</h1>
          <dl className={styles.heroFacts}>
            <div className={styles.heroFact}>
              <dt>VIN / рама</dt>
              <dd className={styles.heroFactMono}>{vehicle.vinOrFrame}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.heroVisualCol}>
          {heroSrc ? (
            <figure className={styles.heroPhotoFigure} aria-label={`Фото: ${vehicle.model}`}>
              <div className={styles.heroPhotoFrame}>
                <img
                  className={styles.heroPhotoImg}
                  src={heroSrc}
                  alt={vehicle.model}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
            </figure>
          ) : (
            <FleetVehicleSchematic variant={vehicle.schematicVariant} highlightedParts={faults} />
          )}
        </div>
      </section>

      {/* ============================================================
          Статус-стрип: четыре короткие карточки состояния
          ============================================================ */}
      <section className={styles.statusStrip} aria-label="Текущее состояние">
        {statusItems.map((s) => (
          <div
            key={s.id}
            className={`${styles.statusCard} ${styles[`statusTone-${s.tone}`]}`}
          >
            <span className={styles.statusIconBox} aria-hidden>
              <StatusIcon kind={s.icon} />
            </span>
            <span className={styles.statusBody}>
              <span className={styles.statusLabel}>{s.label}</span>
              <span className={styles.statusValue}>{s.value}</span>
              {s.meta ? <span className={styles.statusMeta}>{s.meta}</span> : null}
            </span>
          </div>
        ))}
      </section>

      {/* ============================================================
          Паспорт техники — характеристики, принадлежность, оператор
          ============================================================ */}
      {specTiles.length > 0 || isEditing ? (
        <section className={styles.passport} aria-labelledby="passport-heading">
          <header className={styles.passportHead}>
            <div className={styles.passportHeadText}>
              <p className={styles.passportKicker}>
                <span className={styles.passportKickerBar} aria-hidden />
                Техника
              </p>
              <h2 id="passport-heading" className={styles.passportTitle}>
                Паспорт
              </h2>
              <p className={styles.passportLead}>
                Характеристики, принадлежность и ответственный — на один взгляд.
              </p>
            </div>
            {vehicle.specs?.year ? (
              <div className={styles.passportHeadAge} aria-hidden>
                <span className={styles.passportHeadAgeValue}>
                  {Math.max(0, new Date().getFullYear() - vehicle.specs.year)}
                </span>
                <span className={styles.passportHeadAgeLabel}>
                  {(() => {
                    const a = Math.max(0, new Date().getFullYear() - vehicle.specs.year)
                    const last = a % 10
                    const last2 = a % 100
                    if (last2 >= 11 && last2 <= 14) return 'лет в строю'
                    if (last === 1) return 'год в строю'
                    if (last >= 2 && last <= 4) return 'года в строю'
                    return 'лет в строю'
                  })()}
                </span>
              </div>
            ) : null}
          </header>

          {isEditing ? (
            <div className={styles.passportEdit} aria-label="Правка паспорта">
              <p className={styles.passportEditHint}>
                Пробег и форма владения — отражаются в плитках и в блоке документов.
              </p>
              <div className={styles.passportEditGrid}>
                <label className={styles.editField}>
                  <span className={styles.editLabel}>
                    {vehicle.specs?.engineHours != null && vehicle.specs?.odometerKm == null
                      ? 'Моточасы'
                      : 'Пробег'}
                  </span>
                  {vehicle.specs?.engineHours != null && vehicle.specs?.odometerKm == null ? (
                    <NumberInput
                      value={vehicle.specs?.engineHours ?? null}
                      onChange={(v) =>
                        patchSpecs({ engineHours: v == null ? undefined : v })
                      }
                      suffix="ч"
                      placeholder="—"
                      aria-label="Моточасы"
                    />
                  ) : (
                    <NumberInput
                      value={vehicle.specs?.odometerKm ?? null}
                      onChange={(v) =>
                        patchSpecs({ odometerKm: v == null ? undefined : v })
                      }
                      suffix="км"
                      placeholder="—"
                      aria-label="Пробег"
                    />
                  )}
                </label>

                <div className={styles.editField}>
                  <span className={styles.editLabel}>Принадлежность</span>
                  <Segmented<FleetOwnership>
                    value={vehicle.specs?.ownership ?? 'owned'}
                    onChange={(v) =>
                      patchSpecs({
                        ownership: v,
                        ...(v !== 'leased' ? { leasingCompany: undefined } : {}),
                      })
                    }
                    options={[
                      { value: 'owned', label: 'Собственность', tone: 'ok' },
                      { value: 'leased', label: 'Лизинг', tone: 'neutral' },
                      { value: 'rented', label: 'Аренда', tone: 'neutral' },
                    ]}
                    aria-label="Форма владения"
                  />
                </div>

                {vehicle.specs?.ownership === 'leased' ? (
                  <label className={`${styles.editField} ${styles.editFieldWide}`}>
                    <span className={styles.editLabel}>Лизингодатель</span>
                    <TextInput
                      value={vehicle.specs?.leasingCompany ?? ''}
                      onChange={(v) =>
                        patchSpecs({ leasingCompany: v.trim() === '' ? undefined : v })
                      }
                      placeholder="Например: ООО «Ресо-Лизинг»"
                      aria-label="Лизингодатель"
                    />
                  </label>
                ) : null}

                <label className={`${styles.editField} ${styles.editFieldWide}`}>
                  <span className={styles.editLabel}>
                    {vehicle.specs?.ownership === 'rented'
                      ? 'Арендодатель / собственник по документам'
                      : 'Зарегистрирован на (если не на вас)'}
                  </span>
                  <TextInput
                    value={vehicle.specs?.registeredOwner ?? ''}
                    onChange={(v) =>
                      patchSpecs({ registeredOwner: v.trim() === '' ? undefined : v })
                    }
                    placeholder={
                      vehicle.specs?.ownership === 'rented'
                        ? 'Например: Иванов Иван Иванович или ООО «Партнёр»'
                        : 'Оставьте пустым, если зарегистрирована на вас'
                    }
                    aria-label="Зарегистрирован на"
                  />
                </label>

                <label className={styles.editField}>
                  <span className={styles.editLabel}>Ответственный (оператор / водитель)</span>
                  <TextInput
                    value={vehicle.specs?.responsibleOperator ?? ''}
                    onChange={(v) =>
                      patchSpecs({ responsibleOperator: v.trim() === '' ? undefined : v })
                    }
                    placeholder="Например: Иванов Иван Иванович"
                    aria-label="Ответственный за технику"
                  />
                </label>

                <label className={styles.editField}>
                  <span className={styles.editLabel}>Телефон ответственного</span>
                  <TextInput
                    value={vehicle.specs?.responsiblePhone ?? ''}
                    onChange={(v) =>
                      patchSpecs({ responsiblePhone: v.trim() === '' ? undefined : v })
                    }
                    placeholder="+7 999 000‑00‑00"
                    aria-label="Контактный телефон ответственного"
                    inputMode="tel"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {primaryTiles.length > 0 ? (
            <div className={styles.passportPrimary}>
              {primaryTiles.map((t) => (
                <div key={t.key} className={styles.passportPrimaryTile}>
                  <span className={styles.passportPrimaryIcon} aria-hidden>
                    <SpecIcon kind={t.icon} />
                  </span>
                  <span className={styles.passportPrimaryLabel}>{t.label}</span>
                  <span className={styles.passportPrimaryValue}>{t.value}</span>
                  {t.sub ? (
                    t.subHref ? (
                      <a
                        className={`${styles.passportPrimarySub} ${styles.passportPrimarySubLink}`}
                        href={t.subHref}
                      >
                        {t.sub}
                      </a>
                    ) : (
                      <span className={styles.passportPrimarySub}>{t.sub}</span>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {secondaryTiles.length > 0 ? (
            <div className={styles.passportGrid}>
              {secondaryTiles.map((t) => (
                <div key={t.key} className={styles.passportTile}>
                  <span className={styles.passportTileIcon} aria-hidden>
                    <SpecIcon kind={t.icon} />
                  </span>
                  <span className={styles.passportTileBody}>
                    <span className={styles.passportTileLabel}>{t.label}</span>
                    <span className={styles.passportTileValue}>
                      {t.accent ? (
                        <span
                          className={styles.passportSwatch}
                          style={{ background: t.accent }}
                          aria-hidden
                        />
                      ) : null}
                      {t.value}
                    </span>
                    {t.sub ? (
                      t.subHref ? (
                        <a
                          className={`${styles.passportTileSub} ${styles.passportTileSubLink}`}
                          href={t.subHref}
                        >
                          {t.sub}
                        </a>
                      ) : (
                        <span className={styles.passportTileSub}>{t.sub}</span>
                      )
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ============================================================
          Документы: СТС, ПТС/ЭПТС и диагностическая карта (техосмотр)
          ============================================================ */}
      {documentCards.length > 0 || isEditing ? (
        <section className={styles.documents} aria-labelledby="documents-heading">
          <header className={styles.documentsHead}>
            <div className={styles.documentsHeadText}>
              <p className={styles.documentsKicker}>
                <span className={styles.documentsKickerBar} aria-hidden />
                Документы
              </p>
              <h2 id="documents-heading" className={styles.documentsTitle}>
                Регистрация и техосмотр
              </h2>
              <p className={styles.documentsLead}>
                Свидетельство, ПТС и диагностическая карта — всё в одном блоке со сроком действия.
              </p>
            </div>
            {vehicle.specs?.ownership ? (
              (() => {
                const own = vehicle.specs.ownership
                const meta =
                  own === 'leased'
                    ? vehicle.specs.leasingCompany
                    : vehicle.specs.registeredOwner
                const toneCls =
                  own === 'leased'
                    ? styles.documentsOwnershipLeased
                    : own === 'rented'
                      ? styles.documentsOwnershipRented
                      : ''
                return (
                  <div
                    className={`${styles.documentsOwnership} ${toneCls}`}
                    aria-label="Принадлежность"
                  >
                    <span className={styles.documentsOwnershipKicker}>Владение</span>
                    <span className={styles.documentsOwnershipValue}>{OWN_RU[own]}</span>
                    {meta ? (
                      <span className={styles.documentsOwnershipMeta}>{meta}</span>
                    ) : null}
                  </div>
                )
              })()
            ) : null}
          </header>

          {isEditing ? (
            <div className={styles.documentsEdit} aria-label="Правка документов">
              <p className={styles.documentsEditHint}>
                Номера и даты выдачи — с официальных документов (СТС, ПТС/ЭПТС).
              </p>
              <div className={styles.documentsEditGrid}>
                <label className={styles.editField}>
                  <span className={styles.editLabel}>СТС · номер</span>
                  <TextInput
                    value={vehicle.specs?.registrationCertificate ?? ''}
                    onChange={(v) =>
                      patchSpecs({
                        registrationCertificate: v.trim() === '' ? undefined : v,
                      })
                    }
                    placeholder="99 58 992773"
                    aria-label="Номер свидетельства о регистрации"
                  />
                </label>
                <label className={styles.editField}>
                  <span className={styles.editLabel}>СТС · выдано</span>
                  <DateInput
                    value={vehicle.specs?.registrationCertificateIssuedIso}
                    onChange={(v) => patchSpecs({ registrationCertificateIssuedIso: v })}
                    aria-label="Дата выдачи СТС"
                  />
                </label>
                <label className={styles.editField}>
                  <span className={styles.editLabel}>
                    {SELF_PROPELLED_CATEGORIES.has(vehicle.categoryId as string)
                      ? 'ПСМ · номер'
                      : 'ПТС/ЭПТС · номер'}
                  </span>
                  <TextInput
                    value={vehicle.specs?.vehiclePassport ?? ''}
                    onChange={(v) =>
                      patchSpecs({ vehiclePassport: v.trim() === '' ? undefined : v })
                    }
                    placeholder={
                      SELF_PROPELLED_CATEGORIES.has(vehicle.categoryId as string)
                        ? 'ТС 000000'
                        : '164301041073774'
                    }
                    aria-label="Номер ПТС / ПСМ"
                  />
                </label>
                <label className={styles.editField}>
                  <span className={styles.editLabel}>
                    {SELF_PROPELLED_CATEGORIES.has(vehicle.categoryId as string)
                      ? 'ПСМ · выдан'
                      : 'ПТС/ЭПТС · выдан'}
                  </span>
                  <DateInput
                    value={vehicle.specs?.vehiclePassportIssuedIso}
                    onChange={(v) => patchSpecs({ vehiclePassportIssuedIso: v })}
                    aria-label="Дата выдачи ПТС / ПСМ"
                  />
                </label>
              </div>
            </div>
          ) : null}

          {documentCards.length > 0 ? (
            <div className={styles.documentsGrid}>
              {documentCards.map((d) => (
                <article
                  key={d.key}
                  className={`${styles.documentCard} ${styles[`documentTone-${d.tone}`]}`}
                >
                  <header className={styles.documentCardHead}>
                    <span className={styles.documentCardKicker}>{d.kicker}</span>
                    {d.badge ? (
                      <span className={styles.documentCardBadge}>{d.badge}</span>
                    ) : null}
                  </header>
                  <h3 className={styles.documentCardLabel}>{d.label}</h3>
                  <p className={styles.documentCardNumber}>{d.number}</p>
                  {d.primaryLine ? (
                    <p className={styles.documentCardPrimary}>{d.primaryLine}</p>
                  ) : null}
                  {d.secondaryLine ? (
                    <p className={styles.documentCardSecondary}>{d.secondaryLine}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.costs} aria-labelledby="costs-heading">
        <header className={styles.costsHead}>
          <div className={styles.costsHeadText}>
            <p className={styles.costsKicker}>
              <span className={styles.costsKickerBar} aria-hidden />
              Финансы
            </p>
            <h2 id="costs-heading" className={styles.costsTitle}>
              Расходы на технику
            </h2>
            <p className={styles.costsLead}>
              Стоимость владения: ремонты за всё время, ТО с начала года и годовая страховка.
            </p>
          </div>
          <div className={styles.costsHeadTotal} aria-hidden>
            <span className={styles.costsHeadTotalLabel}>Итого</span>
            <span className={styles.costsHeadTotalValue}>{formatRub(costs.totalRub)}</span>
          </div>
        </header>
        <dl className={styles.costsGrid}>
          <div className={styles.costCard}>
            <span className={`${styles.costCardIcon} ${styles.costCardIconRepair}`} aria-hidden>
              <StatusIcon kind="repair" />
            </span>
            <dt className={styles.costLabel}>Ремонты</dt>
            <dd className={styles.costValue}>{formatRub(costs.repairsTotalRub)}</dd>
            <dd className={styles.costMeta}>
              Закрыто {formatRub(costs.repairsClosedRub)}
              {costs.repairsOpenRub > 0 ? ` · В работе ${formatRub(costs.repairsOpenRub)}` : null}
            </dd>
          </div>
          <div className={styles.costCard}>
            <span className={`${styles.costCardIcon} ${styles.costCardIconWrench}`} aria-hidden>
              <StatusIcon kind="wrench" />
            </span>
            <dt className={styles.costLabel}>ТО (с начала года)</dt>
            <dd className={styles.costValue}>{formatRub(costs.maintenanceYtdRub)}</dd>
            <dd className={styles.costMeta}>
              Последнее ТО: {formatRubOrDash(vehicle.maintenance.lastServiceCostRub)}
            </dd>
          </div>
          <div className={styles.costCard}>
            <span className={`${styles.costCardIcon} ${styles.costCardIconShield}`} aria-hidden>
              <StatusIcon kind="shield" />
            </span>
            <dt className={styles.costLabel}>Страховка (год)</dt>
            <dd className={styles.costValue}>
              {vehicle.insurance.notRequired ? '—' : formatRub(costs.insuranceAnnualRub)}
            </dd>
            <dd className={styles.costMeta}>
              {vehicle.insurance.notRequired
                ? 'ОСАГО не требуется'
                : `Полис до ${formatDate(vehicle.insurance.validUntilIso)}`}
            </dd>
          </div>
          <div className={`${styles.costCard} ${styles.costCardTotal}`}>
            <span className={styles.costCardGlow} aria-hidden />
            <dt className={styles.costLabel}>Итого расходов</dt>
            <dd className={styles.costValue}>{formatRub(costs.totalRub)}</dd>
            <dd className={styles.costMeta}>Ремонты + ТО + страховка</dd>
          </div>
        </dl>
      </section>

      <div className={styles.grid2}>
        {/* ============================================================
            Страховка
            ============================================================ */}
        <div
          className={`${styles.panel} ${
            insuranceNotRequired ? styles.panelMuted : insurancePanelClass(insU)
          }`}
        >
          <h2 className={styles.panelTitle}>Страховка</h2>
          {insuranceNotRequired && !isEditing ? (
            <div className={styles.insuranceExempt}>
              <span className={styles.insuranceExemptBadge}>Не требуется</span>
              <p className={styles.insuranceExemptLead}>
                Полуприцеп освобождён от страхования ОСАГО (ст. 4 п. 3 ФЗ № 40).
              </p>
              <p className={styles.insuranceExemptMeta}>
                Ответственность застрахована в полисе тягача.
              </p>
            </div>
          ) : !isEditing ? (
            <>
              <div className={styles.insuranceHero}>
                <div className={styles.insuranceHeroText}>
                  <p className={styles.insuranceDate}>
                    до {formatDate(vehicle.insurance.validUntilIso)}
                  </p>
                  <p className={styles.insuranceCountdown}>
                    {insDays < 0
                      ? `Просрочено на ${Math.abs(insDays)} дн.`
                      : `Осталось ${insDays} дн.`}
                  </p>
                </div>
                <span className={badgeClass(insU)}>{insuranceBadgeText(insU)}</span>
              </div>
              <div
                className={styles.insuranceGauge}
                role="img"
                aria-label={`Осталось ${Math.max(insDays, 0)} из 365 дней полиса`}
              >
                <span
                  className={styles.insuranceGaugeFill}
                  style={{ width: `${insurancePct}%` }}
                />
              </div>
              <dl className={styles.insuranceFacts}>
                {vehicle.insurance.policyNumber ? (
                  <div className={styles.insuranceFact}>
                    <dt>Номер полиса</dt>
                    <dd>{vehicle.insurance.policyNumber}</dd>
                  </div>
                ) : null}
                {vehicle.insurance.insurer ? (
                  <div className={styles.insuranceFact}>
                    <dt>Страховщик</dt>
                    <dd>{vehicle.insurance.insurer}</dd>
                  </div>
                ) : null}
                {vehicle.insurance.annualPremiumRub != null ? (
                  <div className={`${styles.insuranceFact} ${styles.insuranceFactAccent}`}>
                    <dt>Стоимость</dt>
                    <dd>
                      {formatRub(vehicle.insurance.annualPremiumRub)}
                      <span className={styles.insuranceFactUnit}> / год</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <div className={styles.editStack}>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Статус ОСАГО</span>
                <Segmented<'required' | 'notRequired'>
                  value={insuranceNotRequired ? 'notRequired' : 'required'}
                  onChange={(v) =>
                    patchInsurance({ notRequired: v === 'notRequired' ? true : undefined })
                  }
                  options={[
                    { value: 'required', label: 'Полис' },
                    { value: 'notRequired', label: 'Не требуется' },
                  ]}
                  aria-label="Требуется ли ОСАГО"
                />
              </label>
              {!insuranceNotRequired ? (
                <div className={styles.editGrid}>
                  <label className={styles.editField}>
                    <span className={styles.editLabel}>Действует до</span>
                    <DateInput
                      value={vehicle.insurance.validUntilIso}
                      onChange={(v) =>
                        patchInsurance({
                          validUntilIso: v ?? new Date().toISOString().slice(0, 10),
                        })
                      }
                      aria-label="Дата окончания полиса"
                    />
                  </label>
                  <label className={styles.editField}>
                    <span className={styles.editLabel}>Стоимость (год)</span>
                    <MoneyInput
                      value={vehicle.insurance.annualPremiumRub ?? null}
                      onChange={(v) => patchInsurance({ annualPremiumRub: v })}
                      size="lg"
                      aria-label="Годовая страховая премия"
                    />
                  </label>
                  <label className={styles.editField}>
                    <span className={styles.editLabel}>Номер полиса</span>
                    <TextInput
                      value={vehicle.insurance.policyNumber ?? ''}
                      onChange={(v) => patchInsurance({ policyNumber: v || undefined })}
                      placeholder="ККК 0000 000000"
                      aria-label="Номер полиса"
                    />
                  </label>
                  <label className={styles.editField}>
                    <span className={styles.editLabel}>Страховщик</span>
                    <TextInput
                      value={vehicle.insurance.insurer ?? ''}
                      onChange={(v) => patchInsurance({ insurer: v || undefined })}
                      placeholder="Например: РЕСО"
                      aria-label="Страховщик"
                    />
                  </label>
                </div>
              ) : (
                <p className={styles.editHint}>
                  ОСАГО на полуприцеп не оформляется — гражданская ответственность
                  страхуется в полисе буксирующего тягача.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ============================================================
            Техническое обслуживание
            ============================================================ */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Техническое обслуживание</h2>
          {!isEditing ? (
            <table className={styles.table}>
              <tbody>
                <tr>
                  <th scope="row">Последнее ТО</th>
                  <td>
                    {vehicle.maintenance.lastServiceDateIso
                      ? formatDate(vehicle.maintenance.lastServiceDateIso)
                      : '—'}
                    {vehicle.maintenance.lastServiceMileageKm != null
                      ? ` · ${vehicle.maintenance.lastServiceMileageKm.toLocaleString('ru-RU')} км`
                      : null}
                  </td>
                </tr>
                {vehicle.maintenance.lastServiceCostRub != null ? (
                  <tr>
                    <th scope="row">Стоимость</th>
                    <td>{formatRub(vehicle.maintenance.lastServiceCostRub)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th scope="row">Следующее ТО</th>
                  <td>
                    {vehicle.maintenance.nextDueDateIso
                      ? formatDate(vehicle.maintenance.nextDueDateIso)
                      : '—'}
                    {vehicle.maintenance.nextDueMileageKm != null
                      ? ` · план ${vehicle.maintenance.nextDueMileageKm.toLocaleString('ru-RU')} км`
                      : null}
                  </td>
                </tr>
                {vehicle.maintenance.ytdServiceCostRub != null ? (
                  <tr>
                    <th scope="row">Итог по ТО за год</th>
                    <td>{formatRub(vehicle.maintenance.ytdServiceCostRub)}</td>
                  </tr>
                ) : null}
                {vehicle.maintenance.notes ? (
                  <tr>
                    <th scope="row">Примечание</th>
                    <td>{vehicle.maintenance.notes}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <div className={styles.editGrid}>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Дата последнего ТО</span>
                <DateInput
                  value={vehicle.maintenance.lastServiceDateIso}
                  onChange={(v) => patchMaintenance({ lastServiceDateIso: v })}
                  aria-label="Дата последнего ТО"
                />
              </label>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Пробег на ТО</span>
                <NumberInput
                  value={vehicle.maintenance.lastServiceMileageKm ?? null}
                  onChange={(v) => patchMaintenance({ lastServiceMileageKm: v })}
                  suffix="км"
                  placeholder="—"
                  aria-label="Пробег на последнем ТО"
                />
              </label>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Стоимость последнего ТО</span>
                <MoneyInput
                  value={vehicle.maintenance.lastServiceCostRub ?? null}
                  onChange={(v) => patchMaintenance({ lastServiceCostRub: v })}
                  size="lg"
                  aria-label="Стоимость последнего ТО"
                />
              </label>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Расходы по ТО за год</span>
                <MoneyInput
                  value={vehicle.maintenance.ytdServiceCostRub ?? null}
                  onChange={(v) => patchMaintenance({ ytdServiceCostRub: v })}
                  size="lg"
                  aria-label="Расходы на ТО с начала года"
                />
              </label>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Следующее ТО (дата)</span>
                <DateInput
                  value={vehicle.maintenance.nextDueDateIso}
                  onChange={(v) => patchMaintenance({ nextDueDateIso: v })}
                  aria-label="Дата следующего ТО"
                />
              </label>
              <label className={styles.editField}>
                <span className={styles.editLabel}>Следующее ТО (пробег)</span>
                <NumberInput
                  value={vehicle.maintenance.nextDueMileageKm ?? null}
                  onChange={(v) => patchMaintenance({ nextDueMileageKm: v })}
                  suffix="км"
                  placeholder="—"
                  aria-label="Пробег следующего ТО"
                />
              </label>
              <label className={`${styles.editField} ${styles.editFieldWide}`}>
                <span className={styles.editLabel}>Примечание</span>
                <TextareaInput
                  value={vehicle.maintenance.notes ?? ''}
                  onChange={(v) => patchMaintenance({ notes: v || undefined })}
                  placeholder="Например: ТО прошло на сервисе Газпром, гарантия 6 мес."
                  aria-label="Примечание по ТО"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <section className={`${styles.panel} ${styles.passSection}`} aria-labelledby="passes-heading">
        <header className={styles.passHead}>
          <h2 id="passes-heading" className={styles.panelTitle}>
            Пропуска
          </h2>
          {vehicle.passes.length > 0 ? (
            <p className={styles.passHeadMeta}>{vehicle.passes.length} шт.</p>
          ) : null}
        </header>
        {isEditing ? (
          <PassesEditor passes={vehicle.passes} onChange={setPasses} />
        ) : vehicle.passes.length === 0 ? (
          <p className={styles.passEmpty}>
            Пропуска не заведены — нажмите «Редактировать», чтобы добавить.
          </p>
        ) : (
          <ul className={styles.passList}>
            {vehicle.passes.map((p) => {
              const view = describePass(p)
              return (
                <li key={p.id} className={passCardClass(view.status)}>
                  <span className={styles.passStatusDot} aria-hidden />
                  <span className={styles.passBody}>
                    <span className={styles.passName}>{p.name}</span>
                    <span className={styles.passTitle}>{view.title}</span>
                    {view.meta || p.notes ? (
                      <span className={styles.passMeta}>
                        {view.meta ? <span>{view.meta}</span> : null}
                        {p.notes ? <span className={styles.passNotes}>{p.notes}</span> : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ============================================================
          Ремонты и неисправности
          ============================================================ */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Ремонты и неисправности</h2>
        {!isEditing ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Запись</th>
                <th>Узлы</th>
                <th>Статус</th>
                <th className={styles.colMoney}>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.repairs.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyRow}>
                    Журнал пуст — добавьте запись в режиме редактирования.
                  </td>
                </tr>
              ) : (
                vehicle.repairs.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.dateIso)}</td>
                    <td>
                      <strong className={styles.repairTitle}>{r.title || '—'}</strong>
                      {r.details ? <div className={styles.repairDetails}>{r.details}</div> : null}
                    </td>
                    <td>
                      {r.affectedParts.length > 0 ? (
                        <span className={styles.parts}>
                          {r.affectedParts.map((id) => (
                            <span key={id} className={styles.partChip}>
                              {FLEET_PART_LABEL_RU[id]}
                            </span>
                          ))}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.open ? <span className={styles.openBadge}>Активно</span> : 'Закрыто'}
                    </td>
                    <td className={styles.colMoney}>
                      {r.costRub != null ? (
                        <span className={r.open ? styles.moneyOpen : styles.money}>
                          {formatRub(r.costRub)}
                          {r.open ? <span className={styles.moneyNote}> · в работе</span> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className={styles.totalRow}>
                <th scope="row" colSpan={4} className={styles.totalLabel}>
                  Итого по ремонтам
                </th>
                <td className={styles.colMoney}>
                  <strong className={styles.totalValue}>{formatRub(costs.repairsTotalRub)}</strong>
                  {costs.repairsOpenRub > 0 ? (
                    <span className={styles.totalMeta}>
                      в т.ч. в работе: {formatRub(costs.repairsOpenRub)}
                    </span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <RepairsEditor repairs={vehicle.repairs} onChange={setRepairs} />
        )}
      </div>
    </div>
  )
}
