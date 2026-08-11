import {
  newId,
  toDateKey,
  type WorkDayAssignment,
  type WorkDayPlanBundle,
  type WorkDayStage,
} from '../domain/workDayPlan'

/** v2 — обновлённый демо-календарь (логичная последовательность по плану). */
const storageKey = (siteId: string) => `deloresh.work-day-plan.v2.${siteId}`

function readRaw(siteId: string): WorkDayPlanBundle | null {
  try {
    const raw = localStorage.getItem(storageKey(siteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkDayPlanBundle
    if (!parsed || parsed.siteId !== siteId || !Array.isArray(parsed.assignments)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeRaw(bundle: WorkDayPlanBundle): void {
  localStorage.setItem(storageKey(bundle.siteId), JSON.stringify(bundle))
}

function stage(
  partial: Omit<WorkDayStage, 'id' | 'media' | 'actualQty' | 'submittedAtIso' | 'reviewedAtIso'> &
    Partial<Pick<WorkDayStage, 'actualQty' | 'submittedAtIso' | 'reviewedAtIso' | 'media'>>,
): WorkDayStage {
  return {
    id: newId('stage'),
    media: partial.media ?? [],
    actualQty: partial.actualQty ?? null,
    submittedAtIso: partial.submittedAtIso ?? null,
    reviewedAtIso: partial.reviewedAtIso ?? null,
    title: partial.title,
    requirements: partial.requirements,
    plannedQty: partial.plannedQty,
    unit: partial.unit,
    status: partial.status,
  }
}

/**
 * Демо-неделя для Брусилово: порядок работ как на объекте.
 * 1) демонтаж бордюра → 2) разборка тротуара → 3) песок (цепочка этапов)
 * → 4) щебень → параллельно КК на другом участке.
 */
function buildDemoAssignments(siteId: string): WorkDayAssignment[] {
  const today = new Date()
  const key = (offset: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + offset)
    return toDateKey(d)
  }
  const nowIso = () => new Date().toISOString()

  const base = (
    dateKey: string,
    area: string,
    plan: {
      number: string
      title: string
      total: number
      unit: string
    },
    stages: WorkDayStage[],
  ): WorkDayAssignment => ({
    id: newId('asg'),
    siteId,
    dateKey,
    area,
    brigadierName: 'Минасян А.Л.',
    planItemNumber: plan.number,
    planItemTitle: plan.title,
    planTotalQty: plan.total,
    planUnit: plan.unit,
    stages,
    createdAtIso: nowIso(),
  })

  // Вчера: демонтаж бордюра — уже сдан, ждёт приёмки (для роли руководителя).
  const yesterdayCurb = base(
    key(-1),
    'Участок А — чётная сторона, пикет 12–18',
    {
      number: '1.3',
      title: 'Демонтаж бортового камня',
      total: 15461,
      unit: 'м',
    },
    [
      stage({
        title: 'Демонтаж бортового камня',
        requirements: 'Аккуратный демонтаж без повреждения соседних элементов. Складирование.',
        plannedQty: 42,
        unit: 'м',
        status: 'submitted',
        actualQty: 42,
        submittedAtIso: nowIso(),
        media: [],
      }),
    ],
  )

  // Позавчера: разборка тротуара — выполнено.
  const twoDaysAgoSidewalk = base(
    key(-2),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.1',
      title: 'Разборка покрытия тротуаров',
      total: 28637,
      unit: 'м²',
    },
    [
      stage({
        title: 'Разборка покрытия',
        requirements: 'Срезка покрытия, вывоз боя. Основание под песок ровное.',
        plannedQty: 120,
        unit: 'м²',
        status: 'done',
        actualQty: 118,
        submittedAtIso: nowIso(),
        reviewedAtIso: nowIso(),
      }),
    ],
  )

  // Сегодня: песчаное основание — 3 этапа (технологическая цепочка).
  const todaySand = base(
    key(0),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.2',
      title: 'Устройство песчаного основания',
      total: 28641,
      unit: 'м²',
    },
    [
      stage({
        title: 'Планировка корыта',
        requirements: 'Геодезия отметок, уплотнение грунта основания.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
      }),
      stage({
        title: 'Отсыпка песка 300 мм',
        requirements: 'Песок карьерный. Толщина 300 мм, послойно.',
        plannedQty: 100,
        unit: 'м²',
        status: 'locked',
      }),
      stage({
        title: 'Уплотнение песка',
        requirements: 'Коэф. уплотнения по проекту. Контроль толщины.',
        plannedQty: 100,
        unit: 'м²',
        status: 'locked',
      }),
    ],
  )

  // Сегодня параллельно: кабельная канализация на другом участке.
  const todayCable = base(
    key(0),
    'Участок В — вдоль проезжей части',
    {
      number: '5.1',
      title: 'Кабельная канализация (КК)',
      total: 8734,
      unit: 'м',
    },
    [
      stage({
        title: 'Рытьё траншеи под КК',
        requirements: 'Глубина и ширина по проекту. Крепление стенок при необходимости.',
        plannedQty: 35,
        unit: 'м',
        status: 'open',
      }),
      stage({
        title: 'Укладка труб КК',
        requirements: 'Стыковка, песчаная подсыпка, маркировка.',
        plannedQty: 35,
        unit: 'м',
        status: 'locked',
      }),
    ],
  )

  // Завтра: щебень — только после песка (отдельная строка плана 2.3).
  const tomorrowCrushed = base(
    key(1),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.3',
      title: 'Устройство основания из щебня / бетона / ЩПС',
      total: 28641,
      unit: 'м²',
    },
    [
      stage({
        title: 'Щебень 20–40, толщина 200 мм',
        requirements: 'Фракция 20–40. После приёмки песчаного основания на участке.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
      }),
      stage({
        title: 'Уплотнение щебня',
        requirements: 'Укатка, контроль отметок.',
        plannedQty: 100,
        unit: 'м²',
        status: 'locked',
      }),
    ],
  )

  // Послезавтра: установка бетонного бордюра на месте демонтажа.
  const dayAfterCurb = base(
    key(2),
    'Участок А — чётная сторона, пикет 12–18',
    {
      number: '1.1',
      title: 'Бетон',
      total: 15461,
      unit: 'м',
    },
    [
      stage({
        title: 'Установка бортового камня бетонного',
        requirements: 'По шнуру, бетонное основание, швы. Высота бровки по проекту.',
        plannedQty: 42,
        unit: 'м',
        status: 'open',
      }),
    ],
  )

  return [todaySand, todayCable, tomorrowCrushed, dayAfterCurb, yesterdayCurb, twoDaysAgoSidewalk]
}

export function loadWorkDayPlan(siteId: string): WorkDayPlanBundle {
  const existing = readRaw(siteId)
  if (existing) return existing
  const seed: WorkDayPlanBundle = {
    siteId,
    assignments: siteId === 'brusilova' ? buildDemoAssignments(siteId) : [],
  }
  writeRaw(seed)
  return seed
}

export function saveWorkDayPlan(bundle: WorkDayPlanBundle): void {
  writeRaw(bundle)
}

export function upsertAssignment(
  siteId: string,
  assignment: WorkDayAssignment,
): WorkDayPlanBundle {
  const bundle = loadWorkDayPlan(siteId)
  const idx = bundle.assignments.findIndex((a) => a.id === assignment.id)
  const next =
    idx >= 0
      ? bundle.assignments.map((a, i) => (i === idx ? assignment : a))
      : [assignment, ...bundle.assignments]
  const updated = { ...bundle, assignments: next }
  saveWorkDayPlan(updated)
  return updated
}

export function removeAssignment(siteId: string, assignmentId: string): WorkDayPlanBundle {
  const bundle = loadWorkDayPlan(siteId)
  const updated = {
    ...bundle,
    assignments: bundle.assignments.filter((a) => a.id !== assignmentId),
  }
  saveWorkDayPlan(updated)
  return updated
}
