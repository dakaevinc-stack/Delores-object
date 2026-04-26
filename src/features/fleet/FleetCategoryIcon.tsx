import type { ReactElement, SVGProps } from 'react'
import type { FleetCategoryId, FleetPresetCategoryId } from '../../domain/fleet'

/**
 * Набор фирменных моно-иконок под виды спецтехники.
 * Единая сетка 24×24, линия 1.6px, скруглённые соединения — чтобы блок
 * «Спецтехника» смотрелся как один цельный дизайн-язык.
 * Цвет берётся из `currentColor`, поэтому тон задаётся на родителе.
 */

type Props = SVGProps<SVGSVGElement> & {
  id: FleetCategoryId
  size?: number | string
  title?: string
}

export function FleetCategoryIcon({ id, size = 24, title, ...rest }: Props) {
  /* Для кастомных (пользовательских) классов техники id-шник — это slug,
     которого нет в ICONS. В этом случае показываем generic-иконку,
     чтобы визуальный язык сохранялся. */
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

/* ============================================================
   Единицы
   ============================================================ */

// Малотоннажные — компактный фургон с кабиной
function LightTrucksIcon() {
  return (
    <>
      <path d="M3 15V8h10v7" />
      <path d="M13 10h5l3 3v2" />
      <path d="M3 15h18" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </>
  )
}

// Автобусы — длинный кузов с окнами
function BusesIcon() {
  return (
    <>
      <rect x="3" y="6" width="18" height="11" rx="2" />
      <path d="M3 11h18" />
      <path d="M7 6v5M11 6v5M15 6v5M19 6v5" />
      <circle cx="7" cy="18.5" r="1.4" />
      <circle cx="17" cy="18.5" r="1.4" />
    </>
  )
}

// Автомобили специальные — цистерна с патрубком (гудронатор/ассенизатор)
function SpecialTrucksIcon() {
  return (
    <>
      <path d="M3 15V9h4v6" />
      <rect x="7" y="8" width="12" height="7" rx="3.5" />
      <path d="M3 15h18" />
      <path d="M19 10l2-1M19 12h2" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </>
  )
}

// Самосвалы — поднятый кузов
function DumpTrucksIcon() {
  return (
    <>
      <path d="M3 15V9h4v6" />
      <path d="M8 14l3-7h8l-3 8H8z" />
      <path d="M3 15h18" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </>
  )
}

// Седельные тягачи — высокая кабина с седлом
function RoadTractorsIcon() {
  return (
    <>
      <path d="M3 16V8h6v8" />
      <path d="M9 13h5l2 3v0" />
      <path d="M14 10h3" />
      <path d="M3 16h14" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="14" cy="18" r="1.6" />
    </>
  )
}

// Полуприцепы — кузов на осях без кабины
function TrailersIcon() {
  return (
    <>
      <rect x="3" y="7" width="18" height="8" rx="1.5" />
      <path d="M3 15h18" />
      <circle cx="8" cy="17" r="1.6" />
      <circle cx="12" cy="17" r="1.6" />
      <circle cx="16" cy="17" r="1.6" />
      <path d="M21 10h1.5" />
    </>
  )
}

// Фронтальные погрузчики — стрела с ковшом спереди
function FrontLoadersIcon() {
  return (
    <>
      <path d="M9 14V9h6l2 4v1" />
      <path d="M9 14h10" />
      <path d="M9 11l-4 2-2 3h4" />
      <path d="M3 16h1.5" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="16" cy="17.5" r="1.6" />
    </>
  )
}

// Минипогрузчики — компактный кузов с подъёмной стрелой
function MiniLoadersIcon() {
  return (
    <>
      <rect x="7" y="9" width="8" height="6" rx="1" />
      <path d="M15 12l4-2v3" />
      <path d="M7 12l-4-2v3" />
      <path d="M3 15h18" />
      <circle cx="8" cy="17" r="1.6" />
      <circle cx="16" cy="17" r="1.6" />
    </>
  )
}

// Экскаваторы-погрузчики — кабина со стрелой спереди и сзади
function BackhoesIcon() {
  return (
    <>
      <path d="M8 14V9h5v5" />
      <path d="M13 12l3-1v3" />
      <path d="M8 10L5 6l-2 1 3 5" />
      <path d="M5 14h-1" />
      <path d="M3 16h18" />
      <circle cx="10" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  )
}

// Экскаваторы — стрела + рукоять + ковш на гусеницах
function ExcavatorsIcon() {
  return (
    <>
      <path d="M3 18h18" />
      <rect x="3" y="15.5" width="12" height="2.5" rx="1" />
      <path d="M6 15.5v-3h5l1 2" />
      <path d="M12 13.5l3-5 3 1-3 5" />
      <path d="M15 14.5l2 1.5-1 2" />
    </>
  )
}

// Катки — два вальца
function RollersIcon() {
  return (
    <>
      <circle cx="7" cy="15" r="3.5" />
      <circle cx="17" cy="15" r="3.5" />
      <path d="M8.5 12h7" />
      <path d="M10 8v4M15 8v4" />
      <path d="M9.5 8h6" />
    </>
  )
}

// Асфальтоукладчики — бункер + платформа-вибробрус
function PaversIcon() {
  return (
    <>
      <path d="M3 14l2-4h7l3 4" />
      <path d="M15 14h6v3H3v-3" />
      <path d="M9 10V8" />
      <circle cx="8" cy="17.5" r="1.3" />
      <circle cx="17" cy="17.5" r="1.3" />
    </>
  )
}

// Фрезы — барабан с зубьями
function ColdMillsIcon() {
  return (
    <>
      <path d="M3 15V9h4v6" />
      <path d="M7 15l3-5h7v5" />
      <path d="M3 15h18" />
      <circle cx="14" cy="13" r="3" />
      <path d="M14 10v1M17 13h-1M14 16v-1M11 13h1" />
      <circle cx="6" cy="17" r="1.4" />
    </>
  )
}

function GenericIcon() {
  return (
    <>
      <rect x="3.5" y="8" width="17" height="8" rx="2" />
      <circle cx="8" cy="17" r="1.6" />
      <circle cx="16" cy="17" r="1.6" />
    </>
  )
}

const ICONS: Record<FleetPresetCategoryId, () => ReactElement> = {
  'light-trucks': LightTrucksIcon,
  buses: BusesIcon,
  'special-trucks': SpecialTrucksIcon,
  'dump-trucks': DumpTrucksIcon,
  'road-tractors': RoadTractorsIcon,
  trailers: TrailersIcon,
  'front-loaders': FrontLoadersIcon,
  'mini-loaders': MiniLoadersIcon,
  backhoes: BackhoesIcon,
  excavators: ExcavatorsIcon,
  rollers: RollersIcon,
  pavers: PaversIcon,
  'cold-mills': ColdMillsIcon,
}
