import { useMemo } from 'react'
import {
  FLEET_PART_LABEL_RU,
  type FleetRepairRecord,
  type FleetSchematicPartId,
  formatRub,
} from '../../domain/fleet'
import {
  DateInput,
  MoneyInput,
  NumberInput,
  Segmented,
  TextInput,
  TextareaInput,
} from './InlineInputs'
import styles from './RepairsEditor.module.css'

const PART_IDS: FleetSchematicPartId[] = [
  'engine',
  'transmission',
  'steering',
  'brakes',
  'suspension',
  'hydraulics',
  'bucket',
  'crane',
  'body',
  'undercarriage',
  'electronics',
]

function freshId(): string {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `r-new-${now}-${rand}`
}

function createBlankRepair(): FleetRepairRecord {
  return {
    id: freshId(),
    dateIso: new Date().toISOString().slice(0, 10),
    title: '',
    affectedParts: [],
    open: true,
    costRub: undefined,
  }
}

type Props = {
  repairs: FleetRepairRecord[]
  onChange: (updater: (prev: FleetRepairRecord[]) => FleetRepairRecord[]) => void
}

export function RepairsEditor({ repairs, onChange }: Props) {
  const total = useMemo(
    () => repairs.reduce((acc, r) => acc + (r.costRub ?? 0), 0),
    [repairs],
  )
  const openTotal = useMemo(
    () => repairs.filter((r) => r.open).reduce((acc, r) => acc + (r.costRub ?? 0), 0),
    [repairs],
  )

  const update = (id: string, patch: Partial<FleetRepairRecord>) => {
    onChange((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const remove = (id: string) => {
    onChange((prev) => prev.filter((r) => r.id !== id))
  }
  const add = () => {
    onChange((prev) => [createBlankRepair(), ...prev])
  }
  const togglePart = (id: string, part: FleetSchematicPartId) => {
    onChange((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const has = r.affectedParts.includes(part)
        return {
          ...r,
          affectedParts: has ? r.affectedParts.filter((p) => p !== part) : [...r.affectedParts, part],
        }
      }),
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <button type="button" className={styles.addBtn} onClick={add}>
          <span className={styles.addIcon} aria-hidden>+</span>
          Добавить запись о ремонте
        </button>
        <div className={styles.totals}>
          <span className={styles.totalsLabel}>Итого по ремонтам</span>
          <span className={styles.totalsValue}>{formatRub(total)}</span>
          {openTotal > 0 ? (
            <span className={styles.totalsOpen}>· в работе {formatRub(openTotal)}</span>
          ) : null}
        </div>
      </div>

      {repairs.length === 0 ? (
        <p className={styles.empty}>
          Журнал пуст. Нажмите «Добавить запись», чтобы зафиксировать ремонт.
        </p>
      ) : (
        <ul className={styles.list}>
          {repairs.map((r) => (
            <li key={r.id} className={styles.card}>
              <header className={styles.cardHead}>
                <div className={styles.cardHeadLeft}>
                  <label className={styles.cardField}>
                    <span className={styles.cardLabel}>Дата</span>
                    <DateInput
                      value={r.dateIso}
                      onChange={(v) => update(r.id, { dateIso: v ?? new Date().toISOString().slice(0, 10) })}
                      aria-label="Дата ремонта"
                    />
                  </label>
                  <label className={styles.cardField}>
                    <span className={styles.cardLabel}>Пробег, км</span>
                    <NumberInput
                      value={r.mileageKm ?? null}
                      onChange={(v) => update(r.id, { mileageKm: v })}
                      placeholder="—"
                      suffix="км"
                      aria-label="Пробег"
                    />
                  </label>
                </div>
                <div className={styles.cardHeadRight}>
                  <Segmented<'open' | 'closed'>
                    value={r.open ? 'open' : 'closed'}
                    onChange={(v) => update(r.id, { open: v === 'open' })}
                    options={[
                      { value: 'closed', label: 'Закрыто', tone: 'ok' },
                      { value: 'open', label: 'Активно', tone: 'warn' },
                    ]}
                    aria-label="Статус ремонта"
                  />
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => remove(r.id)}
                    aria-label="Удалить запись"
                    title="Удалить запись"
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                      <path
                        d="M4 6h12M8 3h4a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1zm-2 3v9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </header>

              <label className={`${styles.cardField} ${styles.fieldTitle}`}>
                <span className={styles.cardLabel}>Заголовок</span>
                <TextInput
                  value={r.title}
                  onChange={(v) => update(r.id, { title: v })}
                  placeholder="Например: замена КПП"
                  aria-label="Заголовок записи"
                />
              </label>

              <label className={`${styles.cardField} ${styles.fieldDetails}`}>
                <span className={styles.cardLabel}>Комментарий</span>
                <TextareaInput
                  value={r.details ?? ''}
                  onChange={(v) => update(r.id, { details: v || undefined })}
                  placeholder="Детали работ, поставщик, гарантия…"
                  aria-label="Детали ремонта"
                />
              </label>

              <div className={`${styles.cardField} ${styles.fieldParts}`}>
                <span className={styles.cardLabel}>Узлы</span>
                <div className={styles.parts}>
                  {PART_IDS.map((p) => {
                    const active = r.affectedParts.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`${styles.part} ${active ? styles.partActive : ''}`}
                        onClick={() => togglePart(r.id, p)}
                        aria-pressed={active}
                      >
                        {FLEET_PART_LABEL_RU[p]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={`${styles.cardField} ${styles.fieldCost}`}>
                <span className={styles.cardLabel}>Стоимость</span>
                <div className={styles.costBox}>
                  <span className={styles.costIcon} aria-hidden>
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                      <path
                        d="M7 4h4.5a3.5 3.5 0 0 1 0 7H7m0-7v12m0-5h6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <MoneyInput
                    value={r.costRub ?? null}
                    onChange={(v) => update(r.id, { costRub: v })}
                    size="lg"
                    aria-label="Стоимость ремонта"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
