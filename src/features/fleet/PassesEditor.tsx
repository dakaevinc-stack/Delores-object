import { useMemo } from 'react'
import type { FleetPass } from '../../domain/fleet'
import { DateInput, Segmented, TextInput, TextareaInput } from './InlineInputs'
import styles from './PassesEditor.module.css'

/* ============================================================
   Быстрые пресеты пропусков.
   Чтобы менеджер одним кликом добавлял типовые — без ручного набора.
   ============================================================ */

const PASS_PRESETS: { id: string; name: string; required: boolean }[] = [
  { id: 'factory', name: 'Пропуск на территорию', required: true },
  { id: 'hazard', name: 'Допуск к опасным грузам', required: false },
  { id: 'ecology', name: 'Экологический сертификат', required: false },
  { id: 'tech-inspect', name: 'Техосмотр', required: true },
  { id: 'security', name: 'Охранная зона', required: false },
]

function freshId(): string {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `p-new-${now}-${rand}`
}

function createBlankPass(name = '', required = false): FleetPass {
  return {
    id: freshId(),
    name,
    required,
    validUntilIso: undefined,
    notes: undefined,
  }
}

type Props = {
  passes: FleetPass[]
  onChange: (updater: (prev: FleetPass[]) => FleetPass[]) => void
}

export function PassesEditor({ passes, onChange }: Props) {
  const usedPresetIds = useMemo(() => {
    const map = new Set<string>()
    for (const p of passes) {
      const preset = PASS_PRESETS.find((pp) => pp.name === p.name)
      if (preset) map.add(preset.id)
    }
    return map
  }, [passes])

  const update = (id: string, patch: Partial<FleetPass>) => {
    onChange((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  const remove = (id: string) => {
    onChange((prev) => prev.filter((p) => p.id !== id))
  }
  const addBlank = () => {
    onChange((prev) => [createBlankPass(), ...prev])
  }
  const addPreset = (presetId: string) => {
    const preset = PASS_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    onChange((prev) => [createBlankPass(preset.name, preset.required), ...prev])
  }

  const availablePresets = PASS_PRESETS.filter((p) => !usedPresetIds.has(p.id))

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <button type="button" className={styles.addBtn} onClick={addBlank}>
          <span className={styles.addIcon} aria-hidden>+</span>
          Добавить пропуск
        </button>
        {availablePresets.length > 0 ? (
          <div className={styles.presets} role="group" aria-label="Быстрые пропуска">
            <span className={styles.presetsLabel}>Быстрый выбор:</span>
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.presetBtn}
                onClick={() => addPreset(preset.id)}
                title={`Добавить: ${preset.name}`}
              >
                + {preset.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {passes.length === 0 ? (
        <p className={styles.empty}>
          Пропусков пока нет. Добавьте с нуля или выберите из типовых справа.
        </p>
      ) : (
        <ul className={styles.list}>
          {passes.map((p) => (
            <li key={p.id} className={styles.card}>
              <div className={styles.cardHead}>
                <label className={`${styles.cardField} ${styles.fieldName}`}>
                  <span className={styles.cardLabel}>Название</span>
                  <TextInput
                    value={p.name}
                    onChange={(v) => update(p.id, { name: v })}
                    placeholder="Например: пропуск на карьер"
                    aria-label="Название пропуска"
                  />
                </label>
                <div className={`${styles.cardField} ${styles.fieldRequired}`}>
                  <span className={styles.cardLabel}>Обязательный</span>
                  <Segmented<'yes' | 'no'>
                    value={p.required ? 'yes' : 'no'}
                    onChange={(v) => update(p.id, { required: v === 'yes' })}
                    options={[
                      { value: 'yes', label: 'Да', tone: 'warn' },
                      { value: 'no', label: 'Нет', tone: 'ok' },
                    ]}
                    aria-label="Признак обязательности"
                  />
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => remove(p.id)}
                  aria-label="Удалить пропуск"
                  title="Удалить пропуск"
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

              <label className={`${styles.cardField} ${styles.fieldValid}`}>
                <span className={styles.cardLabel}>Действует до</span>
                <DateInput
                  value={p.validUntilIso ?? null}
                  onChange={(v) => update(p.id, { validUntilIso: v })}
                  aria-label="Срок действия пропуска"
                />
                <span className={styles.cardHint}>
                  Оставьте пустым, если пропуск отсутствует.
                </span>
              </label>

              <label className={`${styles.cardField} ${styles.fieldNotes}`}>
                <span className={styles.cardLabel}>Комментарий</span>
                <TextareaInput
                  value={p.notes ?? ''}
                  onChange={(v) => update(p.id, { notes: v || undefined })}
                  placeholder="Куда выдан, номер, ответственный…"
                  aria-label="Примечание к пропуску"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
