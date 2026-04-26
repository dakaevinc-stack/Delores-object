import { FLEET_PART_LABEL_RU, type FleetSchematicPartId, type FleetVehicle } from '../../domain/fleet'
import styles from './FleetVehicleSchematic.module.css'

type Props = {
  variant: FleetVehicle['schematicVariant']
  highlightedParts: readonly FleetSchematicPartId[]
  caption?: string
  /** Подпись, легенда узлов и строка «нет неисправностей» — по умолчанию скрыты. */
  showMeta?: boolean
}

/** Упрощённые силуэты: подсветка по `highlightedParts`. */
export function FleetVehicleSchematic({ variant, highlightedParts, caption, showMeta = false }: Props) {
  const hi = new Set(highlightedParts)
  const isHi = (id: FleetSchematicPartId) => hi.has(id)

  return (
    <figure className={styles.figure} aria-label="Схематичный вид техники">
      <div className={styles.canvas}>
        {variant === 'excavator' ? (
          <ExcavatorSvg isHi={isHi} />
        ) : variant === 'loader' ? (
          <LoaderSvg isHi={isHi} />
        ) : variant === 'roller' ? (
          <RollerSvg isHi={isHi} />
        ) : variant === 'paver' ? (
          <PaverSvg isHi={isHi} />
        ) : variant === 'articulated' ? (
          <BackhoeSvg isHi={isHi} />
        ) : (
          <TruckSvg isHi={isHi} />
        )}
      </div>
      {showMeta && caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
      {showMeta && highlightedParts.length > 0 ? (
        <ul className={styles.legend}>
          {highlightedParts.map((id) => (
            <li key={id} className={styles.legendItem}>
              <span className={styles.legendSwatch} aria-hidden />
              {FLEET_PART_LABEL_RU[id]}
            </li>
          ))}
        </ul>
      ) : null}
      {showMeta && highlightedParts.length === 0 ? (
        <p className={styles.hint}>Нет активных неисправностей для подсветки на схеме.</p>
      ) : null}
    </figure>
  )
}

function cn(base: string, on: boolean) {
  return `${base} ${on ? styles.partHot : ''}`
}

function TruckSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 160" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="118" width="420" height="8" rx="2" />
      <g className={styles.chassis}>
        <rect x="40" y="88" width="300" height="18" rx="3" />
        <circle cx="95" cy="118" r="22" />
        <circle cx="200" cy="118" r="22" />
        <circle cx="310" cy="118" r="22" />
      </g>
      <rect className={cn(styles.body, isHi('body'))} x="130" y="52" width="210" height="44" rx="4" />
      <rect
        className={cn(styles.cabin, isHi('electronics'))}
        x="48"
        y="48"
        width="78"
        height="50"
        rx="4"
      />
      <rect className={cn(styles.engine, isHi('engine'))} x="56" y="70" width="52" height="28" rx="3" />
      <path className={cn(styles.steering, isHi('steering'))} d="M 82 56 L 88 52 L 94 56 L 88 62 Z" />
      <rect className={cn(styles.transmission, isHi('transmission'))} x="118" y="92" width="40" height="14" rx="2" />
      <rect className={cn(styles.brakes, isHi('brakes'))} x="175" y="100" width="70" height="6" rx="2" />
    </svg>
  )
}

function LoaderSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 180" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="138" width="420" height="8" rx="2" />
      <rect className={styles.chassis} x="80" y="108" width="200" height="22" rx="4" />
      <circle cx="130" cy="138" r="24" />
      <circle cx="240" cy="138" r="24" />
      <rect className={cn(styles.cabin, isHi('electronics'))} x="100" y="70" width="70" height="48" rx="4" />
      <rect className={cn(styles.engine, isHi('engine'))} x="108" y="88" width="54" height="30" rx="3" />
      <path
        className={cn(styles.arm, isHi('hydraulics'))}
        d="M 170 78 L 260 40 L 268 48 L 180 88 Z"
      />
      <rect className={cn(styles.bucket, isHi('bucket'))} x="268" y="32" width="52" height="36" rx="4" />
    </svg>
  )
}

function ExcavatorSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 200" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="158" width="420" height="10" rx="2" />
      <ellipse className={cn(styles.undercarriage, isHi('undercarriage'))} cx="140" cy="150" rx="90" ry="22" />
      <rect className={cn(styles.turret, isHi('body'))} x="100" y="88" width="100" height="56" rx="6" />
      <rect className={cn(styles.cabin, isHi('electronics'))} x="108" y="96" width="44" height="40" rx="3" />
      <rect className={cn(styles.engine, isHi('engine'))} x="150" y="104" width="40" height="32" rx="3" />
      <path className={cn(styles.arm, isHi('hydraulics'))} d="M 200 96 L 300 48 L 308 58 L 208 104 Z" />
      <rect className={cn(styles.bucket, isHi('bucket'))} x="300" y="36" width="70" height="44" rx="5" />
    </svg>
  )
}

function RollerSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 140" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="108" width="420" height="8" rx="2" />
      <ellipse className={cn(styles.drum, isHi('body'))} cx="210" cy="92" rx="120" ry="28" />
      <rect className={cn(styles.cabin, isHi('electronics'))} x="150" y="48" width="120" height="44" rx="4" />
      <rect className={cn(styles.engine, isHi('engine'))} x="168" y="60" width="84" height="26" rx="3" />
    </svg>
  )
}

function PaverSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 150" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="118" width="420" height="8" rx="2" />
      <rect className={styles.chassis} x="40" y="88" width="340" height="20" rx="3" />
      <circle cx="90" cy="118" r="20" />
      <circle cx="340" cy="118" r="20" />
      <rect className={cn(styles.screed, isHi('body'))} x="60" y="56" width="300" height="32" rx="3" />
      <rect className={cn(styles.cabin, isHi('electronics'))} x="260" y="44" width="56" height="40" rx="3" />
      <rect className={cn(styles.engine, isHi('engine'))} x="268" y="54" width="40" height="24" rx="2" />
    </svg>
  )
}

function BackhoeSvg({ isHi }: { isHi: (id: FleetSchematicPartId) => boolean }) {
  return (
    <svg viewBox="0 0 420 190" className={styles.svg} role="img" aria-hidden>
      <rect className={styles.ground} x="0" y="148" width="420" height="8" rx="2" />
      <rect className={styles.chassis} x="60" y="118" width="220" height="20" rx="3" />
      <circle cx="110" cy="148" r="22" />
      <circle cx="220" cy="148" r="22" />
      <rect className={cn(styles.cabin, isHi('electronics'))} x="88" y="72" width="64" height="50" rx="4" />
      <rect className={cn(styles.engine, isHi('engine'))} x="96" y="90" width="48" height="32" rx="3" />
      <path className={cn(styles.arm, isHi('hydraulics'))} d="M 152 80 L 260 36 L 268 46 L 160 92 Z" />
      <rect className={cn(styles.bucket, isHi('bucket'))} x="268" y="24" width="56" height="40" rx="4" />
      <path className={cn(styles.crane, isHi('crane'))} d="M 200 118 L 200 52 L 208 52 L 208 118 Z" />
    </svg>
  )
}
