/**
 * Ежедневный план работ (прототип).
 *
 * Руководитель ставит бригадиру пункты справки и объём на дату.
 * Этот объём сразу занимает строку плана и вычитается из остатка.
 * Бригадир не выбирает работу: видит готовый пункт, пишет сколько сделал,
 * прикладывает фото или видео и нажимает «Я сделал».
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
  /**
   * Пункт справки план/факт. Если не задан — берём `planItemNumber` задания.
   * Нужен, чтобы в одном задании были разные работы (траншея + труба),
   * и бригадир не выбирал строку сам.
   */
  planItemNumber?: string
  planItemTitle?: string
  /** Фото/видео факта от бригадира. */
  media: readonly WorkDayMedia[]
  /**
   * Пояснение начальника объекта: фото или видео «что сделать и где».
   * Бригадир только смотрит, сдать это нельзя.
   */
  briefMedia: readonly WorkDayMedia[]
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

export function stagePlanNumber(
  assignment: WorkDayAssignment,
  stage: WorkDayStage,
): string {
  const n = stage.planItemNumber?.trim()
  return n || assignment.planItemNumber.trim()
}

export function stagePlanTitle(
  assignment: WorkDayAssignment,
  stage: WorkDayStage,
): string {
  const t = stage.planItemTitle?.trim()
  return t || assignment.planItemTitle.trim()
}

/** Сколько объёма шага занимает строку плана. */
export function stageIssuedQty(stage: WorkDayStage): number {
  if (stage.status === 'done' && stage.actualQty != null && stage.actualQty > 0) {
    return stage.actualQty
  }
  return stage.plannedQty > 0 ? stage.plannedQty : 0
}

/**
 * Объём задания по одной строке плана.
 * Несколько шагов одной работы (траншея → труба → засыпка на той же захватке)
 * не суммируются: берём максимум, иначе 3 шага по 100 м превратятся в 300.
 */
export function issuedQtyInAssignment(
  assignment: WorkDayAssignment,
  planItemNumber: string,
): number {
  const want = planItemNumber.trim()
  if (!want) return 0
  let max = 0
  for (const s of assignment.stages) {
    if (stagePlanNumber(assignment, s) !== want) continue
    max = Math.max(max, stageIssuedQty(s))
  }
  return max
}

/** Объём, уже занятый заданиями по строке плана (вычитается сразу при постановке). */
export function issuedQtyForPlanItem(
  assignments: readonly WorkDayAssignment[],
  planItemNumber: string,
): number {
  let sum = 0
  for (const a of assignments) {
    sum += issuedQtyInAssignment(a, planItemNumber)
  }
  return sum
}

/** Занятые объёмы по всем строкам плана — для справки план/факт. */
export function issuedQtyByPlanItemMap(
  assignments: readonly WorkDayAssignment[],
): Map<string, number> {
  const numbers = new Set<string>()
  for (const a of assignments) {
    const head = a.planItemNumber.trim()
    if (head) numbers.add(head)
    for (const s of a.stages) {
      const n = stagePlanNumber(a, s)
      if (n) numbers.add(n)
    }
  }
  const map = new Map<string, number>()
  for (const n of numbers) {
    const qty = issuedQtyForPlanItem(assignments, n)
    if (qty > 0) map.set(n, qty)
  }
  return map
}

/** @deprecated используйте issuedQtyForPlanItem — объём занимает план сразу. */
export function acceptedQtyForPlanItem(
  assignments: readonly WorkDayAssignment[],
  planItemNumber: string,
): number {
  return issuedQtyForPlanItem(assignments, planItemNumber)
}

/** @deprecated используйте issuedQtyByPlanItemMap. */
export function acceptedQtyByPlanItemMap(
  assignments: readonly WorkDayAssignment[],
): Map<string, number> {
  return issuedQtyByPlanItemMap(assignments)
}

export function formatWorkPointLine(
  number: string,
  title: string,
  qty: number,
  unit: string,
): string {
  const point = number.trim() ? `Пункт ${number.trim()}. ` : ''
  const amount = qty > 0 ? ` — ${formatQtyRu(qty)} ${unit}` : ''
  return `${point}${title.trim()}${amount}`
}

export function uniqueStagesByPlanItem(
  assignment: WorkDayAssignment,
): WorkDayStage[] {
  const seen = new Set<string>()
  const out: WorkDayStage[] = []
  for (const s of assignment.stages) {
    const n = stagePlanNumber(assignment, s)
    const key = n || s.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function collapseDuplicatePlanStages(assignment: WorkDayAssignment): WorkDayAssignment {
  const stages = uniqueStagesByPlanItem(assignment)
  if (stages.length === assignment.stages.length) return assignment
  return { ...assignment, stages }
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

/** Начальник объекта прикладывает к шагу фото/видео: что делать и где. */
export function attachStageBrief(
  assignment: WorkDayAssignment,
  stageId: string,
  media: readonly WorkDayMedia[],
): WorkDayAssignment {
  if (media.length === 0) return assignment
  return {
    ...assignment,
    stages: assignment.stages.map((s) =>
      s.id === stageId
        ? { ...s, briefMedia: [...(s.briefMedia ?? []), ...media] }
        : s,
    ),
  }
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
  const unlocked = next.stages.map((s) => {
    const status = s.status === 'locked' ? ('open' as const) : s.status
    const briefMedia = s.briefMedia ?? []
    const planItemNumber = s.planItemNumber?.trim() || next.planItemNumber
    const planItemTitle = s.planItemTitle?.trim() || next.planItemTitle
    if (
      status === s.status &&
      briefMedia === s.briefMedia &&
      planItemNumber === s.planItemNumber &&
      planItemTitle === s.planItemTitle
    ) {
      return s
    }
    return { ...s, status, briefMedia, planItemNumber, planItemTitle }
  })
  const withUnlocked = unlocked.every((s, i) => s === next.stages[i])
    ? next
    : { ...next, stages: unlocked }
  return collapseDuplicatePlanStages(withUnlocked)
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
