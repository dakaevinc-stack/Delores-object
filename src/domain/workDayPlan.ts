/**
 * Ежедневный план работ (прототип).
 *
 * Руководитель назначает бригадиру этапы на дату.
 * Все этапы доступны сразу — без очереди и без согласования.
 * Бригадир сдаёт факт с фото/видео → сразу «Выполнено», объём
 * идёт в план/факт объекта.
 */

export type WorkDayRole = 'manager' | 'brigadier'

export type WorkDayMedia = {
  id: string
  kind: 'photo' | 'video'
  name: string
  previewUrl: string
}

export type WorkDayStageStatus = 'locked' | 'open' | 'submitted' | 'done'

export type WorkDayStage = {
  id: string
  title: string
  /** Требования / спецификация (толщина, фракция и т.п.). */
  requirements: string
  plannedQty: number
  unit: string
  /** Фактический объём, который сдал бригадир. */
  actualQty: number | null
  status: WorkDayStageStatus
  media: readonly WorkDayMedia[]
  submittedAtIso: string | null
  reviewedAtIso: string | null
}

export type WorkDayAssignment = {
  id: string
  siteId: string
  /** Календарный день YYYY-MM-DD (локальный). */
  dateKey: string
  area: string
  brigadierName: string
  /** Привязка к строке общего плана — для прогресса «выполнено / осталось». */
  planItemNumber: string
  planItemTitle: string
  planTotalQty: number
  planUnit: string
  stages: WorkDayStage[]
  createdAtIso: string
}

export type WorkDayPlanBundle = {
  siteId: string
  assignments: WorkDayAssignment[]
}

export function formatQtyRu(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)
}

export function formatProgressLine(
  done: number,
  total: number,
  unit: string,
): string {
  const left = Math.max(0, total - done)
  return `Выполнено ${formatQtyRu(done)} из ${formatQtyRu(total)} ${unit} — осталось ${formatQtyRu(left)} ${unit}`
}

/** Сумма принятых (done) объёмов по строке плана. */
export function acceptedQtyForPlanItem(
  assignments: readonly WorkDayAssignment[],
  planItemNumber: string,
): number {
  let sum = 0
  for (const a of assignments) {
    if (a.planItemNumber !== planItemNumber) continue
    for (const s of a.stages) {
      if (s.status === 'done' && s.actualQty != null) sum += s.actualQty
    }
  }
  return sum
}

/** Принятые объёмы по всем строкам плана (для сводки план/факт). */
export function acceptedQtyByPlanItemMap(
  assignments: readonly WorkDayAssignment[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of assignments) {
    for (const s of a.stages) {
      if (s.status !== 'done' || s.actualQty == null) continue
      const prev = map.get(a.planItemNumber) ?? 0
      map.set(a.planItemNumber, prev + s.actualQty)
    }
  }
  return map
}

export function assignmentProgress(a: WorkDayAssignment): {
  doneStages: number
  totalStages: number
  openStage: WorkDayStage | null
  allDone: boolean
} {
  const totalStages = a.stages.length
  const doneStages = a.stages.filter((s) => s.status === 'done').length
  const openStage = a.stages.find((s) => s.status === 'open') ?? null
  return {
    doneStages,
    totalStages,
    openStage,
    allDone: totalStages > 0 && doneStages === totalStages,
  }
}

export function canSubmitStage(stage: WorkDayStage, actualQty: number): boolean {
  if (stage.status !== 'open' && stage.status !== 'locked') return false
  if (!(actualQty > 0)) return false
  return stage.media.length > 0
}

/**
 * Сдача этапа бригадиром: сразу «Выполнено».
 * Согласование не требуется; объём сразу учитывается в план/факт.
 */
export function submitStage(
  assignment: WorkDayAssignment,
  stageId: string,
  actualQty: number,
  media: readonly WorkDayMedia[],
  submittedAtIso = new Date().toISOString(),
): WorkDayAssignment {
  if (!(actualQty > 0) || media.length === 0) return assignment
  const idx = assignment.stages.findIndex((s) => s.id === stageId)
  if (idx < 0) return assignment
  const cur = assignment.stages[idx]!
  // open или устаревший locked — можно закрыть без очереди.
  if (cur.status !== 'open' && cur.status !== 'locked') return assignment

  const nextStages = assignment.stages.map((s, i) => {
    if (i !== idx) return s
    return {
      ...s,
      actualQty,
      media: [...media],
      status: 'done' as const,
      submittedAtIso,
      reviewedAtIso: submittedAtIso,
    }
  })
  return { ...assignment, stages: nextStages }
}

/**
 * Миграция старых данных: этап «на проверке» → выполнено.
 */
export function approveStage(
  assignment: WorkDayAssignment,
  stageId: string,
  reviewedAtIso = new Date().toISOString(),
): WorkDayAssignment {
  const idx = assignment.stages.findIndex((s) => s.id === stageId)
  if (idx < 0) return assignment
  const stage = assignment.stages[idx]!
  if (stage.status !== 'submitted') return assignment

  return {
    ...assignment,
    stages: assignment.stages.map((s, i) =>
      i === idx ? { ...s, status: 'done' as const, reviewedAtIso } : s,
    ),
  }
}

/** Убирает очередь и проверку: submitted→done, locked→open. */
export function settleAssignment(assignment: WorkDayAssignment): WorkDayAssignment {
  let next = assignment
  for (const s of assignment.stages) {
    if (s.status === 'submitted') {
      next = approveStage(next, s.id, s.submittedAtIso ?? new Date().toISOString())
    }
  }
  const unlocked = next.stages.map((s) =>
    s.status === 'locked' ? { ...s, status: 'open' as const } : s,
  )
  if (unlocked.every((s, i) => s === next.stages[i])) return next
  return { ...next, stages: unlocked }
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateKey(key: string): Date {
  const d = new Date(`${key}T12:00:00`)
  return Number.isFinite(d.getTime()) ? d : new Date()
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function startOfWeekMon(d: Date): Date {
  const x = startOfLocalDay(d)
  const day = x.getDay() // 0 вс … 6 сб
  const diff = day === 0 ? -6 : 1 - day
  return addDays(x, diff)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function formatDayHeadingRu(key: string): string {
  const d = parseDateKey(key)
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatShortDayRu(key: string): string {
  const d = parseDateKey(key)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function weekdayShortRu(d: Date): string {
  return d
    .toLocaleDateString('ru-RU', { weekday: 'short' })
    .replace(/\.$/, '')
}

export function newId(prefix = 'wd'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
