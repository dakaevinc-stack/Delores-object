import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import styles from './InlineInputs.module.css'

/**
 * Набор премиальных inline-инпутов для редактирования карточки единицы парка.
 *
 * Принципы:
 *   — форма сохраняется по `blur` / `change`, без «сохранить», чтобы управлять
 *     через `localStorage`-хранилище с минимумом ритуалов;
 *   — визуально инпут почти не отличается от текста: тонкая подложка, граница
 *     проявляется только на hover/focus — остаётся ощущение «оживающего» текста;
 *   — числа принимают как русский, так и обычный ввод (пробелы-разделители,
 *     запятая как «копейка», буквы игнорируются).
 */

type CommonProps = {
  placeholder?: string
  className?: string
  'aria-label'?: string
  /** Подсказка мобильной клавиатуре: tel / email / url и т.д. */
  inputMode?: 'text' | 'tel' | 'email' | 'url' | 'numeric' | 'decimal'
}

/* ============================================================
   ДЕНЬГИ
   ============================================================ */

function parseMoney(raw: string): number | undefined {
  if (!raw) return undefined
  const clean = raw.replace(/[^\d.,-]/g, '').replace(/\s+/g, '').replace(',', '.')
  if (clean === '' || clean === '-' || clean === '.') return undefined
  const num = Number(clean)
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : undefined
}

function formatMoneyInput(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return ''
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

type MoneyInputProps = CommonProps & {
  value: number | undefined | null
  onChange: (v: number | undefined) => void
  size?: 'sm' | 'md' | 'lg'
}

export function MoneyInput({ value, onChange, placeholder = '0', size = 'md', className, ...rest }: MoneyInputProps) {
  const [draft, setDraft] = useState<string>(formatMoneyInput(value))

  /* Синхронизация когда значение меняется извне (reset, другой блок). */
  useEffect(() => {
    setDraft(formatMoneyInput(value))
  }, [value])

  const commit = (raw: string) => {
    const parsed = parseMoney(raw)
    if (parsed !== value) onChange(parsed)
    setDraft(formatMoneyInput(parsed))
  }

  return (
    <span className={`${styles.money} ${styles[`size-${size}`]} ${className ?? ''}`}>
      <input
        className={styles.moneyInput}
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label={rest['aria-label']}
      />
      <span className={styles.moneySuffix} aria-hidden>
        ₽
      </span>
    </span>
  )
}

/* ============================================================
   ДАТА
   ============================================================ */

type DateInputProps = CommonProps & {
  value: string | undefined | null
  onChange: (v: string | undefined) => void
}

export function DateInput({ value, onChange, className, ...rest }: DateInputProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v === '' ? undefined : v)
  }
  return (
    <input
      type="date"
      className={`${styles.date} ${className ?? ''}`}
      value={value ?? ''}
      onChange={handle}
      aria-label={rest['aria-label']}
    />
  )
}

/* ============================================================
   ЦЕЛОЕ ЧИСЛО (например, пробег)
   ============================================================ */

type NumberInputProps = CommonProps & {
  value: number | undefined | null
  onChange: (v: number | undefined) => void
  suffix?: ReactNode
  step?: number
}

export function NumberInput({ value, onChange, placeholder, suffix, step = 1, className, ...rest }: NumberInputProps) {
  const [draft, setDraft] = useState(formatMoneyInput(value))
  useEffect(() => {
    setDraft(formatMoneyInput(value))
  }, [value])
  const commit = (raw: string) => {
    const parsed = parseMoney(raw)
    const next = parsed == null ? undefined : Math.round(parsed / step) * step
    if (next !== value) onChange(next)
    setDraft(formatMoneyInput(next))
  }
  return (
    <span className={`${styles.number} ${className ?? ''}`}>
      <input
        className={styles.numberInput}
        inputMode="numeric"
        value={draft}
        placeholder={placeholder ?? '0'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        aria-label={rest['aria-label']}
      />
      {suffix ? <span className={styles.numberSuffix}>{suffix}</span> : null}
    </span>
  )
}

/* ============================================================
   ТЕКСТ / ТЕКСТОВАЯ ОБЛАСТЬ
   ============================================================ */

type TextInputProps = CommonProps & {
  value: string | undefined | null
  onChange: (v: string) => void
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  inputMode,
  ...rest
}: TextInputProps) {
  return (
    <input
      type="text"
      className={`${styles.text} ${className ?? ''}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      inputMode={inputMode}
      aria-label={rest['aria-label']}
    />
  )
}

type TextareaInputProps = CommonProps & {
  value: string | undefined | null
  onChange: (v: string) => void
  rows?: number
}

export function TextareaInput({ value, onChange, placeholder, rows = 2, className, ...rest }: TextareaInputProps) {
  return (
    <textarea
      className={`${styles.textarea} ${className ?? ''}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      aria-label={rest['aria-label']}
    />
  )
}

/* ============================================================
   СЕГМЕНТНЫЙ ПЕРЕКЛЮЧАТЕЛЬ (статус ремонта)
   ============================================================ */

type SegmentedProps<T extends string> = {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; tone?: 'neutral' | 'warn' | 'ok' }[]
  'aria-label'?: string
}

export function Segmented<T extends string>({ value, onChange, options, ...rest }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={rest['aria-label']}>
      {options.map((o) => {
        const active = o.value === value
        const cls = [
          styles.segment,
          active ? styles.segmentActive : '',
          o.tone ? styles[`tone-${o.tone}`] : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cls}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
