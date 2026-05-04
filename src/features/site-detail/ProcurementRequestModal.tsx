import { useEffect, useId, useMemo, useState } from 'react'
import {
  MEASUREMENT_UNITS,
  PROCUREMENT_MATERIAL_PRESETS,
  buildProcurementShortCode,
  findProcurementPreset,
  groupProcurementPresets,
  loadRememberedProcurementAuthors,
  parseDecimal,
  rememberProcurementAuthor,
  searchProcurementPresets,
  type MeasurementUnitId,
  type ProcurementCategoryId,
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

/** Лёгкий иконочный набор для категорий. Без внешней библиотеки — чтобы
 *  модалка стартовала мгновенно и без сетевого запроса. */
function CategoryGlyph({ accent }: { accent: string }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (accent) {
    case 'sand':
      return (
        <svg {...props}>
          <path d="M3 18c2-3 5-3 7 0s5 3 7 0 3-3 4-3" />
          <circle cx="6" cy="9" r="0.8" fill="currentColor" />
          <circle cx="13" cy="6" r="0.8" fill="currentColor" />
          <circle cx="18" cy="9" r="0.8" fill="currentColor" />
        </svg>
      )
    case 'stone':
      return (
        <svg {...props}>
          <path d="M5 16l3-5 3 3 4-6 4 8" />
          <path d="M3 19h18" />
        </svg>
      )
    case 'concrete':
      return (
        <svg {...props}>
          <rect x="3.5" y="6" width="17" height="12" rx="1.2" />
          <path d="M3.5 11h17M9 6v12M15 6v12" />
        </svg>
      )
    case 'asphalt':
      return (
        <svg {...props}>
          <path d="M3 17l9-12 9 12" />
          <path d="M7 17h10" strokeDasharray="2 2" />
        </svg>
      )
    case 'pipe':
      return (
        <svg {...props}>
          <path d="M3 12h6l3 4h6" />
          <circle cx="9" cy="12" r="2.5" />
          <circle cx="18" cy="16" r="2.5" />
        </svg>
      )
    case 'truck':
      return (
        <svg {...props}>
          <path d="M3 7h11v9H3z" />
          <path d="M14 10h4l3 3v3h-7" />
          <circle cx="7" cy="17.5" r="1.5" />
          <circle cx="17" cy="17.5" r="1.5" />
        </svg>
      )
    case 'machinery':
      return (
        <svg {...props}>
          <path d="M3 17h11l3-4 3 1v3" />
          <path d="M7 13l3-7 4 1-1 6" />
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
        </svg>
      )
    case 'soil':
      return (
        <svg {...props}>
          <path d="M3 18h18" />
          <path d="M5 18l1-4M11 18l1-6M17 18l1-3" />
          <circle cx="12" cy="6" r="2" />
          <path d="M10 8l-2 4M14 8l2 4" />
        </svg>
      )
    case 'tool':
      return (
        <svg {...props}>
          <path d="M14 4l6 6-3 3-6-6 3-3z" />
          <path d="M11 7L3 15v6h6l8-8" />
        </svg>
      )
    case 'people':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="9.5" r="2.4" />
          <path d="M14.5 14.5c2-.5 5 .8 5 4" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      )
  }
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
  const [searchQuery, setSearchQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<ProcurementCategoryId>>(
    () => new Set(),
  )

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
    () => new Map(PROCUREMENT_MATERIAL_PRESETS.map((p, i) => [p.id, i] as const)),
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

  const trimmedQuery = searchQuery.trim()
  const filteredPresets = useMemo(
    () => searchProcurementPresets(trimmedQuery),
    [trimmedQuery],
  )
  const groups = useMemo(
    () => groupProcurementPresets(filteredPresets),
    [filteredPresets],
  )
  const isSearching = trimmedQuery.length > 0

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

  const toggleGroup = (id: ProcurementCategoryId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
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

  /** Сколько позиций из этой категории уже выбрано — для бейджа в шапке. */
  const selectedCountByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of items) {
      if (!row.presetId) continue
      const preset = findProcurementPreset(row.presetId)
      if (!preset) continue
      map.set(preset.categoryId, (map.get(preset.categoryId) ?? 0) + 1)
    }
    return map
  }, [items])

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
              Раскройте нужную группу, отметьте позиции и заполните количество ниже. Можно
              ввести свой материал, если ничего не подошло.
            </p>

            <div className={styles.searchWrap}>
              <svg
                className={styles.searchIcon}
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="10.5" cy="10.5" r="6" />
                <path d="M20 20l-4.5-4.5" />
              </svg>
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Поиск: песок, труба 110, щебень 5-20…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск по каталогу"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setSearchQuery('')}
                  aria-label="Очистить поиск"
                >
                  ×
                </button>
              ) : null}
            </div>

            <div className={styles.catalog}>
              {groups.length === 0 ? (
                <div className={styles.catalogEmpty}>
                  <p className={styles.catalogEmptyTitle}>Ничего не найдено</p>
                  <p className={styles.catalogEmptyText}>
                    Уточните запрос или добавьте материал вручную ниже.
                  </p>
                </div>
              ) : (
                groups.map(({ category, presets }) => {
                  const isOpen = isSearching || openGroups.has(category.id)
                  const selectedCount = selectedCountByCategory.get(category.id) ?? 0
                  return (
                    <section
                      key={category.id}
                      className={`${styles.group} ${isOpen ? styles.groupOpen : ''}`}
                    >
                      <button
                        type="button"
                        className={styles.groupHead}
                        onClick={() => {
                          if (!isSearching) toggleGroup(category.id)
                        }}
                        aria-expanded={isOpen}
                      >
                        <span className={styles.groupGlyph} aria-hidden>
                          <CategoryGlyph accent={category.accent} />
                        </span>
                        <span className={styles.groupTitleWrap}>
                          <span className={styles.groupTitle}>{category.title}</span>
                          <span className={styles.groupHint}>{category.hint}</span>
                        </span>
                        {selectedCount > 0 ? (
                          <span className={styles.groupBadge} aria-label={`выбрано ${selectedCount}`}>
                            {selectedCount}
                          </span>
                        ) : null}
                        {!isSearching ? (
                          <span className={styles.groupChevron} aria-hidden>
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                      {isOpen ? (
                        <ul className={styles.groupList}>
                          {presets.map((p) => {
                            const checked = items.some((c) => c.presetId === p.id)
                            return (
                              <li key={p.id}>
                                <label
                                  className={`${styles.catalogRow} ${
                                    checked ? styles.catalogRowChecked : ''
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className={styles.catalogCheck}
                                    checked={checked}
                                    onChange={(e) => togglePreset(p.id, e.target.checked)}
                                  />
                                  <span className={styles.catalogText}>
                                    <span className={styles.catalogRowTitle}>{p.title}</span>
                                    <span className={styles.catalogRowSubtitle}>
                                      {p.subtitle}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </section>
                  )
                })
              )}

              <button type="button" className={styles.addOwnRow} onClick={addCustom}>
                <span className={styles.addOwnGlyph} aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className={styles.addOwnLabel}>Добавить материал вручную</span>
                <span className={styles.addOwnHint}>если нужного нет в каталоге</span>
              </button>
            </div>

            <p className={styles.catalogHint}>
              {items.length === 0
                ? 'Количество появится здесь, как только отметите позиции.'
                : `Заполните количество по выбранным позициям (${items.length}).`}
            </p>

            <div className={styles.iosCard}>
              {items.length === 0 ? (
                <p className={styles.pickedEmpty}>
                  Пока ничего не отмечено — выберите материалы в каталоге выше.
                </p>
              ) : (
                <ul className={styles.pickedList}>
                  {itemsOrdered.map((c) => {
                    const preset = c.presetId ? findProcurementPreset(c.presetId) : null
                    return (
                      <li key={c.id} className={styles.pickedItem}>
                        <div className={styles.pickedRow}>
                          {c.presetId ? (
                            <span className={styles.pickedNameWrap}>
                              <span className={styles.pickedName}>{c.title}</span>
                              {preset?.subtitle ? (
                                <span className={styles.pickedSubtitle}>
                                  {preset.subtitle}
                                </span>
                              ) : null}
                            </span>
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
                    )
                  })}
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
