import { useEffect, useMemo, useRef, useState } from 'react'
import { unitLabel, type MeasurementUnitId } from '../../domain/brigadierReport'
import {
  addDays,
  attachStageBrief,
  assignmentProgress,
  canSubmitStage,
  formatDayHeadingRu,
  formatProgressLine,
  formatQtyRu,
  formatWorkPointLine,
  issuedQtyForPlanItem,
  newId,
  parseDateKey,
  stagePlanNumber,
  stagePlanTitle,
  startOfMonth,
  startOfWeekMon,
  submitStage,
  toDateKey,
  uniqueStagesByPlanItem,
  weekdayShortRu,
  type WorkDayAssignment,
  type WorkDayMedia,
  type WorkDayRole,
  type WorkDayStage,
} from '../../domain/workDayPlan'
import type { WorkPlan } from '../../domain/workPlan'
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
  /** Производственный план — для выбора строки при назначении. */
  workPlan?: WorkPlan
  /** Роль из входа: руководитель назначает, бригадир сдаёт факт. */
  role: WorkDayRole
  /**
   * Без внешней шапки секции — для встраивания в общий «План работ».
   * Календарь остаётся, дублирующий title убирается.
   */
  embedded?: boolean
  /** Показать встроенный intro-блок при embedded (по умолчанию да). */
  showIntro?: boolean
  /** Вызывается после любого изменения назначений (для пересчёта план/факт). */
  onAssignmentsChange?: (assignments: WorkDayAssignment[]) => void
}

type PlanPick = {
  number: string
  title: string
  sectionTitle: string
  total: number
  remaining: number
  unitLabel: string
  unitId: MeasurementUnitId
}

function flattenPlanItems(plan: WorkPlan | undefined): PlanPick[] {
  if (!plan) return []
  const out: PlanPick[] = []
  for (const section of plan.sections) {
    for (const item of section.items) {
      out.push({
        number: item.number,
        title: item.title,
        sectionTitle: `${section.number}. ${section.title}`,
        total: item.total,
        remaining: Math.max(0, item.total - item.done),
        unitLabel: unitLabel(item.unit),
        unitId: item.unit,
      })
    }
  }
  return out
}

function uniquePlanPoints(a: WorkDayAssignment): Array<{ number: string; title: string }> {
  const seen = new Set<string>()
  const out: Array<{ number: string; title: string }> = []
  for (const s of a.stages) {
    const number = stagePlanNumber(a, s)
    if (!number || seen.has(number)) continue
    seen.add(number)
    out.push({ number, title: stagePlanTitle(a, s) })
  }
  if (out.length === 0 && a.planItemNumber) {
    out.push({ number: a.planItemNumber, title: a.planItemTitle })
  }
  return out
}

const WORK_DAY_LEAD: Record<WorkDayRole, (siteName: string) => string> = {
  manager: () => 'Назначьте строку плана и объём на день.',
  brigadier: () =>
    'Укажите выполненный объём, приложите медиа и подтвердите выполнение.',
}

export function SiteWorkDayPlanSection({
  siteId,
  siteName,
  workPlan,
  role,
  embedded = false,
  showIntro = true,
  onAssignmentsChange,
}: Props) {
  const [view, setView] = useState<CalendarView>('day')
  const [cursor, setCursor] = useState(() => new Date())
  const [assignments, setAssignments] = useState<WorkDayAssignment[]>(() =>
    loadWorkDayPlan(siteId).assignments,
  )
  const [assignOpen, setAssignOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const planItems = useMemo(() => flattenPlanItems(workPlan), [workPlan])
  const selectedKey = toDateKey(cursor)

  const replaceAssignments = (next: WorkDayAssignment[]) => {
    setAssignments(next)
    onAssignmentsChange?.(next)
  }

  useEffect(() => {
    setAssignments(loadWorkDayPlan(siteId).assignments)
  }, [siteId, 'v12'])

  const patchAssignment = (
    assignmentId: string,
    fn: (cur: WorkDayAssignment) => WorkDayAssignment,
  ) => {
    setAssignments((prev) => {
      const cur = prev.find((a) => a.id === assignmentId)
      if (!cur) return prev
      const next = fn(cur)
      upsertAssignment(siteId, next)
      const list = prev.map((a) => (a.id === next.id ? next : a))
      onAssignmentsChange?.(list)
      return list
    })
  }

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

  const handleSubmit = (
    assignmentId: string,
    stageId: string,
    qty: number,
    media: WorkDayMedia[],
  ) => {
    patchAssignment(assignmentId, (cur) => submitStage(cur, stageId, qty, media))
  }

  const handleAttachBrief = (
    assignmentId: string,
    stageId: string,
    media: WorkDayMedia[],
  ) => {
    patchAssignment(assignmentId, (cur) => attachStageBrief(cur, stageId, media))
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
    <section
      className={embedded ? styles.embedded : styles.section}
      aria-labelledby={!embedded || !showIntro ? 'work-day-plan-heading' : undefined}
    >
      {embedded ? null : (
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
            </div>
            <p className={styles.lead}>{WORK_DAY_LEAD[role](siteName)}</p>
          </div>
        </header>
      )}

      {embedded && showIntro ? (
        <div className={styles.embeddedIntro}>
          <div className={styles.embeddedIntroText}>
            <p className={styles.kicker}>
              <img className={styles.kickerMark} alt="" aria-hidden src="/brand-chevron.svg" />
              Задания дня
            </p>
            <h3 className={styles.embeddedTitle}>Календарь заданий</h3>
            <p className={styles.embeddedLead}>{WORK_DAY_LEAD[role](siteName)}</p>
          </div>
        </div>
      ) : null}

      {embedded && !showIntro ? (
        <header className={styles.moduleHead}>
          <p className={styles.moduleKicker}>
            <img
              className={styles.moduleKickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden
            />
            Задания дня
          </p>
          <h3 className={styles.moduleTitle} id="work-day-plan-heading">
            План работ
          </h3>
          <p className={styles.moduleLead}>{WORK_DAY_LEAD[role](siteName)}</p>
        </header>
      ) : null}

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
            + Задание бригадиру
          </button>
        ) : null}
      </div>

      {view === 'day' ? (
        <div className={styles.dayPane}>
          {dayList.length === 0 ? (
            <p className={styles.empty}>На этот день задач нет.</p>
          ) : (
            <DayBriefingSheet
              dateKey={selectedKey}
              assignments={dayList}
              onOpen={(id) => setActiveId(id)}
            />
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
          planItems={planItems}
          onClose={() => setAssignOpen(false)}
          onSave={(a) => {
            upsertAssignment(siteId, a)
            replaceAssignments(loadWorkDayPlan(siteId).assignments)
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
          planItems={planItems}
          onClose={() => setActiveId(null)}
          onSubmit={handleSubmit}
          onAttachBrief={handleAttachBrief}
          onDelete={() => {
            removeAssignment(siteId, active.id)
            replaceAssignments(loadWorkDayPlan(siteId).assignments)
            setActiveId(null)
          }}
        />
      ) : null}
    </section>
  )
}

function taskRowStatus(a: WorkDayAssignment): {
  tone: 'done' | 'open'
  label: string
} {
  const prog = assignmentProgress(a)
  if (prog.allDone) return { tone: 'done', label: 'Готово' }
  return { tone: 'open', label: 'Сделать' }
}

/** Краткое описание шага для списка заданий. */
function formatStageBrief(a: WorkDayAssignment, s: WorkDayStage): string {
  return formatWorkPointLine(
    stagePlanNumber(a, s),
    stagePlanTitle(a, s) || s.title,
    s.plannedQty,
    s.unit,
  )
}

/** Одна ячейка дня: все задания бригадиру списком внутри. */
function DayBriefingSheet({
  dateKey,
  assignments,
  onOpen,
}: {
  dateKey: string
  assignments: WorkDayAssignment[]
  onOpen: (id: string) => void
}) {
  const brigadiers = [
    ...new Set(assignments.map((a) => a.brigadierName.trim()).filter(Boolean)),
  ]
  const doneCount = assignments.filter((a) => assignmentProgress(a).allDone).length
  const openCount = assignments.length - doneCount

  const dayTone = doneCount === assignments.length ? 'done' : 'open'
  const dayLabel =
    doneCount === assignments.length
      ? 'Все задания дня закрыты'
      : `В работе: ${openCount}`

  return (
    <article className={styles.daySheet}>
      <span className={styles.cardRail} aria-hidden />
      <span className={styles.cardShimmer} aria-hidden />

      <header className={styles.daySheetHead}>
        <div className={styles.daySheetHeadText}>
          <p className={styles.daySheetKicker}>Задания на день</p>
          <h3 className={styles.daySheetTitle}>{formatDayHeadingRu(dateKey)}</h3>
          <p className={styles.daySheetLead}>
            {assignments.length}{' '}
            {assignments.length === 1
              ? 'задание'
              : assignments.length < 5
                ? 'задания'
                : 'заданий'}
            {brigadiers.length
              ? ` · бригадир: ${brigadiers.join(', ')}`
              : null}
          </p>
        </div>
        <span className={`${styles.statusPill} ${styles[`status_${dayTone}`]}`}>
          {dayTone === 'done' ? <CheckIcon /> : null}
          {dayLabel}
        </span>
      </header>

      <ol className={styles.taskList}>
        {assignments.map((a, index) => {
          const row = taskRowStatus(a)
          const currentId = a.stages.find((s) => s.status === 'open')?.id ?? null

          return (
            <li key={a.id}>
              <button
                type="button"
                className={`${styles.taskRow} ${styles[`taskRow_${row.tone}`]}`}
                onClick={() => onOpen(a.id)}
              >
                <span className={styles.taskRowNum} aria-hidden>
                  {index + 1}
                </span>
                <div className={styles.taskRowBody}>
                  <div className={styles.taskRowTop}>
                    <p className={styles.taskRowArea}>{a.area}</p>
                    <span className={`${styles.taskRowStatus} ${styles[`tr_${row.tone}`]}`}>
                      {row.label}
                    </span>
                  </div>
                  <ol className={styles.taskSteps}>
                    {uniqueStagesByPlanItem(a).map((s, i) => {
                      const isActive = s.id === currentId
                      const isDone = s.status === 'done' || s.status === 'submitted'
                      const isMuted = isDone
                      return (
                        <li
                          key={s.id}
                          className={`${styles.taskStep} ${
                            isActive ? styles.taskStepActive : ''
                          } ${isMuted ? styles.taskStepMuted : ''} ${
                            isDone ? styles.taskStepDone : ''
                          }`}
                        >
                          <span className={styles.taskStepIndex} aria-hidden>
                            {isDone ? '✓' : i + 1}
                          </span>
                          <span className={styles.taskStepText}>
                            {formatStageBrief(a, s)}
                          </span>
                          {(s.briefMedia ?? []).length > 0 ? (
                            <span className={styles.taskStepBrief} aria-label="фото места">
                              {(s.briefMedia ?? []).slice(0, 3).map((m) =>
                                m.kind === 'photo' ? (
                                  <img key={m.id} src={m.previewUrl} alt="" />
                                ) : (
                                  <video key={m.id} src={m.previewUrl} muted />
                                ),
                              )}
                            </span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ol>
                </div>
                <span className={styles.taskRowArrow} aria-hidden>
                  →
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </article>
  )
}

function TaskDetailModal({
  assignment,
  role,
  allAssignments,
  planItems,
  onClose,
  onSubmit,
  onAttachBrief,
  onDelete,
}: {
  assignment: WorkDayAssignment
  role: WorkDayRole
  allAssignments: WorkDayAssignment[]
  planItems: PlanPick[]
  onClose: () => void
  onSubmit: (assignmentId: string, stageId: string, qty: number, media: WorkDayMedia[]) => void
  onAttachBrief: (assignmentId: string, stageId: string, media: WorkDayMedia[]) => void
  onDelete: () => void
}) {
  const points = uniquePlanPoints(assignment)
  const prog = assignmentProgress(assignment)
  const [qtyByStage, setQtyByStage] = useState<Record<string, string>>({})
  const [mediaByStage, setMediaByStage] = useState<Record<string, WorkDayMedia[]>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const briefFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const stageRefs = useRef<Record<string, HTMLLIElement | null>>({})

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

  const readFiles = (files: FileList | null): WorkDayMedia[] => {
    if (!files?.length) return []
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
    return next
  }

  const addFactFiles = (stageId: string, files: FileList | null) => {
    const next = readFiles(files)
    if (!next.length) return
    setMediaByStage((prev) => ({
      ...prev,
      [stageId]: [...(prev[stageId] ?? []), ...next],
    }))
  }

  const focusNextOpen = (completedStageId: string) => {
    const idx = assignment.stages.findIndex((s) => s.id === completedStageId)
    const remaining = assignment.stages.filter(
      (s, i) =>
        s.id !== completedStageId &&
        (s.status === 'open' || s.status === 'locked') &&
        (idx < 0 || i > idx),
    )
    const fallback = assignment.stages.find(
      (s) => s.id !== completedStageId && (s.status === 'open' || s.status === 'locked'),
    )
    const nextOpen = remaining[0] ?? fallback
    if (!nextOpen) return
    requestAnimationFrame(() => {
      stageRefs.current[nextOpen.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const handleMarkDone = (stageId: string, qty: number, media: WorkDayMedia[]) => {
    onSubmit(assignment.id, stageId, qty, media)
    setMediaByStage((prev) => {
      const copy = { ...prev }
      delete copy[stageId]
      return copy
    })
    focusNextOpen(stageId)
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.dialogHead}>
          <div className={styles.dialogHeadMain}>
            <p className={styles.dialogKicker}>Задание на смену</p>
            <h3 className={styles.dialogTitle}>{assignment.area}</h3>
            <div className={styles.dialogMetaRow}>
              <span className={styles.metaChip}>{formatDayHeadingRu(assignment.dateKey)}</span>
              {role === 'manager' ? (
                <span className={styles.metaChipMuted}>{assignment.brigadierName}</span>
              ) : null}
              <span className={styles.metaChipMuted}>
                {prog.doneStages}/{prog.totalStages} пунктов
              </span>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className={styles.dialogHero}>
          <div className={styles.heroBlock}>
            <p className={styles.heroLabel}>Состав задания</p>
            <ul className={styles.pointList}>
              {points.map((p) => (
                <li key={p.number} className={styles.pointChip}>
                  <span className={styles.pointNum}>п. {p.number}</span>
                  <span className={styles.pointTitle}>{p.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`${styles.instructionBanner} ${
              prog.allDone ? styles.instructionDone : styles.instructionActive
            }`}
          >
            {role === 'brigadier' ? (
              prog.allDone ? (
                <p className={styles.instructionText}>Все пункты закрыты.</p>
              ) : (
                <ol className={styles.instructionSteps}>
                  <li>Введите фактический объём</li>
                  <li>Приложите фото или видео</li>
                  <li>Нажмите «Готово»</li>
                </ol>
              )
            ) : (
              <div className={styles.managerProgressBlock}>
                <p className={styles.instructionText}>
                  {prog.allDone
                    ? 'Задание закрыто.'
                    : `Выполнено ${prog.doneStages} из ${prog.totalStages}.`}
                </p>
                {points.map((p) => {
                  const item = planItems.find((it) => it.number === p.number)
                  const total = item?.total ?? assignment.planTotalQty
                  const unit = item?.unitLabel ?? assignment.planUnit
                  return (
                    <p key={p.number} className={styles.dialogProgressSub}>
                      п. {p.number}:{' '}
                      {formatProgressLine(
                        issuedQtyForPlanItem(allAssignments, p.number),
                        total,
                        unit,
                      )}
                    </p>
                  )
                })}
              </div>
            )}
          </div>

          <div className={styles.progressBar} aria-hidden>
            <span
              className={styles.progressFill}
              style={{
                width: `${Math.min(
                  100,
                  (prog.doneStages / Math.max(1, prog.totalStages)) * 100,
                )}%`,
              }}
            />
          </div>
        </div>

        <ol className={styles.stageList}>
          {uniqueStagesByPlanItem(assignment).map((stage, index) => {
            const isDone = stage.status === 'done' || stage.status === 'submitted'
            const canWork =
              role === 'brigadier' && (stage.status === 'open' || stage.status === 'locked')
            const draftMedia = mediaByStage[stage.id] ?? []
            const factMedia = stage.media.length ? stage.media : draftMedia
            const brief = stage.briefMedia ?? []
            const pointNumber = stagePlanNumber(assignment, stage)
            const pointName = stagePlanTitle(assignment, stage) || stage.title
            const qtyStr =
              qtyByStage[stage.id] ??
              (stage.actualQty != null
                ? String(stage.actualQty)
                : String(stage.plannedQty))
            const qtyNum = Number(String(qtyStr).replace(',', '.'))
            const qtyOk = Number.isFinite(qtyNum) && qtyNum > 0
            const canSend = canSubmitStage(
              { ...stage, media: factMedia },
              qtyOk ? qtyNum : 0,
            )
            const isFocus = prog.openStage?.id === stage.id
            const qtyDiffers =
              qtyOk && Math.abs(qtyNum - stage.plannedQty) > 0.0001

            return (
              <li
                key={stage.id}
                ref={(el) => {
                  stageRefs.current[stage.id] = el
                }}
                className={`${styles.stageCard} ${
                  isDone ? styles.stage_done : styles.stage_open
                } ${isFocus && !isDone ? styles.stage_focus : ''}`}
              >
                <div className={styles.stageHead}>
                  <div className={styles.stageHeadLeft}>
                    <span className={styles.stageIndex}>
                      п. {pointNumber || index + 1}
                    </span>
                    <h4 className={styles.stageTitle}>{pointName}</h4>
                  </div>
                  {isDone ? (
                    <span className={styles.badgeDone}>
                      <CheckIcon /> Готово
                    </span>
                  ) : (
                    <span className={styles.lockedQty}>
                      план {formatQtyRu(stage.plannedQty)} {stage.unit}
                    </span>
                  )}
                </div>

                {stage.requirements.trim() ? (
                  <p className={styles.stageReq}>{stage.requirements}</p>
                ) : null}

                {brief.length > 0 ? (
                  <div className={`${styles.zone} ${styles.zoneBrief}`}>
                    <p className={styles.zoneLabel}>Образец места</p>
                    <ul className={styles.mediaRow}>
                      {brief.map((m) => (
                        <li key={m.id} className={styles.mediaThumbLg}>
                          {m.kind === 'photo' ? (
                            <img src={m.previewUrl} alt={m.name} />
                          ) : (
                            <video src={m.previewUrl} controls playsInline />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : role === 'brigadier' && !isDone ? (
                  <p className={styles.hintMuted}>Образец места пока не приложен.</p>
                ) : null}

                {isDone && stage.media.length > 0 ? (
                  <div className={`${styles.zone} ${styles.zoneFact}`}>
                    <p className={styles.zoneLabel}>Факт с объекта</p>
                    <ul className={styles.mediaRow}>
                      {stage.media.map((m) => (
                        <li key={m.id} className={styles.mediaThumb}>
                          {m.kind === 'photo' ? (
                            <img src={m.previewUrl} alt={m.name} />
                          ) : (
                            <video src={m.previewUrl} muted />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {role === 'manager' ? (
                  <div className={`${styles.zone} ${styles.zoneManager}`}>
                    <input
                      ref={(el) => {
                        briefFileRefs.current[stage.id] = el
                      }}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className={styles.hiddenFile}
                      onChange={(e) => {
                        const next = readFiles(e.target.files)
                        if (next.length) onAttachBrief(assignment.id, stage.id, next)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      className={styles.mediaCta}
                      onClick={() => briefFileRefs.current[stage.id]?.click()}
                    >
                      Приложить образец места
                    </button>
                  </div>
                ) : null}

                {isDone && stage.actualQty != null ? (
                  <p className={styles.stagePlan}>
                    Сдано {formatQtyRu(stage.actualQty)} {stage.unit}
                    {stage.actualQty !== stage.plannedQty
                      ? ` · по плану ${formatQtyRu(stage.plannedQty)} ${stage.unit}`
                      : null}
                  </p>
                ) : null}

                {canWork ? (
                  <div className={styles.brigadierActions}>
                    <div className={`${styles.zone} ${styles.zoneQty}`}>
                      <p className={styles.zoneLabel}>1. Объём</p>
                      <label className={styles.field}>
                        <span>Факт, {stage.unit}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={qtyStr}
                          onChange={(e) =>
                            setQtyByStage((p) => ({ ...p, [stage.id]: e.target.value }))
                          }
                        />
                      </label>
                      {qtyDiffers ? (
                        <p className={styles.remainHint}>
                          План: {formatQtyRu(stage.plannedQty)} {stage.unit} → факт:{' '}
                          {formatQtyRu(qtyNum)} {stage.unit}
                        </p>
                      ) : (
                        <p className={styles.hintMuted}>
                          По плану {formatQtyRu(stage.plannedQty)} {stage.unit}. При отклонении
                          измените цифру.
                        </p>
                      )}
                    </div>

                    <div className={`${styles.zone} ${styles.zoneMedia}`}>
                      <p className={styles.zoneLabel}>2. Подтверждение</p>
                      <input
                        ref={(el) => {
                          fileRefs.current[stage.id] = el
                        }}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className={styles.hiddenFile}
                        onChange={(e) => {
                          addFactFiles(stage.id, e.target.files)
                          e.target.value = ''
                        }}
                      />
                      <button
                        type="button"
                        className={styles.mediaCta}
                        onClick={() => fileRefs.current[stage.id]?.click()}
                      >
                        Фото или видео
                      </button>
                      {draftMedia.length > 0 ? (
                        <ul className={styles.mediaRow}>
                          {draftMedia.map((m) => (
                            <li key={m.id} className={styles.mediaThumb}>
                              {m.kind === 'photo' ? (
                                <img src={m.previewUrl} alt={m.name} />
                              ) : (
                                <video src={m.previewUrl} muted />
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.hintMuted}>Нужно хотя бы одно вложение.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={!canSend}
                      onClick={() =>
                        handleMarkDone(
                          stage.id,
                          qtyNum,
                          draftMedia.length ? draftMedia : [...stage.media],
                        )
                      }
                    >
                      3. Готово
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>

        {role === 'manager' ? (
          <button type="button" className={styles.dangerBtn} onClick={onDelete}>
            Удалить задание
          </button>
        ) : null}
      </div>
    </div>
  )
}
function AssignModal({
  siteId,
  defaultDateKey,
  planItems,
  onClose,
  onSave,
}: {
  siteId: string
  defaultDateKey: string
  planItems: PlanPick[]
  onClose: () => void
  onSave: (a: WorkDayAssignment) => void
}) {
  type WorkLine = { planNumber: string; qty: string; requirements: string }

  const firstPick =
    planItems.find((p) => p.remaining > 0) ??
    planItems.find((p) => p.total > 0) ??
    planItems[0] ??
    null

  const [dateKey, setDateKey] = useState(defaultDateKey)
  const [area, setArea] = useState('Участок А')
  const [brigadierName, setBrigadierName] = useState('Минасян А.Л.')
  const [lines, setLines] = useState<WorkLine[]>(() => [
    { planNumber: firstPick?.number ?? '', qty: '', requirements: '' },
  ])
  const [briefByIndex, setBriefByIndex] = useState<Record<number, WorkDayMedia[]>>({})
  const briefCreateRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const groups = useMemo(() => {
    const map = new Map<string, PlanPick[]>()
    for (const p of planItems) {
      const list = map.get(p.sectionTitle) ?? []
      list.push(p)
      map.set(p.sectionTitle, list)
    }
    return [...map.entries()]
  }, [planItems])

  const taken = new Set(lines.map((l) => l.planNumber).filter(Boolean))

  const parsedLines = lines.map((line) => {
    const item = planItems.find((p) => p.number === line.planNumber) ?? null
    const qty = Number(String(line.qty).replace(',', '.'))
    const qtyOk = Number.isFinite(qty) && qty > 0
    const over = Boolean(item && item.total > 0 && qtyOk && qty > item.remaining)
    const left = item && item.total > 0 && qtyOk ? Math.max(0, item.remaining - qty) : null
    return { line, item, qty: qtyOk ? qty : 0, qtyOk, over, left }
  })

  const valid =
    Boolean(area.trim() && brigadierName.trim()) &&
    parsedLines.length > 0 &&
    parsedLines.every((row) => row.item && row.qtyOk && !row.over)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patchLine = (index: number, patch: Partial<WorkLine>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const readBriefFiles = (files: FileList | null): WorkDayMedia[] => {
    if (!files?.length) return []
    const next: WorkDayMedia[] = []
    for (let k = 0; k < files.length; k += 1) {
      const file = files.item(k)
      if (!file) continue
      next.push({
        id: newId('media'),
        kind: file.type.startsWith('video/') ? 'video' : 'photo',
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      })
    }
    return next
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.dialogHead}>
          <div>
            <p className={styles.dialogKicker}>Постановка в план</p>
            <h3 className={styles.dialogTitle}>Задание бригадиру</h3>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className={styles.dialogBody}>
        <p className={styles.hint}>
          Выберите пункты плана и объём на день. Объём сразу спишется из остатка.
        </p>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Дата</span>
            <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Участок</span>
            <input value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Бригадир</span>
            <input value={brigadierName} onChange={(e) => setBrigadierName(e.target.value)} />
          </label>
        </div>

        <h4 className={styles.stagesHeading}>Пункты работ на сегодня</h4>
        {parsedLines.map((row, i) => (
          <div key={i} className={styles.stageEdit}>
            <p className={styles.stageIndex}>Пункт {i + 1}</p>
            <label className={styles.field}>
              <span>Строка справки — что делать</span>
              {planItems.length > 0 ? (
                <select
                  value={row.line.planNumber}
                  onChange={(e) => patchLine(i, { planNumber: e.target.value })}
                >
                  {groups.map(([section, items]) => (
                    <optgroup key={section} label={section}>
                      {items.map((p) => {
                        const usedElsewhere = taken.has(p.number) && p.number !== row.line.planNumber
                        const remainText =
                          p.total > 0
                            ? `осталось ${formatQtyRu(p.remaining)} из ${formatQtyRu(p.total)} ${p.unitLabel}`
                            : 'объём не задан'
                        return (
                          <option key={p.number} value={p.number} disabled={usedElsewhere}>
                            {p.number} — {p.title} ({remainText})
                          </option>
                        )
                      })}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <input
                  value={row.line.planNumber}
                  onChange={(e) => patchLine(i, { planNumber: e.target.value })}
                  placeholder="№ строки, например 5.5"
                />
              )}
            </label>

            {row.item ? (
              <p className={styles.remainHint}>
                {row.item.total > 0 ? (
                  <>
                    В плане {formatQtyRu(row.item.total)} {row.item.unitLabel}, уже занято{' '}
                    {formatQtyRu(Math.max(0, row.item.total - row.item.remaining))}{' '}
                    {row.item.unitLabel}, свободно{' '}
                    <strong>
                      {formatQtyRu(row.item.remaining)} {row.item.unitLabel}
                    </strong>
                    .
                  </>
                ) : (
                  <>Общий объём по этой строке ещё не внесён — задание всё равно можно поставить.</>
                )}
              </p>
            ) : null}

            <label className={styles.field}>
              <span>Сколько на сегодня{row.item ? ` (${row.item.unitLabel})` : ''}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={row.line.qty}
                onChange={(e) => patchLine(i, { qty: e.target.value })}
                placeholder={
                  row.item && row.item.remaining > 0
                    ? `не больше ${formatQtyRu(row.item.remaining)}`
                    : 'например 100'
                }
              />
            </label>

            {row.over ? (
              <p className={styles.overLimit}>
                Нельзя поставить больше остатка ({formatQtyRu(row.item!.remaining)}{' '}
                {row.item!.unitLabel}).
              </p>
            ) : null}
            {row.left != null && !row.over ? (
              <p className={styles.remainHint}>
                После постановки в справке останется{' '}
                <strong>
                  {formatQtyRu(row.left)} {row.item?.unitLabel}
                </strong>
                .
              </p>
            ) : null}

            <label className={styles.field}>
              <span>Коротко для бригадира, если нужно</span>
              <input
                value={row.line.requirements}
                onChange={(e) => patchLine(i, { requirements: e.target.value })}
                placeholder="не обязательно — пункт справки уже написан"
              />
            </label>
            <p className={styles.hint}>Приложи фото или видео места — бригадир увидит «что и где».</p>
            <input
              ref={(el) => {
                briefCreateRefs.current[i] = el
              }}
              type="file"
              accept="image/*,video/*"
              multiple
              className={styles.hiddenFile}
              onChange={(e) => {
                const next = readBriefFiles(e.target.files)
                if (!next.length) return
                setBriefByIndex((prev) => ({
                  ...prev,
                  [i]: [...(prev[i] ?? []), ...next],
                }))
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className={styles.mediaCta}
              onClick={() => briefCreateRefs.current[i]?.click()}
            >
              Фото или видео: что делать и где
            </button>
            {(briefByIndex[i] ?? []).length > 0 ? (
              <ul className={styles.mediaRow}>
                {(briefByIndex[i] ?? []).map((m) => (
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
            {lines.length > 1 ? (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setLines((prev) => prev.filter((_, j) => j !== i))
                  setBriefByIndex((prev) => {
                    const next: Record<number, WorkDayMedia[]> = {}
                    Object.keys(prev).forEach((key) => {
                      const idx = Number(key)
                      if (idx < i) next[idx] = prev[idx]!
                      else if (idx > i) next[idx - 1] = prev[idx]!
                    })
                    return next
                  })
                }}
              >
                Убрать этот пункт
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => {
            const nextItem = planItems.find((p) => !taken.has(p.number))
            setLines((prev) => [
              ...prev,
              { planNumber: nextItem?.number ?? '', qty: '', requirements: '' },
            ])
          }}
        >
          + Ещё пункт работ
        </button>

        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!valid}
          onClick={() => {
            const builtStages: WorkDayStage[] = parsedLines.map((row, i) => {
              const item = row.item!
              return {
                id: newId('stage'),
                title: formatWorkPointLine(item.number, item.title, row.qty, item.unitLabel),
                requirements: row.line.requirements.trim(),
                plannedQty: row.qty,
                unit: item.unitLabel,
                planItemNumber: item.number,
                planItemTitle: item.title,
                actualQty: null,
                status: 'open',
                media: [],
                briefMedia: briefByIndex[i] ?? [],
                submittedAtIso: null,
                reviewedAtIso: null,
              }
            })
            const first = parsedLines[0]!.item!
            onSave({
              id: newId('asg'),
              siteId,
              dateKey,
              area: area.trim(),
              brigadierName: brigadierName.trim(),
              planItemNumber: first.number,
              planItemTitle: first.title,
              planTotalQty: first.total,
              planUnit: first.unitLabel,
              stages: builtStages,
              createdAtIso: new Date().toISOString(),
            })
          }}
        >
          Поставить в план
        </button>
        </div>
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
