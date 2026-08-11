import { useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptedQtyForPlanItem,
  addDays,
  approveStage,
  assignmentProgress,
  canSubmitStage,
  formatDayHeadingRu,
  formatProgressLine,
  formatQtyRu,
  formatShortDayRu,
  newId,
  parseDateKey,
  startOfMonth,
  startOfWeekMon,
  submitStage,
  toDateKey,
  weekdayShortRu,
  type WorkDayAssignment,
  type WorkDayMedia,
  type WorkDayRole,
  type WorkDayStage,
} from '../../domain/workDayPlan'
import {
  loadWorkDayPlan,
  removeAssignment,
  upsertAssignment,
} from '../../lib/workDayPlanRepository'
import styles from './SiteWorkDayPlanSection.module.css'

type CalendarView = 'day' | 'week' | 'month'

type Props = {
  siteId: string
  siteName: string
}

function newStageDraft(): Omit<WorkDayStage, 'id' | 'status' | 'media' | 'actualQty' | 'submittedAtIso' | 'reviewedAtIso'> {
  return {
    title: '',
    requirements: '',
    plannedQty: 0,
    unit: 'м',
  }
}

export function SiteWorkDayPlanSection({ siteId, siteName }: Props) {
  const [role, setRole] = useState<WorkDayRole>('brigadier')
  const [view, setView] = useState<CalendarView>('day')
  const [cursor, setCursor] = useState(() => new Date())
  const [assignments, setAssignments] = useState<WorkDayAssignment[]>(() =>
    loadWorkDayPlan(siteId).assignments,
  )
  const [assignOpen, setAssignOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const selectedKey = toDateKey(cursor)

  useEffect(() => {
    setAssignments(loadWorkDayPlan(siteId).assignments)
  }, [siteId])

  const byDate = useMemo(() => {
    const map = new Map<string, WorkDayAssignment[]>()
    for (const a of assignments) {
      const list = map.get(a.dateKey) ?? []
      list.push(a)
      map.set(a.dateKey, list)
    }
    return map
  }, [assignments])

  const dayList = byDate.get(selectedKey) ?? []

  const weekDays = useMemo(() => {
    const start = startOfWeekMon(cursor)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [cursor])

  const monthCells = useMemo(() => {
    const start = startOfMonth(cursor)
    const gridStart = startOfWeekMon(start)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  const active = assignments.find((a) => a.id === activeId) ?? null

  const updateAssignment = (next: WorkDayAssignment) => {
    const list = assignments.map((a) => (a.id === next.id ? next : a))
    setAssignments(list)
    upsertAssignment(siteId, next)
  }

  const handleApprove = (assignmentId: string, stageId: string) => {
    const cur = assignments.find((a) => a.id === assignmentId)
    if (!cur) return
    updateAssignment(approveStage(cur, stageId))
  }

  const handleSubmit = (
    assignmentId: string,
    stageId: string,
    qty: number,
    media: WorkDayMedia[],
  ) => {
    const cur = assignments.find((a) => a.id === assignmentId)
    if (!cur) return
    updateAssignment(submitStage(cur, stageId, qty, media))
  }

  const navLabel = (() => {
    if (view === 'day') return formatDayHeadingRu(selectedKey)
    if (view === 'week') {
      const a = weekDays[0]!
      const b = weekDays[6]!
      return `${a.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
    }
    return cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  })()

  const shift = (dir: -1 | 1) => {
    if (view === 'day') setCursor((c) => addDays(c, dir))
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7))
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1))
  }

  return (
    <section className={styles.section} aria-labelledby="work-day-plan-heading">
      <header className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} alt="" aria-hidden src="/brand-chevron.svg" />
            Ежедневный план
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="work-day-plan-heading">
              План работ
            </h2>
            <div className={styles.roleSwitch} role="group" aria-label="Роль">
              <button
                type="button"
                className={`${styles.roleBtn} ${role === 'brigadier' ? styles.roleOn : ''}`}
                onClick={() => setRole('brigadier')}
              >
                Бригадир
              </button>
              <button
                type="button"
                className={`${styles.roleBtn} ${role === 'manager' ? styles.roleOn : ''}`}
                onClick={() => setRole('manager')}
              >
                Руководитель
              </button>
            </div>
          </div>
          <p className={styles.lead}>
            {siteName}: задачи по дням. Без фото или видео этап не закрыть. После проверки —
            зелёная галочка, следующий этап открывается сам.
          </p>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.viewSwitch} role="radiogroup" aria-label="Период">
          {(
            [
              ['day', 'День'],
              ['week', 'Неделя'],
              ['month', 'Месяц'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              className={`${styles.viewBtn} ${view === id ? styles.viewOn : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.nav}>
          <button type="button" className={styles.navBtn} onClick={() => shift(-1)} aria-label="Назад">
            ‹
          </button>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => setCursor(new Date())}
          >
            Сегодня
          </button>
          <button type="button" className={styles.navBtn} onClick={() => shift(1)} aria-label="Вперёд">
            ›
          </button>
        </div>
        <p className={styles.navLabel}>{navLabel}</p>
        {role === 'manager' ? (
          <button type="button" className={styles.assignCta} onClick={() => setAssignOpen(true)}>
            + Назначить задачу
          </button>
        ) : null}
      </div>

      {view === 'day' ? (
        <div className={styles.dayPane}>
          {dayList.length === 0 ? (
            <p className={styles.empty}>На этот день задач нет.</p>
          ) : (
            <ul className={styles.cardList}>
              {dayList.map((a) => (
                <li key={a.id}>
                  <AssignmentCard
                    assignment={a}
                    role={role}
                    onOpen={() => setActiveId(a.id)}
                    allAssignments={assignments}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {view === 'week' ? (
        <div className={styles.weekGrid}>
          {weekDays.map((d) => {
            const key = toDateKey(d)
            const list = byDate.get(key) ?? []
            const isSel = key === selectedKey
            return (
              <button
                key={key}
                type="button"
                className={`${styles.weekCell} ${isSel ? styles.cellSel : ''}`}
                onClick={() => {
                  setCursor(d)
                  setView('day')
                }}
              >
                <span className={styles.weekDow}>{weekdayShortRu(d)}</span>
                <span className={styles.weekNum}>{d.getDate()}</span>
                <span className={styles.weekCount}>
                  {list.length ? `${list.length} зад.` : '—'}
                </span>
                {list.some((a) => assignmentProgress(a).allDone) ? (
                  <span className={styles.weekOk} aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {view === 'month' ? (
        <div className={styles.monthGrid}>
          {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => (
            <div key={w} className={styles.monthDow}>
              {w}
            </div>
          ))}
          {monthCells.map((d) => {
            const key = toDateKey(d)
            const list = byDate.get(key) ?? []
            const inMonth = d.getMonth() === cursor.getMonth()
            const isSel = key === selectedKey
            return (
              <button
                key={key}
                type="button"
                className={`${styles.monthCell} ${inMonth ? '' : styles.monthMuted} ${isSel ? styles.cellSel : ''}`}
                onClick={() => {
                  setCursor(d)
                  setView('day')
                }}
              >
                <span className={styles.monthNum}>{d.getDate()}</span>
                {list.length > 0 ? (
                  <span className={styles.monthDots}>
                    {list.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={`${styles.dot} ${assignmentProgress(a).allDone ? styles.dotOk : styles.dotActive}`}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {assignOpen ? (
        <AssignModal
          siteId={siteId}
          defaultDateKey={selectedKey}
          onClose={() => setAssignOpen(false)}
          onSave={(a) => {
            upsertAssignment(siteId, a)
            setAssignments(loadWorkDayPlan(siteId).assignments)
            setAssignOpen(false)
            setCursor(parseDateKey(a.dateKey))
            setView('day')
          }}
        />
      ) : null}

      {active ? (
        <TaskDetailModal
          assignment={active}
          role={role}
          allAssignments={assignments}
          onClose={() => setActiveId(null)}
          onSubmit={handleSubmit}
          onApprove={handleApprove}
          onDelete={() => {
            removeAssignment(siteId, active.id)
            setAssignments(loadWorkDayPlan(siteId).assignments)
            setActiveId(null)
          }}
        />
      ) : null}
    </section>
  )
}

function AssignmentCard({
  assignment,
  role,
  onOpen,
  allAssignments,
}: {
  assignment: WorkDayAssignment
  role: WorkDayRole
  onOpen: () => void
  allAssignments: WorkDayAssignment[]
}) {
  const prog = assignmentProgress(assignment)
  const accepted = acceptedQtyForPlanItem(allAssignments, assignment.planItemNumber)
  const waiting = assignment.stages.some((s) => s.status === 'submitted')

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cardTop}>
        <span className={styles.cardArea}>{assignment.area}</span>
        {prog.allDone ? (
          <span className={styles.badgeDone}>
            <CheckIcon /> Выполнено
          </span>
        ) : waiting ? (
          <span className={styles.badgeWait}>На проверке</span>
        ) : (
          <span className={styles.badgeOpen}>
            Этап {prog.doneStages + 1} из {prog.totalStages}
          </span>
        )}
      </div>
      <p className={styles.cardTitle}>{assignment.planItemTitle}</p>
      <p className={styles.cardMeta}>
        Бригадир: {assignment.brigadierName}
        {role === 'manager' ? ` · ${formatShortDayRu(assignment.dateKey)}` : null}
      </p>
      <p className={styles.cardProgress}>
        {formatProgressLine(accepted, assignment.planTotalQty, assignment.planUnit)}
      </p>
      <div className={styles.stageRail}>
        {assignment.stages.map((s) => (
          <span
            key={s.id}
            className={`${styles.stageChip} ${styles[`st_${s.status}`]}`}
            title={s.title}
          >
            {s.status === 'done' ? '✓' : s.status === 'submitted' ? '●' : s.status === 'open' ? '○' : '·'}
            <span className={styles.stageChipLabel}>{s.title}</span>
          </span>
        ))}
      </div>
    </button>
  )
}

function TaskDetailModal({
  assignment,
  role,
  allAssignments,
  onClose,
  onSubmit,
  onApprove,
  onDelete,
}: {
  assignment: WorkDayAssignment
  role: WorkDayRole
  allAssignments: WorkDayAssignment[]
  onClose: () => void
  onSubmit: (assignmentId: string, stageId: string, qty: number, media: WorkDayMedia[]) => void
  onApprove: (assignmentId: string, stageId: string) => void
  onDelete: () => void
}) {
  const accepted = acceptedQtyForPlanItem(allAssignments, assignment.planItemNumber)
  const [qtyByStage, setQtyByStage] = useState<Record<string, string>>({})
  const [mediaByStage, setMediaByStage] = useState<Record<string, WorkDayMedia[]>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const addFiles = (stageId: string, files: FileList | null) => {
    if (!files?.length) return
    const next: WorkDayMedia[] = []
    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i)
      if (!file) continue
      const kind: 'photo' | 'video' = file.type.startsWith('video/') ? 'video' : 'photo'
      next.push({
        id: newId('media'),
        kind,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      })
    }
    setMediaByStage((prev) => ({
      ...prev,
      [stageId]: [...(prev[stageId] ?? []), ...next],
    }))
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.dialogHead}>
          <div>
            <p className={styles.dialogKicker}>{assignment.area}</p>
            <h3 className={styles.dialogTitle}>{assignment.planItemTitle}</h3>
            <p className={styles.dialogMeta}>
              {formatDayHeadingRu(assignment.dateKey)} · {assignment.brigadierName}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <p className={styles.dialogProgress}>
          {formatProgressLine(accepted, assignment.planTotalQty, assignment.planUnit)}
        </p>
        <div className={styles.progressBar} aria-hidden>
          <span
            className={styles.progressFill}
            style={{
              width: `${Math.min(100, (accepted / Math.max(1, assignment.planTotalQty)) * 100)}%`,
            }}
          />
        </div>

        <ol className={styles.stageList}>
          {assignment.stages.map((stage, index) => {
            const draftMedia = mediaByStage[stage.id] ?? []
            const combinedMedia = stage.media.length ? stage.media : draftMedia
            const qtyStr = qtyByStage[stage.id] ?? (stage.actualQty != null ? String(stage.actualQty) : '')
            const qtyNum = Number(qtyStr.replace(',', '.'))
            const canSend = canSubmitStage(
              { ...stage, media: combinedMedia },
              Number.isFinite(qtyNum) ? qtyNum : 0,
            )

            return (
              <li key={stage.id} className={`${styles.stageCard} ${styles[`stage_${stage.status}`]}`}>
                <div className={styles.stageHead}>
                  <span className={styles.stageIndex}>Этап {index + 1}</span>
                  {stage.status === 'done' ? (
                    <span className={styles.badgeDone}>
                      <CheckIcon /> Выполнено
                    </span>
                  ) : stage.status === 'locked' ? (
                    <span className={styles.badgeLocked}>Закрыт</span>
                  ) : stage.status === 'submitted' ? (
                    <span className={styles.badgeWait}>На проверке</span>
                  ) : (
                    <span className={styles.badgeOpen}>В работе</span>
                  )}
                </div>
                <h4 className={styles.stageTitle}>{stage.title}</h4>
                <p className={styles.stageReq}>{stage.requirements}</p>
                <p className={styles.stagePlan}>
                  План: {formatQtyRu(stage.plannedQty)} {stage.unit}
                  {stage.actualQty != null
                    ? ` · Факт: ${formatQtyRu(stage.actualQty)} ${stage.unit}`
                    : null}
                </p>

                {combinedMedia.length > 0 ? (
                  <ul className={styles.mediaRow}>
                    {combinedMedia.map((m) => (
                      <li key={m.id} className={styles.mediaThumb}>
                        {m.kind === 'photo' ? (
                          <img src={m.previewUrl} alt={m.name} />
                        ) : (
                          <video src={m.previewUrl} muted />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {role === 'brigadier' && stage.status === 'open' ? (
                  <div className={styles.brigadierActions}>
                    <label className={styles.field}>
                      <span>Фактический объём ({stage.unit})</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={qtyStr}
                        onChange={(e) =>
                          setQtyByStage((p) => ({ ...p, [stage.id]: e.target.value }))
                        }
                        placeholder={`напр. ${stage.plannedQty}`}
                      />
                    </label>
                    <input
                      ref={(el) => {
                        fileRefs.current[stage.id] = el
                      }}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className={styles.hiddenFile}
                      onChange={(e) => {
                        addFiles(stage.id, e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      className={styles.mediaCta}
                      onClick={() => fileRefs.current[stage.id]?.click()}
                    >
                      Прикрепить фото или видео
                    </button>
                    <p className={styles.hint}>
                      Без фото или видео сдать этап нельзя.
                      {draftMedia.length === 0 ? ' Файлы ещё не выбраны.' : ` Выбрано: ${draftMedia.length}.`}
                    </p>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={!canSend}
                      onClick={() =>
                        onSubmit(
                          assignment.id,
                          stage.id,
                          qtyNum,
                          draftMedia.length ? draftMedia : [...stage.media],
                        )
                      }
                    >
                      Сдать этап
                    </button>
                  </div>
                ) : null}

                {role === 'manager' && stage.status === 'submitted' ? (
                  <div className={styles.managerActions}>
                    <p className={styles.hint}>
                      Проверьте объём и материалы съёмки, затем подтвердите.
                    </p>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => onApprove(assignment.id, stage.id)}
                    >
                      Принять — Выполнено
                    </button>
                  </div>
                ) : null}

                {stage.status === 'locked' ? (
                  <p className={styles.lockedNote}>
                    Откроется после приёмки предыдущего этапа.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>

        {role === 'manager' ? (
          <button type="button" className={styles.dangerBtn} onClick={onDelete}>
            Удалить задачу
          </button>
        ) : null}
      </div>
    </div>
  )
}

function AssignModal({
  siteId,
  defaultDateKey,
  onClose,
  onSave,
}: {
  siteId: string
  defaultDateKey: string
  onClose: () => void
  onSave: (a: WorkDayAssignment) => void
}) {
  const [dateKey, setDateKey] = useState(defaultDateKey)
  const [area, setArea] = useState('Участок А')
  const [brigadierName, setBrigadierName] = useState('Минасян А.Л.')
  const [planItemNumber, setPlanItemNumber] = useState('2.2')
  const [planItemTitle, setPlanItemTitle] = useState('Устройство песчаного основания')
  const [planTotalQty, setPlanTotalQty] = useState('28641')
  const [planUnit, setPlanUnit] = useState('м²')
  const [stages, setStages] = useState([
    {
      ...newStageDraft(),
      title: 'Песчаное основание 300 мм',
      requirements: 'Песок карьерный, уплотнение. Толщина 300 мм.',
      plannedQty: 100,
      unit: 'м',
    },
    {
      ...newStageDraft(),
      title: 'Щебень 20–40, толщина 200 мм',
      requirements: 'Фракция 20–40. Толщина 200 мм.',
      plannedQty: 100,
      unit: 'м',
    },
  ])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid =
    area.trim() &&
    brigadierName.trim() &&
    planItemTitle.trim() &&
    stages.length > 0 &&
    stages.every((s) => s.title.trim() && s.plannedQty > 0)

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.dialogHead}>
          <h3 className={styles.dialogTitle}>Назначить задачу</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Дата</span>
            <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Участок</span>
            <input value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Бригадир</span>
            <input value={brigadierName} onChange={(e) => setBrigadierName(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>№ строки плана</span>
            <input value={planItemNumber} onChange={(e) => setPlanItemNumber(e.target.value)} />
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Вид работ (из общего плана)</span>
            <input value={planItemTitle} onChange={(e) => setPlanItemTitle(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Общий план</span>
            <input
              type="number"
              value={planTotalQty}
              onChange={(e) => setPlanTotalQty(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Ед. изм. плана</span>
            <input value={planUnit} onChange={(e) => setPlanUnit(e.target.value)} />
          </label>
        </div>

        <h4 className={styles.stagesHeading}>Этапы (по порядку)</h4>
        {stages.map((s, i) => (
          <div key={i} className={styles.stageEdit}>
            <p className={styles.stageIndex}>Этап {i + 1}</p>
            <label className={styles.field}>
              <span>Название</span>
              <input
                value={s.title}
                onChange={(e) =>
                  setStages((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, title: e.target.value } : row)),
                  )
                }
              />
            </label>
            <label className={styles.field}>
              <span>Требования</span>
              <input
                value={s.requirements}
                onChange={(e) =>
                  setStages((prev) =>
                    prev.map((row, j) =>
                      j === i ? { ...row, requirements: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Объём</span>
                <input
                  type="number"
                  value={s.plannedQty || ''}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((row, j) =>
                        j === i ? { ...row, plannedQty: Number(e.target.value) || 0 } : row,
                      ),
                    )
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Ед.</span>
                <input
                  value={s.unit}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((row, j) => (j === i ? { ...row, unit: e.target.value } : row)),
                    )
                  }
                />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => setStages((p) => [...p, newStageDraft()])}
        >
          + Добавить этап
        </button>

        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!valid}
          onClick={() => {
            const builtStages: WorkDayStage[] = stages.map((s, i) => ({
              id: newId('stage'),
              title: s.title.trim(),
              requirements: s.requirements.trim(),
              plannedQty: s.plannedQty,
              unit: s.unit.trim() || 'м',
              actualQty: null,
              status: i === 0 ? 'open' : 'locked',
              media: [],
              submittedAtIso: null,
              reviewedAtIso: null,
            }))
            onSave({
              id: newId('asg'),
              siteId,
              dateKey,
              area: area.trim(),
              brigadierName: brigadierName.trim(),
              planItemNumber: planItemNumber.trim() || '—',
              planItemTitle: planItemTitle.trim(),
              planTotalQty: Number(planTotalQty) || 0,
              planUnit: planUnit.trim() || 'м',
              stages: builtStages,
              createdAtIso: new Date().toISOString(),
            })
          }}
        >
          Сохранить назначение
        </button>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 7.2 5.8 10 11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
