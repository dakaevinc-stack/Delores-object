import { useEffect, useId, useMemo, useState } from 'react'
import {
  MEASUREMENT_UNITS,
  PROCUREMENT_MATERIAL_PRESETS,
  buildProcurementShortCode,
  findProcurementPreset,
  loadRememberedProcurementAuthors,
  parseDecimal,
  rememberProcurementAuthor,
  type MeasurementUnitId,
  type ProcurementLine,
  type ProcurementLineDraft,
  type ProcurementMaterialPresetId,
  type ProcurementRequest,
  type ProcurementRequestStatus,
} from '../../domain/procurementRequest'
import styles from './ProcurementRequestModal.module.css'

type Props = {
  onClose: () => void
  siteId: string
  siteName: string
  onSubmit: (req: ProcurementRequest) => void | Promise<void>
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseDateTimeLocalToIso(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function ProcurementRequestModal({ onClose, siteId, siteName, onSubmit }: Props) {
  const uid = useId()

  const [createdBy, setCreatedBy] = useState(() => {
    const list = loadRememberedProcurementAuthors()
    return list[0] ?? ''
  })
  const [knownAuthors, setKnownAuthors] = useState(() => loadRememberedProcurementAuthors())
  const [urgent, setUrgent] = useState(false)
  const [neededByLocal, setNeededByLocal] = useState('')
  const [otherFioMode, setOtherFioMode] = useState(false)
  const [items, setItems] = useState<ProcurementLineDraft[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const presetOrder = useMemo(
    () => new Map(PROCUREMENT_MATERIAL_PRESETS.map((p, i) => [p.id, i])),
    [],
  )

  const itemsOrdered = useMemo(() => {
    const presetRows = items.filter((c) => c.presetId != null)
    const customRows = items.filter((c) => c.presetId == null)
    presetRows.sort(
      (a, b) =>
        (presetOrder.get(a.presetId!) ?? 0) - (presetOrder.get(b.presetId!) ?? 0),
    )
    return [...presetRows, ...customRows]
  }, [items, presetOrder])

  const togglePreset = (presetId: ProcurementMaterialPresetId, on: boolean) => {
    setItems((rows) => {
      if (on) {
        if (rows.some((r) => r.presetId === presetId)) return rows
        const preset = findProcurementPreset(presetId)
        if (!preset) return rows
        const row: ProcurementLineDraft = {
          id: newId(),
          presetId: preset.id,
          title: preset.title,
          unitId: preset.defaultUnit,
          quantity: '',
        }
        return [...rows, row]
      }
      return rows.filter((r) => r.presetId !== presetId)
    })
  }

  const addCustom = () => {
    setItems((rows) => [
      ...rows,
      {
        id: newId(),
        presetId: null,
        title: '',
        unitId: 't',
        quantity: '',
      },
    ])
  }

  const updateRow = (id: string, patch: Partial<ProcurementLineDraft>) => {
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRow = (id: string) => {
    setItems((rows) => rows.filter((r) => r.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const fio = createdBy.trim()
    if (!fio) {
      setError('Укажите ФИО, кто создал заявку.')
      return
    }

    const filledLines: ProcurementLine[] = []
    for (const r of itemsOrdered) {
      const title = r.title.trim()
      const qty = parseDecimal(r.quantity)
      if (!title) continue
      if (!Number.isFinite(qty) || qty <= 0) continue
      filledLines.push({
        presetId: r.presetId,
        title,
        unitId: r.unitId,
        quantity: qty,
      })
    }

    if (filledLines.length === 0) {
      setError('Добавьте хотя бы один материал с указанным количеством.')
      return
    }

    const createdAtIso = new Date().toISOString()

    rememberProcurementAuthor(fio)
    setKnownAuthors(loadRememberedProcurementAuthors())

    const neededByIso = parseDateTimeLocalToIso(neededByLocal)

    const req: ProcurementRequest = {
      id: newId(),
      shortCode: buildProcurementShortCode(createdAtIso),
      siteId,
      siteName,
      createdAtIso,
      createdBy: fio,
      note: note.trim(),
      items: filledLines,
      status: 'pending' satisfies ProcurementRequestStatus,
      urgent,
      neededByIso,
    }

    try {
      await Promise.resolve(onSubmit(req))
    } catch {
      setError(
        'Не удалось сохранить заявку на сервер. Проверьте сеть, секрет записи (если задан) и повторите.',
      )
      return
    }
    onClose()
  }

  const quickSelectValue =
    knownAuthors.length === 0
      ? ''
      : (() => {
          const t = createdBy.trim()
          if (knownAuthors.includes(t)) return t
          if (otherFioMode || t.length > 0) return '__other__'
          return ''
        })()

  return (
    <div
      className={styles.scrim}
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
      >
        <header className={styles.dialogHead}>
          <div>
            <p className={styles.kicker}>Снабжение</p>
            <h2 className={styles.title} id={`${uid}-title`}>
              Заявка на материалы
            </h2>
            <p className={styles.sub}>{siteName}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.block}>
            <span className={styles.blockTitle}>Кто создал заявку</span>
            {knownAuthors.length > 0 ? (
              <>
                <label className={styles.label} htmlFor={`${uid}-quick`}>
                  Быстрый выбор
                </label>
                <select
                  id={`${uid}-quick`}
                  className={styles.select}
                  value={quickSelectValue}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__other__') {
                      setOtherFioMode(true)
                      setCreatedBy('')
                      return
                    }
                    if (v === '') {
                      setOtherFioMode(false)
                      setCreatedBy('')
                      return
                    }
                    setOtherFioMode(false)
                    setCreatedBy(v)
                  }}
                >
                  <option value="">— Снабженец —</option>
                  {knownAuthors.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__other__">Другое ФИО…</option>
                </select>
              </>
            ) : null}

            <label className={styles.label} htmlFor={`${uid}-fio`}>
              ФИО
            </label>
            <input
              id={`${uid}-fio`}
              className={styles.input}
              type="text"
              autoComplete="name"
              placeholder="Например: Петров Сергей Иванович"
              value={createdBy}
              onChange={(e) => {
                const v = e.target.value
                setCreatedBy(v)
                const t = v.trim()
                if (knownAuthors.includes(t)) setOtherFioMode(false)
                else if (t.length > 0) setOtherFioMode(true)
              }}
              list={knownAuthors.length ? `${uid}-fio-list` : undefined}
            />
            {knownAuthors.length > 0 ? (
              <datalist id={`${uid}-fio-list`}>
                {knownAuthors.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ) : null}
            <p className={styles.hint}>
              Запоминается на этом устройстве — в следующий раз можно выбрать себя из списка.
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Материалы</span>
            <p className={styles.workIntro}>
              Отметьте позиции из каталога и заполните объёмы и цены ниже. Можно добавить
              свой материал.
            </p>

            <div className={styles.iosCard}>
              {PROCUREMENT_MATERIAL_PRESETS.map((p) => {
                const checked = items.some((c) => c.presetId === p.id)
                return (
                  <label key={p.id} className={styles.catalogRow}>
                    <input
                      type="checkbox"
                      className={styles.catalogCheck}
                      checked={checked}
                      onChange={(e) => togglePreset(p.id, e.target.checked)}
                    />
                    <span className={styles.catalogRowTitle}>{p.title}</span>
                  </label>
                )
              })}
              <button type="button" className={styles.addOwnRow} onClick={addCustom}>
                <span className={styles.addOwnLabel}>Добавить материал</span>
                <span className={styles.addOwnHint}>название и единица вручную</span>
              </button>
            </div>

            <p className={styles.catalogHint}>Количество по выбранным позициям</p>

            <div className={styles.iosCard}>
              {items.length === 0 ? (
                <p className={styles.pickedEmpty}>
                  Пока ничего не отмечено — выберите материалы в списке выше.
                </p>
              ) : (
                <ul className={styles.pickedList}>
                  {itemsOrdered.map((c) => (
                    <li key={c.id} className={styles.pickedItem}>
                      <div className={styles.pickedRow}>
                        {c.presetId ? (
                          <span className={styles.pickedName}>{c.title}</span>
                        ) : (
                          <input
                            className={styles.customName}
                            placeholder="Название материала"
                            value={c.title}
                            onChange={(e) => updateRow(c.id, { title: e.target.value })}
                            aria-label="Название материала"
                          />
                        )}
                        <button
                          type="button"
                          className={styles.pickedRemove}
                          onClick={() => removeRow(c.id)}
                          aria-label="Убрать строку"
                        >
                          ×
                        </button>
                      </div>

                      <div className={styles.pickedControls}>
                        <input
                          className={styles.qtyInput}
                          inputMode="decimal"
                          placeholder="Кол-во"
                          value={c.quantity}
                          onChange={(e) => updateRow(c.id, { quantity: e.target.value })}
                          aria-label="Количество"
                        />
                        <select
                          className={styles.unitSelect}
                          value={c.unitId}
                          onChange={(e) =>
                            updateRow(c.id, {
                              unitId: e.target.value as MeasurementUnitId,
                            })
                          }
                          aria-label="Единица"
                        >
                          {MEASUREMENT_UNITS.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Срок поставки на объект</span>
            <label className={styles.label} htmlFor={`${uid}-need-by`}>
              Нужно к дате и времени (по желанию)
            </label>
            <input
              id={`${uid}-need-by`}
              className={styles.input}
              type="datetime-local"
              value={neededByLocal}
              onChange={(e) => setNeededByLocal(e.target.value)}
            />
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.catalogCheck}
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
              />
              <span>Срочная заявка</span>
            </label>
          </div>

          <div className={styles.block}>
            <label className={styles.label} htmlFor={`${uid}-note`}>
              Комментарий
            </label>
            <textarea
              id={`${uid}-note`}
              className={styles.textarea}
              rows={3}
              placeholder="Сроки, условия доставки, контакты — по желанию"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.primary}>
              Сохранить заявку
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
