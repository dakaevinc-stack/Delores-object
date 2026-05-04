import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { DailyTelegramWorkLine } from '../../domain/dailyTelegramReport'
import {
  BRIGADIER_PROBLEM_KINDS,
  MEASUREMENT_UNITS,
  type BrigadierAttachmentDraft,
  type BrigadierCriterionDraft,
  type BrigadierProblemDraft,
  type BrigadierProblemKindId,
  type BrigadierStoredReport,
  type BrigadierWorkEntry,
  type BrigadierWorkEntryDraft,
  type MeasurementUnitId,
  brigadierProblemKindLabel,
  unitLabel,
} from '../../domain/brigadierReport'
import {
  BRIGADIER_WORK_PRESETS,
  groupBrigadierPresets,
  type BrigadierWorkPreset,
} from '../../data/brigadierWorkPresets'
import {
  formatVolume,
  isItemDeferred,
  workItemPercent,
  type WorkPlan,
  type WorkPlanItem,
} from '../../domain/workPlan'
import styles from './BrigadierReportModal.module.css'

type Props = {
  onClose: () => void
  siteId: string
  siteName: string
  /**
   * Производственный план объекта. Если задан — в форме появится
   * блок «Привязка к плану»: бригадир сможет выбрать строки плана
   * (1.1, 2.3 …) и сразу указать выполненный объём; этот объём
   * прибавится к факту в общей секции «План работ» без участия офиса.
   */
  plan?: WorkPlan | null
  onSubmit: (report: BrigadierStoredReport) => void | Promise<void>
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toDateTimeLocalValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function parseDateTimeLocal(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

export function BrigadierReportModal({ onClose, siteId, siteName, plan, onSubmit }: Props) {
  const uid = useId()
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const [reportedAtLocal, setReportedAtLocal] = useState(() => toDateTimeLocalValue(new Date()))
  const [responsible, setResponsible] = useState('')
  const [criteria, setCriteria] = useState<BrigadierCriterionDraft[]>([])
  const [problems, setProblems] = useState<BrigadierProblemDraft[]>([])
  const [attachments, setAttachments] = useState<BrigadierAttachmentDraft[]>([])
  const [reportComment, setReportComment] = useState('')
  const [workEntries, setWorkEntries] = useState<BrigadierWorkEntryDraft[]>([])
  const [planPickerOpen, setPlanPickerOpen] = useState(false)
  const [planSearch, setPlanSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const attachmentsRef = useRef<BrigadierAttachmentDraft[]>([])

  const filteredPlanRows = useMemo(() => {
    if (!plan) return [] as ReadonlyArray<{
      sectionNumber: string
      sectionTitle: string
      item: WorkPlanItem
    }>
    const q = planSearch.trim().toLowerCase()
    const rows: { sectionNumber: string; sectionTitle: string; item: WorkPlanItem }[] = []
    for (const s of plan.sections) {
      for (const it of s.items) {
        if (q.length === 0) {
          rows.push({ sectionNumber: s.number, sectionTitle: s.title, item: it })
          continue
        }
        const haystack = `${it.number} ${it.title} ${s.number} ${s.title}`.toLowerCase()
        if (haystack.includes(q)) {
          rows.push({ sectionNumber: s.number, sectionTitle: s.title, item: it })
        }
      }
    }
    return rows
  }, [plan, planSearch])

  const planTotalItemsCount = useMemo(
    () => (plan ? plan.sections.reduce((acc, s) => acc + s.items.length, 0) : 0),
    [plan],
  )

  const revokeAttachmentUrls = useCallback((rows: BrigadierAttachmentDraft[]) => {
    for (const a of rows) {
      URL.revokeObjectURL(a.previewUrl)
    }
  }, [])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      revokeAttachmentUrls(attachmentsRef.current)
    }
  }, [revokeAttachmentUrls])

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

  const removeCriterion = (id: string) => {
    setCriteria((c) => c.filter((row) => row.id !== id))
  }

  const updateCriterion = (id: string, patch: Partial<BrigadierCriterionDraft>) => {
    setCriteria((c) => c.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const pushCriterion = (partial: Pick<BrigadierCriterionDraft, 'title' | 'unitId' | 'presetId'>) => {
    const row: BrigadierCriterionDraft = {
      id: newId(),
      quantity: '',
      title: partial.title,
      unitId: partial.unitId,
      presetId: partial.presetId,
    }
    setCriteria((c) => [...c, row])
  }

  const presetOrder = useMemo(
    () => new Map(BRIGADIER_WORK_PRESETS.map((p, i) => [p.id, i])),
    [],
  )

  const criteriaOrdered = useMemo(() => {
    const presetRows = criteria.filter((c) => c.presetId != null)
    const customRows = criteria.filter((c) => c.presetId == null)
    presetRows.sort(
      (a, b) =>
        (presetOrder.get(a.presetId!) ?? 0) - (presetOrder.get(b.presetId!) ?? 0),
    )
    return [...presetRows, ...customRows]
  }, [criteria, presetOrder])

  const togglePreset = (p: BrigadierWorkPreset, on: boolean) => {
    setCriteria((c) => {
      if (on) {
        if (c.some((row) => row.presetId === p.id)) return c
        const row: BrigadierCriterionDraft = {
          id: newId(),
          quantity: '',
          title: p.title,
          unitId: p.defaultUnit,
          presetId: p.id,
        }
        return [...c, row]
      }
      return c.filter((row) => row.presetId !== p.id)
    })
  }

  const addCustomWork = () => {
    pushCriterion({ title: '', unitId: 'm', presetId: null })
  }

  const togglePlanRow = (item: WorkPlanItem, on: boolean) => {
    setWorkEntries((prev) => {
      if (on) {
        if (prev.some((row) => row.planNumber === item.number)) return prev
        return [
          ...prev,
          {
            id: newId(),
            planNumber: item.number,
            planTitle: item.title,
            qty: '',
            unit: item.unit,
          },
        ]
      }
      return prev.filter((row) => row.planNumber !== item.number)
    })
  }

  const removeWorkEntry = (id: string) => {
    setWorkEntries((prev) => prev.filter((r) => r.id !== id))
  }

  const updateWorkEntry = (id: string, patch: Partial<BrigadierWorkEntryDraft>) => {
    setWorkEntries((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addProblem = () => {
    setProblems((prev) => [
      ...prev,
      { id: newId(), kindId: BRIGADIER_PROBLEM_KINDS[0].id, details: '' },
    ])
  }

  const removeProblem = (id: string) => {
    setProblems((prev) => prev.filter((p) => p.id !== id))
  }

  const updateProblem = (
    id: string,
    patch: Partial<Pick<BrigadierProblemDraft, 'kindId' | 'details'>>,
  ) => {
    setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addFiles = (files: FileList | null, kind: 'photo' | 'video') => {
    if (!files?.length) return
    const next: BrigadierAttachmentDraft[] = []
    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i)
      if (!file) continue
      const registeredAtIso = new Date().toISOString()
      const fileModifiedIso = new Date(file.lastModified).toISOString()
      const previewUrl = URL.createObjectURL(file)
      next.push({ id: newId(), kind, file, previewUrl, registeredAtIso, fileModifiedIso })
    }
    if (next.length) setAttachments((a) => [...a, ...next])
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const row = prev.find((a) => a.id === id)
      if (row) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const filled = criteria.filter((c) => c.title.trim() && String(c.quantity).trim())
    const commentTrim = reportComment.trim()
    const filledProblems = problems
      .map((p) => ({ kindId: p.kindId, details: p.details.trim() }))
      .filter((p) => p.details.length > 0)

    const filledWorkEntries: BrigadierWorkEntry[] = []
    for (const w of workEntries) {
      const num = (w.planNumber ?? '').trim()
      if (!num) continue
      const qtyStr = String(w.qty ?? '').replace(',', '.').trim()
      if (!qtyStr) continue
      const qty = Number(qtyStr)
      if (!Number.isFinite(qty) || qty <= 0) continue
      filledWorkEntries.push({
        id: w.id,
        planNumber: num,
        planTitle: w.planTitle,
        qty,
        unit: w.unit,
      })
    }

    const hasWork = filled.length > 0
    const hasComment = commentTrim.length > 0
    const hasProblems = filledProblems.length > 0
    const hasMedia = attachments.length > 0
    const hasPlanFact = filledWorkEntries.length > 0

    if (!hasWork && !hasComment && !hasProblems && !hasMedia && !hasPlanFact) {
      setError(
        'Добавьте работы с объёмами, привяжите факт к плану, комментарий, проблему или прикрепите фото или видео.',
      )
      return
    }

    const reportedAtIso = parseDateTimeLocal(reportedAtLocal)
    const lines: DailyTelegramWorkLine[] = []
    let index = 1

    if (hasWork) {
      for (const c of filled) {
        lines.push({
          index: index++,
          text: `${c.title.trim()} — ${String(c.quantity).trim()} ${unitLabel(c.unitId)}`,
        })
      }
    } else if (hasMedia || hasComment || hasProblems || hasPlanFact) {
      if (!hasPlanFact) {
        lines.push({
          index: index++,
          text: 'Объёмы работ в форме не заполнены — см. комментарий, проблемы и вложения.',
        })
      }
    }

    if (hasPlanFact) {
      for (const w of filledWorkEntries) {
        lines.push({
          index: index++,
          text: `План ${w.planNumber} «${w.planTitle}» — выполнено ${formatVolume(w.qty)} ${unitLabel(w.unit)}`,
        })
      }
    }

    for (const p of filledProblems) {
      lines.push({
        index: index++,
        text: `Проблема — ${brigadierProblemKindLabel(p.kindId)}: ${p.details}`,
      })
    }

    if (commentTrim) {
      lines.push({ index: index++, text: `Комментарий — ${commentTrim}` })
    }

    if (responsible.trim()) {
      lines.push({ index: index++, text: `Ответственный — ${responsible.trim()}` })
    }

    const mappedAttachments = attachments.map((a) => {
      const previewUrl = URL.createObjectURL(a.file)
      URL.revokeObjectURL(a.previewUrl)
      return {
        id: a.id,
        kind: a.kind,
        name: a.file.name,
        mime: a.file.type || (a.kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
        sizeBytes: a.file.size,
        previewUrl,
        registeredAtIso: a.registeredAtIso,
        fileModifiedIso: a.fileModifiedIso,
      }
    })

    const report: BrigadierStoredReport = {
      id: newId(),
      siteId,
      reportedAtIso,
      lines,
      problems: filledProblems,
      responsible: responsible.trim() || '—',
      comment: commentTrim,
      attachments: mappedAttachments,
      workEntries: filledWorkEntries.length > 0 ? filledWorkEntries : undefined,
    }

    try {
      await Promise.resolve(onSubmit(report))
    } catch {
      for (const a of mappedAttachments) {
        if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
      }
      setAttachments([])
      setProblems([])
      setError('Не удалось сохранить отчёт. Уменьшите видео или число фото и попробуйте снова.')
      return
    }

    setAttachments([])
    setProblems([])
    setReportComment('')
    onClose()
  }

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
            <p className={styles.kicker}>Объект</p>
            <h2 className={styles.title} id={`${uid}-title`}>
              Отчёт бригадира
            </h2>
            <p className={styles.sub}>{siteName}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.block}>
            <label className={styles.label} htmlFor={`${uid}-dt`}>
              Дата и время отчёта
            </label>
            <input
              id={`${uid}-dt`}
              className={styles.input}
              type="datetime-local"
              value={reportedAtLocal}
              onChange={(e) => setReportedAtLocal(e.target.value)}
              required
            />
          </div>

          <div className={styles.workBlock}>
            <p className={styles.workKicker}>Работы</p>
            <p className={styles.workIntro}>
              Отметьте, что делали сегодня, затем укажите объёмы в блоке ниже.
            </p>

            <div className={styles.iosCard}>
              {groupBrigadierPresets().map(({ group, items }) => {
                if (items.length === 0) return null
                const checkedInGroup = items.reduce(
                  (n, it) => (criteria.some((c) => c.presetId === it.id) ? n + 1 : n),
                  0,
                )
                return (
                  <div key={group.id} className={styles.catalogGroup}>
                    <div className={styles.catalogGroupHead}>
                      <span className={styles.catalogGroupTitle}>{group.title}</span>
                      {checkedInGroup > 0 ? (
                        <span className={styles.catalogGroupBadge}>{checkedInGroup}</span>
                      ) : null}
                    </div>
                    {items.map((p) => {
                      const checked = criteria.some((c) => c.presetId === p.id)
                      return (
                        <label key={p.id} className={styles.catalogRow}>
                          <input
                            type="checkbox"
                            className={styles.catalogCheck}
                            checked={checked}
                            onChange={(e) => togglePreset(p, e.target.checked)}
                          />
                          <span className={styles.catalogRowTitle}>{p.title}</span>
                        </label>
                      )
                    })}
                  </div>
                )
              })}
              <button type="button" className={styles.addOwnRow} onClick={addCustomWork}>
                <span className={styles.addOwnLabel}>Добавить работу</span>
                <span className={styles.addOwnHint}>название и единица вручную</span>
              </button>
            </div>

            <p className={styles.catalogHint}>Объёмы по отмеченным строкам</p>

            <div className={styles.iosCard}>
              {criteria.length === 0 ? (
                <p className={styles.pickedEmpty}>
                  Пока ничего не отмечено — выберите пункты в списке выше.
                </p>
              ) : (
                <ul className={styles.pickedList}>
                  {criteriaOrdered.map((c) => (
                    <li key={c.id} className={styles.pickedItem}>
                      {c.presetId ? (
                        <>
                          <div className={styles.pickedRow}>
                            <span className={styles.pickedName}>{c.title}</span>
                            <button
                              type="button"
                              className={styles.pickedRemove}
                              onClick={() => removeCriterion(c.id)}
                              aria-label="Снять отметку"
                            >
                              ×
                            </button>
                          </div>
                          <div className={styles.pickedControls}>
                            <input
                              className={styles.pickedQty}
                              inputMode="decimal"
                              placeholder="Объём"
                              value={c.quantity}
                              onChange={(e) => updateCriterion(c.id, { quantity: e.target.value })}
                              aria-label={`Объём: ${c.title}`}
                            />
                            <select
                              className={styles.pickedUnit}
                              value={c.unitId}
                              onChange={(e) =>
                                updateCriterion(c.id, {
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
                        </>
                      ) : (
                        <>
                          <div className={styles.pickedRow}>
                            <input
                              className={styles.customName}
                              placeholder="Что делали"
                              value={c.title}
                              onChange={(e) => updateCriterion(c.id, { title: e.target.value })}
                              aria-label="Название работы"
                            />
                            <button
                              type="button"
                              className={styles.pickedRemove}
                              onClick={() => removeCriterion(c.id)}
                              aria-label="Убрать строку"
                            >
                              ×
                            </button>
                          </div>
                          <div className={styles.pickedControls}>
                            <input
                              className={styles.pickedQty}
                              inputMode="decimal"
                              placeholder="Объём"
                              value={c.quantity}
                              onChange={(e) => updateCriterion(c.id, { quantity: e.target.value })}
                              aria-label="Объём"
                            />
                            <select
                              className={styles.pickedUnit}
                              value={c.unitId}
                              onChange={(e) =>
                                updateCriterion(c.id, {
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
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {plan && planTotalItemsCount > 0 ? (
            <div className={styles.planBlock}>
              <div className={styles.planHeadRow}>
                <p className={styles.planKicker}>План объекта · факт за смену</p>
                <span className={styles.planSummary}>
                  {workEntries.length > 0
                    ? `${workEntries.length} из ${planTotalItemsCount}`
                    : `${planTotalItemsCount} строк`}
                </span>
              </div>
              <p className={styles.planTitle}>Что сделано по плану</p>
              <p className={styles.planIntro}>
                Выберите строки плана и впишите выполненный сегодня объём — он сразу
                добавится к факту в секции «План работ».
              </p>

              {workEntries.length > 0 ? (
                <ul className={styles.planPickedList}>
                  {workEntries.map((entry) => {
                    const item = plan.sections
                      .flatMap((s) => s.items)
                      .find((it) => it.number === entry.planNumber)
                    return (
                      <li key={entry.id} className={styles.planPickedItem}>
                        <div className={styles.planPickedHead}>
                          <div className={styles.planPickedTitleWrap}>
                            <span className={styles.planPickedNumber}>
                              {entry.planNumber}
                            </span>
                            <span className={styles.planPickedTitle}>
                              {entry.planTitle}
                            </span>
                            {item ? (
                              <span className={styles.planPickedTotal}>
                                План: {formatVolume(item.total)} {unitLabel(item.unit)} ·
                                {' '}
                                факт уже {formatVolume(item.done)} ({Math.round(workItemPercent(item))}%)
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className={styles.pickedRemove}
                            onClick={() => removeWorkEntry(entry.id)}
                            aria-label="Убрать привязку к плану"
                          >
                            ×
                          </button>
                        </div>
                        <div className={styles.planPickedControls}>
                          <input
                            className={styles.planPickedQty}
                            inputMode="decimal"
                            placeholder="Сделано сегодня"
                            value={entry.qty}
                            onChange={(e) =>
                              updateWorkEntry(entry.id, { qty: e.target.value })
                            }
                            aria-label={`Объём по строке ${entry.planNumber}`}
                          />
                          <span className={styles.planPickedUnit}>
                            {unitLabel(entry.unit)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}

              <div className={styles.planActions}>
                <button
                  type="button"
                  className={`${styles.planAddBtn} ${planPickerOpen ? styles.planAddBtnActive : ''}`}
                  onClick={() => setPlanPickerOpen((v) => !v)}
                  aria-expanded={planPickerOpen}
                >
                  {planPickerOpen ? 'Скрыть список плана' : '+ Привязать строку плана'}
                </button>
              </div>

              {planPickerOpen ? (
                <div className={styles.planPicker}>
                  <input
                    className={styles.planSearchInput}
                    type="search"
                    placeholder="Поиск: 6.1, щебень, тротуар…"
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    aria-label="Поиск по плану"
                  />
                  <div className={styles.planRowsScroll}>
                    {filteredPlanRows.length === 0 ? (
                      <p className={styles.planRowsEmpty}>Ничего не найдено по запросу.</p>
                    ) : (
                      filteredPlanRows.map((row) => {
                        const checked = workEntries.some(
                          (w) => w.planNumber === row.item.number,
                        )
                        const deferred = isItemDeferred(row.item)
                        return (
                          <button
                            key={row.item.number}
                            type="button"
                            className={`${styles.planRow} ${checked ? styles.planRowChecked : ''}`}
                            onClick={() => togglePlanRow(row.item, !checked)}
                            aria-pressed={checked}
                          >
                            <input
                              type="checkbox"
                              className={styles.planRowCheck}
                              checked={checked}
                              readOnly
                              tabIndex={-1}
                              aria-hidden
                            />
                            <span className={styles.planRowBody}>
                              <span className={styles.planRowTopLine}>
                                <span className={styles.planRowNumber}>{row.item.number}</span>
                                <span className={styles.planRowTitle}>{row.item.title}</span>
                                {deferred ? (
                                  <span className={styles.planRowDeferred}>без срока</span>
                                ) : null}
                              </span>
                              {row.item.total > 0 ? (
                                <span className={styles.planRowMeta}>
                                  План: {formatVolume(row.item.total)} {unitLabel(row.item.unit)}
                                  {row.item.done > 0
                                    ? ` · факт ${formatVolume(row.item.done)} (${Math.round(workItemPercent(row.item))}%)`
                                    : ''}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>Проблемы для бригадира</span>
            </div>
            <p className={styles.hint}>
              Необязательно. Укажите тип и суть — пустые строки в отчёт не попадут.
            </p>
            {problems.length > 0 ? (
              <ul className={styles.problemFormList}>
                {problems.map((p) => (
                  <li key={p.id} className={styles.problemFormItem}>
                    <div className={styles.problemFormRow}>
                      <select
                        className={styles.problemKindSelect}
                        value={p.kindId}
                        onChange={(e) =>
                          updateProblem(p.id, {
                            kindId: e.target.value as BrigadierProblemKindId,
                          })
                        }
                        aria-label="Тип проблемы"
                      >
                        {BRIGADIER_PROBLEM_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.problemRemove}
                        onClick={() => removeProblem(p.id)}
                        aria-label="Убрать строку"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      className={styles.problemTextarea}
                      rows={2}
                      placeholder="Опишите проблему или замечание"
                      value={p.details}
                      onChange={(e) => updateProblem(p.id, { details: e.target.value })}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>Пока не добавлено — можно сообщить о сложностях кнопкой ниже.</p>
            )}
            <button type="button" className={styles.addProblemBtn} onClick={addProblem}>
              Добавить проблему
            </button>
          </div>

          <div className={styles.block}>
            <label className={styles.label} htmlFor={`${uid}-r`}>
              Ответственный
            </label>
            <input
              id={`${uid}-r`}
              className={styles.input}
              placeholder="ФИО"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            />
          </div>

          <div className={styles.block}>
            <label className={styles.label} htmlFor={`${uid}-comment`}>
              Комментарий к отчёту
            </label>
            <textarea
              id={`${uid}-comment`}
              className={styles.problemTextarea}
              rows={3}
              placeholder="Свой текст: что сделали, что мешает, кому передать…"
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
            />
          </div>

          <div className={styles.block}>
            <span className={styles.blockTitle}>Материалы съёмки</span>
            <div className={styles.mediaActions}>
              <div className={styles.fileSink} aria-hidden>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  multiple
                  tabIndex={-1}
                  className={styles.hiddenFile}
                  onChange={(e) => {
                    addFiles(e.target.files, 'photo')
                    e.target.value = ''
                  }}
                />
                <input
                  ref={videoRef}
                  type="file"
                  accept="video/*"
                  multiple
                  tabIndex={-1}
                  className={styles.hiddenFile}
                  onChange={(e) => {
                    addFiles(e.target.files, 'video')
                    e.target.value = ''
                  }}
                />
              </div>
              <button
                type="button"
                className={styles.mediaBtn}
                onClick={() => photoRef.current?.click()}
              >
                Фото
              </button>
              <button
                type="button"
                className={styles.mediaBtn}
                onClick={() => videoRef.current?.click()}
              >
                Видео
              </button>
            </div>
            {attachments.length > 0 ? (
              <ul className={styles.attachList}>
                {attachments.map((a) => (
                  <li key={a.id} className={styles.attachRow}>
                    <span className={styles.attachKind}>{a.kind === 'photo' ? 'Фото' : 'Видео'}</span>
                    <span className={styles.attachName}>{a.file.name}</span>
                    <span className={styles.attachMeta}>
                      {new Date(a.registeredAtIso).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      className={styles.attachRemove}
                      onClick={() => removeAttachment(a.id)}
                      aria-label="Убрать файл"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>Файлы не выбраны — можно добавить фото или короткое видео.</p>
            )}
            {attachments.length > 0 ? (
              <p className={styles.hint}>
                Видео до ~5 МБ сохраняется в этом браузере; крупнее — отправьте в общий чат.
              </p>
            ) : null}
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.primary}>
              Сохранить отчёт
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
