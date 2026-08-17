import { useEffect, useMemo, useRef, useState } from 'react'
import { unitLabel, type MeasurementUnitId } from '../../domain/brigadierReport'
import {
  acceptedQtyForPlanItem,
  addDays,
  attachStageBrief,
  assignmentProgress,
  canSubmitStage,
  formatDayHeadingRu,
  formatProgressLine,
  formatQtyRu,
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
  /**
   * Без внешней шапки секции — для встраивания в общий «План работ».
   * Роль и календарь остаются, дублирующий title убирается.
   */
  embedded?: boolean
  /** Вызывается после любого изменения назначений (для пересчёта план/факт). */
  onAssignmentsChange?: (assignments: WorkDayAssignment[]) => void
}

type PlanPick = {
  number: string
  title: string
  total: number
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
        total: item.total,
        unitLabel: unitLabel(item.unit),
        unitId: item.unit,
      })
    }
  }
  return out
}

/** Типовые этапы по номеру строки плана — чтобы назначение было техн. грамотным. */
function defaultStagesForItem(item: PlanPick | null): Array<ReturnType<typeof newStageDraft>> {
  const u = item?.unitLabel ?? 'м²'
  const n = item?.number ?? ''
  if (n === '1.1' || n === '2.8' || n === '3.8') {
    return [
      {
        title: 'Планировка корыта',
        requirements: 'Геодезия отметок, уплотнение грунта основания.',
        plannedQty: 100,
        unit: u,
      },
      {
        title: 'Отсыпка песка 300 мм',
        requirements: 'Песок карьерный. Толщина 300 мм, послойно.',
        plannedQty: 100,
        unit: u,
      },
      {
        title: 'Уплотнение песка',
        requirements: 'Коэф. уплотнения по проекту. Контроль толщины.',
        plannedQty: 100,
        unit: u,
      },
    ]
  }
  if (n === '1.2' || n === '2.9' || n === '3.9') {
    return [
      {
        title: 'Щебень 20–40, толщина 200 мм',
        requirements: 'Фракция 20–40. После приёмки песчаного основания.',
        plannedQty: 100,
        unit: u,
      },
      {
        title: 'Уплотнение щебня',
        requirements: 'Укатка, контроль отметок.',
        plannedQty: 100,
        unit: u,
      },
    ]
  }
  if (n === '1.4') {
    return [
      {
        title: 'Демонтаж бортового камня',
        requirements: 'Аккуратный демонтаж, складирование, вывоз боя.',
        plannedQty: 40,
        unit: u,
      },
    ]
  }
  if (n === '1.3') {
    return [
      {
        title: 'Установка бортового камня',
        requirements: 'По шнуру, бетонное основание, швы. Высота бровки по проекту.',
        plannedQty: 40,
        unit: u,
      },
    ]
  }
  if (n === '1.5') {
    return [
      {
        title: 'Разработка грунта под бортовой камень',
        requirements: 'Корыто по отметкам, вывоз грунта.',
        plannedQty: 20,
        unit: u,
      },
    ]
  }
  if (n === '2.1') {
    return [
      {
        title: 'Разборка асфальтобетонного покрытия',
        requirements: 'Срезка покрытия, вывоз боя. Основание ровное.',
        plannedQty: 100,
        unit: u,
      },
    ]
  }
  if (n === '5.2') {
    return [
      {
        title: 'Разработка траншеи',
        requirements: 'Глубина и ширина по проекту.',
        plannedQty: 30,
        unit: u,
      },
    ]
  }
  if (n === '5.4' || n === '5.5') {
    return [
      {
        title: n === '5.4' ? 'Укладка трубы ПНД Ø63' : 'Укладка трубы ПНД Ø110',
        requirements: 'Стыковка, песчаная подсыпка.',
        plannedQty: 30,
        unit: u,
      },
    ]
  }
  if (n === '5.7') {
    return [
      {
        title: 'Прокладка кабеля',
        requirements: 'Протяжка в трубах, маркировка.',
        plannedQty: 30,
        unit: u,
      },
    ]
  }
  if (n.startsWith('3.')) {
    return [
      {
        title: item?.title ?? 'Асфальтовые работы',
        requirements: 'Температура смеси, уплотнение, контроль толщины.',
        plannedQty: 200,
        unit: u,
      },
    ]
  }
  return [
    {
      title: item?.title ?? 'Этап работ',
      requirements: '',
      plannedQty: 50,
      unit: u,
    },
  ]
}

function newStageDraft(): Omit<
  WorkDayStage,
  'id' | 'status' | 'media' | 'briefMedia' | 'actualQty' | 'submittedAtIso' | 'reviewedAtIso'
> {
  return {
    title: '',
    requirements: '',
    plannedQty: 0,
    unit: 'м²',
  }
}

export function SiteWorkDayPlanSection({
  siteId,
  siteName,
  workPlan,
  embedded = false,
  onAssignmentsChange,
}: Props) {
  const [role, setRole] = useState<WorkDayRole>('brigadier')
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
  }, [siteId, 'v11'])

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
      aria-labelledby={embedded ? undefined : 'work-day-plan-heading'}
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
              {siteName}: шаги на день. Начальник показывает фото места. Бригадир делает,
              снимает своё фото и нажимает «Я сделал».
            </p>
          </div>
        </header>
      )}

      {embedded ? (
        <div className={styles.embeddedIntro}>
          <div className={styles.embeddedIntroText}>
            <p className={styles.kicker}>
              <img className={styles.kickerMark} alt="" aria-hidden src="/brand-chevron.svg" />
              Задания дня
            </p>
            <h3 className={styles.embeddedTitle}>Календарь заданий</h3>
            <p className={styles.embeddedLead}>
              Шаг за шагом: что сделать. Начальник прикладывает фото или видео места.
              Бригадир смотрит, делает, снимает своё фото и нажимает «Я сделал».
            </p>
          </div>
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
function formatStageBrief(s: WorkDayStage): string {
  return s.title.trim()
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
                    {a.stages.map((s, i) => {
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
                            <span className={styles.taskStepLabel}>Шаг {i + 1}.</span>{' '}
                            {formatStageBrief(s)}
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
  onClose,
  onSubmit,
  onAttachBrief,
  onDelete,
}: {
  assignment: WorkDayAssignment
  role: WorkDayRole
  allAssignments: WorkDayAssignment[]
  onClose: () => void
  onSubmit: (assignmentId: string, stageId: string, qty: number, media: WorkDayMedia[]) => void
  onAttachBrief: (assignmentId: string, stageId: string, media: WorkDayMedia[]) => void
  onDelete: () => void
}) {
  const accepted = acceptedQtyForPlanItem(allAssignments, assignment.planItemNumber)
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
          <div>
            <p className={styles.dialogKicker}>Где работать</p>
            <h3 className={styles.dialogTitle}>{assignment.area}</h3>
            <p className={styles.dialogMeta}>
              {formatDayHeadingRu(assignment.dateKey)}
              {role === 'manager' ? ` · ${assignment.brigadierName}` : null}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        {role === 'brigadier' ? (
          <p className={styles.dialogProgress}>
            {prog.allDone
              ? 'Все шаги сделаны. Можно закрыть.'
              : `Сделай шаги по порядку. Готово: ${prog.doneStages} из ${prog.totalStages}.`}
          </p>
        ) : (
          <>
            <p className={styles.dialogProgress}>
              Шаги: {prog.doneStages} из {prog.totalStages}
              {prog.allDone ? ' · задание закрыто' : null}
            </p>
            <p className={styles.dialogProgressSub}>
              {formatProgressLine(accepted, assignment.planTotalQty, assignment.planUnit)}
            </p>
          </>
        )}
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

        <ol className={styles.stageList}>
          {assignment.stages.map((stage, index) => {
            const isDone = stage.status === 'done' || stage.status === 'submitted'
            const canWork =
              role === 'brigadier' && (stage.status === 'open' || stage.status === 'locked')
            const draftMedia = mediaByStage[stage.id] ?? []
            const factMedia = stage.media.length ? stage.media : draftMedia
            const brief = stage.briefMedia ?? []
            const qtyStr =
              qtyByStage[stage.id] ??
              (stage.actualQty != null
                ? String(stage.actualQty)
                : String(stage.plannedQty))
            const qtyNum = Number(qtyStr.replace(',', '.'))
            const canSend = canSubmitStage(
              { ...stage, media: factMedia },
              Number.isFinite(qtyNum) ? qtyNum : 0,
            )
            const isFocus = prog.openStage?.id === stage.id

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
                  <span className={styles.stageIndex}>Шаг {index + 1}</span>
                  {isDone ? (
                    <span className={styles.badgeDone}>
                      <CheckIcon /> Сделано
                    </span>
                  ) : null}
                </div>
                <h4 className={styles.stageTitle}>{stage.title}</h4>

                {brief.length > 0 ? (
                  <div className={styles.mediaBlock}>
                    <p className={styles.mediaCaption}>
                      Смотри: что делать и где
                    </p>
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
                  <p className={styles.hint}>
                    Начальник ещё не приложил фото места. Делай, как написано в шаге.
                  </p>
                ) : null}

                {isDone && stage.media.length > 0 ? (
                  <div className={styles.mediaBlock}>
                    <p className={styles.mediaCaption}>Твоё фото — что сделал</p>
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
                  <div className={styles.managerActions}>
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
                      Фото или видео: что делать и где
                    </button>
                    <p className={styles.hint}>
                      Бригадир увидит это в шаге. Покажи место и как должно выглядеть.
                    </p>
                  </div>
                ) : null}

                {canWork ? (
                  <div className={styles.brigadierActions}>
                    <label className={styles.field}>
                      <span>Сколько сделал ({stage.unit})</span>
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
                      Сфотографируй, что сделал
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
                      <p className={styles.hint}>Нужно хотя бы одно своё фото или видео.</p>
                    )}
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
                      Я сделал
                    </button>
                  </div>
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
  const initial =
    planItems.find((p) => p.number === '2.8') ?? planItems[0] ?? null
  const [dateKey, setDateKey] = useState(defaultDateKey)
  const [area, setArea] = useState('Участок А')
  const [brigadierName, setBrigadierName] = useState('Минасян А.Л.')
  const [selectedNumber, setSelectedNumber] = useState(initial?.number ?? '')
  const selected = planItems.find((p) => p.number === selectedNumber) ?? null
  const [planItemTitle, setPlanItemTitle] = useState(initial?.title ?? '')
  const [planTotalQty, setPlanTotalQty] = useState(String(initial?.total ?? 0))
  const [planUnit, setPlanUnit] = useState(initial?.unitLabel ?? 'м²')
  const [stages, setStages] = useState(() => defaultStagesForItem(initial))
  const [briefByIndex, setBriefByIndex] = useState<Record<number, WorkDayMedia[]>>({})
  const briefCreateRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const applyPlanItem = (number: string) => {
    setSelectedNumber(number)
    const item = planItems.find((p) => p.number === number) ?? null
    if (!item) return
    setPlanItemTitle(item.title)
    setPlanTotalQty(String(item.total))
    setPlanUnit(item.unitLabel)
    setStages(defaultStagesForItem(item))
    setBriefByIndex({})
  }

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
          <h3 className={styles.dialogTitle}>Задание бригадиру</h3>
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
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Строка производственного плана</span>
            {planItems.length > 0 ? (
              <select value={selectedNumber} onChange={(e) => applyPlanItem(e.target.value)}>
                {planItems.map((p) => (
                  <option key={p.number} value={p.number}>
                    {p.number} — {p.title} ({formatQtyRu(p.total)} {p.unitLabel})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={selectedNumber}
                onChange={(e) => setSelectedNumber(e.target.value)}
                placeholder="№ строки"
              />
            )}
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Вид работ</span>
            <input value={planItemTitle} onChange={(e) => setPlanItemTitle(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Общий план по строке</span>
            <input
              type="number"
              value={planTotalQty}
              onChange={(e) => setPlanTotalQty(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Ед. изм.</span>
            <input value={planUnit} onChange={(e) => setPlanUnit(e.target.value)} />
          </label>
        </div>

        <h4 className={styles.stagesHeading}>
          Шаги на день — напишите просто, что сделать
        </h4>
        {stages.map((s, i) => (
          <div key={i} className={styles.stageEdit}>
            <p className={styles.stageIndex}>Шаг {i + 1}</p>
            <label className={styles.field}>
              <span>Что сделать</span>
              <input
                value={s.title}
                onChange={(e) =>
                  setStages((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, title: e.target.value } : row)),
                  )
                }
                placeholder="например: Уложить трубу 63 на 40 метров"
              />
            </label>
            <label className={styles.field}>
              <span>Коротко, если нужно</span>
              <input
                value={s.requirements}
                onChange={(e) =>
                  setStages((prev) =>
                    prev.map((row, j) =>
                      j === i ? { ...row, requirements: e.target.value } : row,
                    ),
                  )
                }
                placeholder="не обязательно"
              />
            </label>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Сколько на сегодня</span>
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
                const files = e.target.files
                if (!files?.length) return
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
          </div>
        ))}
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() =>
            setStages((p) => [
              ...p,
              {
                ...newStageDraft(),
                unit: selected?.unitLabel ?? (planUnit || 'м²'),
              },
            ])
          }
        >
          + Добавить шаг
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
              unit: s.unit.trim() || planUnit || 'м²',
              actualQty: null,
              status: 'open',
              media: [],
              briefMedia: briefByIndex[i] ?? [],
              submittedAtIso: null,
              reviewedAtIso: null,
            }))
            onSave({
              id: newId('asg'),
              siteId,
              dateKey,
              area: area.trim(),
              brigadierName: brigadierName.trim(),
              planItemNumber: (selectedNumber || selected?.number || '—').trim(),
              planItemTitle: planItemTitle.trim(),
              planTotalQty: Number(planTotalQty) || 0,
              planUnit: planUnit.trim() || 'м²',
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
