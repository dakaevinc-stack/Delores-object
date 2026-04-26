import styles from './ObjectSearch.module.css'

type Props = {
  value: string
  onChange: (value: string) => void
}

export function ObjectSearch({ value, onChange }: Props) {
  return (
    <label className={styles.wrap}>
      <span className={styles.visuallyHidden}>Поиск по объектам</span>
      <input
        className={styles.input}
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Поиск по объектам…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
