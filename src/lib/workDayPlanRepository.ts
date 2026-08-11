import {
  newId,
  toDateKey,
  type WorkDayAssignment,
  type WorkDayPlanBundle,
  type WorkDayStage,
} from '../domain/workDayPlan'

const storageKey = (siteId: string) => `deloresh.work-day-plan.v1.${siteId}`

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

/**
 * Демо-цепочка «песок → щебень» на сегодня и завтра для кликабельного
 * прототипа. Первый этап открыт, второй заблокирован.
 */
function buildDemoAssignments(siteId: string): WorkDayAssignment[] {
  const today = toDateKey(new Date())
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = toDateKey(tomorrowDate)

  const sandThenCrushed = (dateKey: string, area: string): WorkDayAssignment => {
    const stages: WorkDayStage[] = [
      {
        id: newId('stage'),
        title: 'Песчаное основание 300 мм',
        requirements: 'Песок карьерный, уплотнение послойно. Толщина 300 мм.',
        plannedQty: 100,
        unit: 'м',
        actualQty: null,
        status: 'open',
        media: [],
        submittedAtIso: null,
        reviewedAtIso: null,
      },
      {
        id: newId('stage'),
        title: 'Щебень 20–40, толщина 200 мм',
        requirements: 'Фракция 20–40. Толщина 200 мм. Доступен после приёмки песка.',
        plannedQty: 100,
        unit: 'м',
        actualQty: null,
        status: 'locked',
        media: [],
        submittedAtIso: null,
        reviewedAtIso: null,
      },
    ]
    return {
      id: newId('asg'),
      siteId,
      dateKey,
      area,
      brigadierName: 'Минасян А.Л.',
      planItemNumber: '2.2',
      planItemTitle: 'Устройство песчаного основания',
      planTotalQty: 28641,
      planUnit: 'м²',
      stages,
      createdAtIso: new Date().toISOString(),
    }
  }

  return [
    sandThenCrushed(today, 'Участок А — тротуар, чётная сторона'),
    {
      ...sandThenCrushed(tomorrow, 'Участок Б — тротуар у подъезда 3'),
      planItemNumber: '2.3',
      planItemTitle: 'Устройство основания из щебня / бетона / ЩПС',
      planTotalQty: 28641,
      planUnit: 'м²',
      stages: [
        {
          id: newId('stage'),
          title: 'Щебень 20–40, толщина 200 мм',
          requirements: 'Подготовка основания. Фракция 20–40.',
          plannedQty: 80,
          unit: 'м',
          actualQty: null,
          status: 'open',
          media: [],
          submittedAtIso: null,
          reviewedAtIso: null,
        },
      ],
    },
  ]
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
