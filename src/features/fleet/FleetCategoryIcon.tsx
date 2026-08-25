import type { ReactElement, SVGProps } from 'react'
import type { FleetCategoryId, FleetPresetCategoryId } from '../../domain/fleet'

/**
 * Моно-иконки классов парка (24×24, stroke 1.6).
 * Каждая форма — узнаваемый боковой силуэт; ключ в ICONS = id категории.
 */

type Props = SVGProps<SVGSVGElement> & {
  id: FleetCategoryId
  size?: number | string
  title?: string
}

export function FleetCategoryIcon({ id, size = 24, title, ...rest }: Props) {
  const Icon = ICONS[id as FleetPresetCategoryId] ?? GenericIcon
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <Icon />
    </svg>
  )
}

/* Малотоннажные — фургон / LCV: кабина + кузов, два колеса */
function LightTrucksIcon() {
  return (
    <>
      <path d="M3 15V9h5v6" />
      <path d="M8 15V8h9v7" />
      <path d="M3 15h17" />
      <circle cx="6.5" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
    </>
  )
}

/* Автобусы — длинный кузов с окнами */
function BusesIcon() {
  return (
    <>
      <path d="M2.5 15V7.5a1.5 1.5 0 0 1 1.5-1.5h16a1.5 1.5 0 0 1 1.5 1.5V15" />
      <path d="M2.5 11h19" />
      <path d="M6.5 8v3M10.5 8v3M14.5 8v3M18.5 8v3" />
      <circle cx="7" cy="17" r="1.4" />
      <circle cx="17" cy="17" r="1.4" />
    </>
  )
}

/* Спецавто — бетономешалка на шасси (типичный «спец» в парке) */
function SpecialTrucksIcon() {
  return (
    <>
      <path d="M3 15V9h4.5v6" />
      <ellipse cx="14.5" cy="11.5" rx="4.2" ry="3.2" />
      <path d="M14.5 8.3v.4M17.5 11.5h.4M14.5 14.7v-.4M11.5 11.5h-.4" />
      <path d="M3 15h18" />
      <circle cx="6.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </>
  )
}

/* Самосвал — кабина + наклонённый кузов */
function DumpTrucksIcon() {
  return (
    <>
      <path d="M3 15V9h4.5v6" />
      <path d="M7.5 14.5l2.5-6.5h8l-2 6.5H7.5z" />
      <path d="M3 15h18" />
      <circle cx="6.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </>
  )
}

/* Седельный тягач — только кабина и седло, без прицепа */
function RoadTractorsIcon() {
  return (
    <>
      <path d="M3 15V8h6.5l1.5 2.5V15" />
      <path d="M11 12.5h3.5l1.5 2.5" />
      <path d="M14.5 15h1.5a1 1 0 0 0 1-1v-1.5" />
      <path d="M3 15h12.5" />
      <circle cx="6.5" cy="17" r="1.5" />
      <circle cx="13" cy="17" r="1.5" />
    </>
  )
}

/* Полуприцеп — платформа на осях, без кабины */
function TrailersIcon() {
  return (
    <>
      <path d="M2 13.5h1.5l1-2h14.5a1 1 0 0 1 1 1v3.5H2z" />
      <path d="M2 15h20" />
      <circle cx="8" cy="17" r="1.4" />
      <circle cx="13" cy="17" r="1.4" />
      <circle cx="18" cy="17" r="1.4" />
    </>
  )
}

/* Фронтальный погрузчик — крупный ковш спереди, 4 колеса */
function FrontLoadersIcon() {
  return (
    <>
      <path d="M4 16.5V11l3-4h5.5l1.5 3.5V16.5" />
      <path d="M2.5 13.5h3.5l1.5-3 2.5-.5" />
      <path d="M2 16.5h20" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="14" cy="18" r="1.5" />
    </>
  )
}

/* Минипогрузчик (bobcat) — компактный корпус, ковш между стрелами */
function MiniLoadersIcon() {
  return (
    <>
      <rect x="8.5" y="10.5" width="7" height="5" rx="1" />
      <path d="M5.5 14.5L3.5 12v3M18.5 14.5L20.5 12v3" />
      <path d="M6 14h2.5l1-2.5h2l1 2.5H18" />
      <path d="M4 16.5h16" />
      <circle cx="8.5" cy="18" r="1.3" />
      <circle cx="15.5" cy="18" r="1.3" />
    </>
  )
}

/* Экскаватор-погрузчик — ковш спереди + стрела сзади */
function BackhoesIcon() {
  return (
    <>
      <path d="M4 16V10h5v6" />
      <path d="M9 13.5h2.5l1 2.5" />
      <path d="M3.5 13l-1.5-3 2-1 2 3.5" />
      <path d="M11.5 12l4-4 2.5 1-3.5 4.5" />
      <path d="M14.5 14l1.5 2" />
      <path d="M3 16h18" />
      <circle cx="6.5" cy="17.5" r="1.4" />
      <circle cx="14" cy="17.5" r="1.4" />
    </>
  )
}

/* Экскаватор — гусеницы, стрела-рукоять-ковш */
function ExcavatorsIcon() {
  return (
    <>
      <path d="M2 18h20" />
      <path d="M4 18V16.5h11v1.5" />
      <path d="M7 16.5V13h4l1 2" />
      <path d="M12 14.5l3.5-5.5 2.5.8-3 5" />
      <path d="M15 15.5l2 1.5-1 2" />
    </>
  )
}

/* Каток — один большой валок спереди */
function RollersIcon() {
  return (
    <>
      <circle cx="8.5" cy="15" r="4" />
      <path d="M12.5 15h6.5l1 2.5H12.5z" />
      <path d="M4.5 15h8" />
      <circle cx="17.5" cy="17.5" r="1.3" />
    </>
  )
}

/* Асфальтоукладчик — бункер + широкая отвальная плита сзади */
function PaversIcon() {
  return (
    <>
      <path d="M3 15l2-5h6l2 2v3H3z" />
      <path d="M13 12h7l1.5 3H13z" />
      <path d="M3 15h18.5" />
      <circle cx="7" cy="17" r="1.3" />
      <circle cx="17" cy="17" r="1.3" />
    </>
  )
}

/* Дорожная фреза — кабина + барабан с зубьями под рамой */
function ColdMillsIcon() {
  return (
    <>
      <path d="M3 15V9h4v6" />
      <path d="M7 15V10h8v5" />
      <circle cx="13" cy="13.5" r="2.8" />
      <path d="M13 10.7v.3M15.8 13.5h-.3M13 16.3v-.3M10.2 13.5h.3" />
      <path d="M3 15h18" />
      <circle cx="6" cy="17" r="1.4" />
      <circle cx="16" cy="17" r="1.4" />
    </>
  )
}

function GenericIcon() {
  return (
    <>
      <path d="M3 15V9h5v6" />
      <path d="M8 15V8.5h10V15" />
      <path d="M3 15h18" />
      <circle cx="7" cy="17" r="1.5" />
      <circle cx="16" cy="17" r="1.5" />
    </>
  )
}

/** id категории → силуэт (сверять с FLEET_CATEGORIES в fleet.mock.ts) */
const ICONS: Record<FleetPresetCategoryId, () => ReactElement> = {
  'light-trucks': LightTrucksIcon, // Малотоннажные автомобили
  buses: BusesIcon, // Автобусы
  'special-trucks': SpecialTrucksIcon, // Автомобили специальные
  'dump-trucks': DumpTrucksIcon, // Самосвалы
  'road-tractors': RoadTractorsIcon, // Седельные тягачи
  trailers: TrailersIcon, // Полуприцепы (прицепы)
  'front-loaders': FrontLoadersIcon, // Фронтальные погрузчики
  'mini-loaders': MiniLoadersIcon, // Минипогрузчики
  backhoes: BackhoesIcon, // Экскаваторы-погрузчики
  excavators: ExcavatorsIcon, // Экскаваторы
  rollers: RollersIcon, // Катки
  pavers: PaversIcon, // Асфальтоукладчики
  'cold-mills': ColdMillsIcon, // Фрезы
}
