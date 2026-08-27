import type { CSSProperties } from 'react'
import styles from './CollapseToggle.module.css'

export type CollapseToggleVariant = 'capsule' | 'icon'

type Props = {
  expanded: boolean
  onToggle: () => void
  /**
   * `capsule` — премиум-капсула с уппер-кейс лейблом, для шапки секций
   *   («Открыть N разделов / Свернуть план», правый верх `titleRow`).
   * `icon`    — компактная круглая 32 px кнопка-шеврон, для шапок
   *   карточек, где места на лейбл нет (FieldReportCard).
   */
  variant?: CollapseToggleVariant
  /** Текст лейбла для capsule, когда блок уже раскрыт. */
  expandedLabel?: string
  /** Текст лейбла для capsule, когда блок свёрнут. */
  collapsedLabel?: string
  /** id управляемой области (для a11y). */
  ariaControls?: string
  className?: string
  style?: CSSProperties
}

/**
 * Единая кнопка раскрытия/сворачивания крупного блока. Дизайн один и
 * тот же по всему приложению: navy gradient в покое, красный hover,
 * шеврон поворачивается на 180° при `expanded`. Кнопка одинаково
 * читается и кликается на тач-устройствах (≥32 px) и в десктопе.
 *
 * Клики останавливают propagation, чтобы кнопка корректно работала
 * внутри уже-кликабельных контейнеров (например, свёрнутая карточка
 * отчёта в `FieldReportCard`).
 */
export function CollapseToggle({
  expanded,
  onToggle,
  variant = 'capsule',
  expandedLabel,
  collapsedLabel,
  ariaControls,
  className,
  style,
}: Props) {
  const fallbackExpanded = 'Свернуть'
  const fallbackCollapsed = 'Открыть'
  const label = expanded
    ? expandedLabel ?? fallbackExpanded
    : collapsedLabel ?? fallbackCollapsed

  const baseClass = variant === 'icon' ? styles.iconBtn : styles.capsule
  const cls = [baseClass, expanded ? styles.open : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-controls={ariaControls}
      aria-label={variant === 'icon' ? label : undefined}
      title={label}
      style={style}
    >
      {variant === 'capsule' ? (
        <span className={styles.label}>{label}</span>
      ) : null}
      <ChevronDownIcon />
    </button>
  )
}

function ChevronDownIcon() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
