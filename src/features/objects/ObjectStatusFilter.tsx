import type { SiteStatus } from '../../types/constructionSite'
import styles from './ObjectStatusFilter.module.css'

export type StatusFilterValue = 'all' | SiteStatus

type Props = {
  value: StatusFilterValue
  onChange: (value: StatusFilterValue) => void
}

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'normal', label: 'Нормально' },
  { value: 'attention', label: 'Внимание' },
  { value: 'critical', label: 'Критично' },
]

export function ObjectStatusFilter({ value, onChange }: Props) {
  return (
    <div
      className={styles.group}
      role="tablist"
      aria-label="Фильтр по статусу объектов"
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? styles.tabActive : styles.tab}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
