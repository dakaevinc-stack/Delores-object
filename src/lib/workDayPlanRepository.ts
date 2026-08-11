import {
  newId,
  settleAssignment,
  toDateKey,
  type WorkDayAssignment,
  type WorkDayPlanBundle,
  type WorkDayStage,
} from '../domain/workDayPlan'

/** v5 — все этапы сразу доступны, без очереди и проверки. */
const storageKey = (siteId: string) => `deloresh.work-day-plan.v5.${siteId}`

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

  // Вчера: демонтаж бордюра — выполнено.
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
        title: 'Демонтировать бортовой камень на участке 42 м',
        requirements: 'Аккуратный демонтаж, складирование.',
        plannedQty: 42,
        unit: 'м',
        status: 'done',
        actualQty: 42,
        submittedAtIso: nowIso(),
        reviewedAtIso: nowIso(),
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
        title: 'Разобрать покрытие тротуара на участке ~120 м²',
        requirements: 'Срезка покрытия, вывоз боя.',
        plannedQty: 120,
        unit: 'м²',
        status: 'done',
        actualQty: 118,
        submittedAtIso: nowIso(),
        reviewedAtIso: nowIso(),
      }),
    ],
  )

  // Сегодня: песчаное основание — короткие шаги.
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
        title: 'Спланировать корыто на участке длиной 100 м и шириной 3 м',
        requirements: 'Геодезия отметок, уплотнение грунта.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
      }),
      stage({
        title:
          'Устроить песчаное основание толщиной 30 см на длине 100 м и ширине 3 м',
        requirements: 'Песок карьерный, послойно.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
      }),
      stage({
        title: 'Уплотнить песчаное основание',
        requirements: 'Коэффициент уплотнения по проекту.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
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
        title: 'Вырыть траншею под КК длиной 35 м',
        requirements: 'Глубина и ширина по проекту.',
        plannedQty: 35,
        unit: 'м',
        status: 'open',
      }),
      stage({
        title: 'Уложить трубы КК на длине 35 м',
        requirements: 'Стыковка, песчаная подсыпка.',
        plannedQty: 35,
        unit: 'м',
        status: 'open',
      }),
    ],
  )

  // Завтра: щебень.
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
        title:
          'Устроить основание из щебня фракции 20–40 толщиной 20 см на участке длиной 100 м и шириной 3 м',
        requirements: 'Фракция 20–40, послойно.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
      }),
      stage({
        title: 'Уплотнить щебёночное основание',
        requirements: 'Укатка, контроль отметок.',
        plannedQty: 100,
        unit: 'м²',
        status: 'open',
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
        title: 'Установить бортовой камень бетонный на участке 42 м',
        requirements: 'По шнуру, бетонное основание, швы.',
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
  if (existing) {
    const settled = {
      ...existing,
      assignments: existing.assignments.map(settleAssignment),
    }
    const changed = settled.assignments.some(
      (a, i) => a !== existing.assignments[i],
    )
    if (changed) writeRaw(settled)
    return settled
  }
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
