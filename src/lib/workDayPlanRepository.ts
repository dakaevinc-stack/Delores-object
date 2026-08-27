import {
  newId,
  settleAssignment,
  toDateKey,
  type WorkDayAssignment,
  type WorkDayMedia,
  type WorkDayPlanBundle,
  type WorkDayStage,
} from '../domain/workDayPlan'
import {
  fetchWorkDayPlanRemote,
  putWorkDayPlanRemote,
  uploadWorkDayMediaRemote,
  workDayMediaBlobUrl,
} from './siteFormsApi'

/** v12 — один пункт справки = один шаг, без дублей одной работы. */
const storageKey = (siteId: string) => `deloresh.work-day-plan.v12.${siteId}`

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

function writeLocal(bundle: WorkDayPlanBundle): void {
  try {
    localStorage.setItem(storageKey(bundle.siteId), JSON.stringify(bundle))
  } catch {
    /* quota — сервер остаётся источником правды */
  }
}

function normalizeBundle(siteId: string, raw: unknown): WorkDayPlanBundle | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as WorkDayPlanBundle
  if (r.siteId !== siteId || !Array.isArray(r.assignments)) return null
  return {
    siteId,
    assignments: r.assignments.map(settleAssignment),
  }
}

/** На другом устройстве пустой previewUrl = файл лежит на сервере. */
export function resolveWorkDayMedia(siteId: string, media: WorkDayMedia): WorkDayMedia {
  if (media.previewUrl && !media.previewUrl.startsWith('blob:')) return media
  return { ...media, previewUrl: workDayMediaBlobUrl(siteId, media.id) }
}

export function resolveWorkDayBundle(
  siteId: string,
  bundle: WorkDayPlanBundle,
): WorkDayPlanBundle {
  return {
    siteId,
    assignments: bundle.assignments.map((a) => ({
      ...a,
      stages: a.stages.map((s) => ({
        ...s,
        media: s.media.map((m) => resolveWorkDayMedia(siteId, m)),
        briefMedia: (s.briefMedia ?? []).map((m) => resolveWorkDayMedia(siteId, m)),
      })),
    })),
  }
}

async function blobFromPreviewUrl(previewUrl: string): Promise<Blob | null> {
  if (!previewUrl || previewUrl.startsWith('blob:')) {
    /* blob: на другом устройстве мёртв; локально ещё можно fetch */
    if (!previewUrl.startsWith('blob:')) return null
  }
  try {
    const res = await fetch(previewUrl)
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

async function uploadMediaList(
  siteId: string,
  list: readonly WorkDayMedia[],
): Promise<{ light: WorkDayMedia[]; allOk: boolean }> {
  const light: WorkDayMedia[] = []
  let allOk = true
  for (const m of list) {
    const needsUpload =
      !m.previewUrl ||
      m.previewUrl.startsWith('data:') ||
      m.previewUrl.startsWith('blob:')
    if (!needsUpload) {
      light.push({ ...m, previewUrl: '' })
      continue
    }
    const blob = await blobFromPreviewUrl(m.previewUrl)
    if (!blob) {
      allOk = false
      light.push({ ...m, previewUrl: '' })
      continue
    }
    const ok = await uploadWorkDayMediaRemote(
      siteId,
      { id: m.id, kind: m.kind, name: m.name, mime: blob.type },
      blob,
    )
    if (!ok) allOk = false
    light.push({ ...m, previewUrl: '' })
  }
  return { light, allOk }
}

/**
 * Локально оставляем preview (чтобы UI не мигал), на сервер — лёгкий JSON
 * без data:/blob:, файлы отдельно в /work-day-media.
 */
export async function persistWorkDayPlan(bundle: WorkDayPlanBundle): Promise<boolean> {
  writeLocal(bundle)
  let allOk = true
  const lightAssignments: WorkDayAssignment[] = []
  for (const a of bundle.assignments) {
    const stages: WorkDayStage[] = []
    for (const s of a.stages) {
      const fact = await uploadMediaList(bundle.siteId, s.media)
      const brief = await uploadMediaList(bundle.siteId, s.briefMedia ?? [])
      if (!fact.allOk || !brief.allOk) allOk = false
      stages.push({
        ...s,
        media: fact.light,
        briefMedia: brief.light,
      })
    }
    lightAssignments.push({ ...a, stages })
  }
  const putOk = await putWorkDayPlanRemote(bundle.siteId, {
    siteId: bundle.siteId,
    assignments: lightAssignments,
  })
  return allOk && putOk
}

function briefPhoto(label: string, sub: string): WorkDayMedia {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520">
    <rect fill="#172a4d" width="100%" height="100%"/>
    <rect fill="#ee2d3a" x="0" y="0" width="12" height="520"/>
    <text x="48" y="230" fill="#ffffff" font-size="36" font-family="Arial, sans-serif">${label}</text>
    <text x="48" y="280" fill="#d7deea" font-size="22" font-family="Arial, sans-serif">${sub}</text>
    <text x="48" y="430" fill="#9aa7bc" font-size="18" font-family="Arial, sans-serif">фото места · что делать и где</text>
  </svg>`
  return {
    id: newId('media'),
    kind: 'photo',
    name: `${label}.svg`,
    previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  }
}

function stage(
  partial: Omit<WorkDayStage, 'id' | 'media' | 'briefMedia' | 'actualQty' | 'submittedAtIso' | 'reviewedAtIso'> &
    Partial<Pick<WorkDayStage, 'actualQty' | 'submittedAtIso' | 'reviewedAtIso' | 'media' | 'briefMedia' | 'planItemNumber' | 'planItemTitle'>>,
): WorkDayStage {
  return {
    id: newId('stage'),
    media: partial.media ?? [],
    briefMedia: partial.briefMedia ?? [],
    actualQty: partial.actualQty ?? null,
    submittedAtIso: partial.submittedAtIso ?? null,
    reviewedAtIso: partial.reviewedAtIso ?? null,
    title: partial.title,
    requirements: partial.requirements,
    plannedQty: partial.plannedQty,
    unit: partial.unit,
    status: partial.status,
    planItemNumber: partial.planItemNumber,
    planItemTitle: partial.planItemTitle,
  }
}

/**
 * Демо только для локальной разработки. На прод не сидим —
 * иначе пустой клиент затирает чужие задания.
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
    stages: stages.map((s) => ({
      ...s,
      planItemNumber: s.planItemNumber ?? plan.number,
      planItemTitle: s.planItemTitle ?? plan.title,
    })),
    createdAtIso: nowIso(),
  })

  const yesterdayCurb = base(
    key(-1),
    'Участок А — чётная сторона, пикет 12–18',
    {
      number: '1.4',
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

  const twoDaysAgoSidewalk = base(
    key(-2),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.1',
      title: 'Разборка асфальтобетонного покрытия',
      total: 28637,
      unit: 'м²',
    },
    [
      stage({
        title: 'Разобрать асфальтобетонное покрытие на участке ~120 м²',
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

  const todaySand = base(
    key(0),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.6',
      title: 'Разработка грунта под основание',
      total: 0,
      unit: 'м³',
    },
    [
      stage({
        title: 'Разработка грунта под основание',
        requirements: 'Корыто по отметкам, вывоз грунта. Захватка 100 × 3 м.',
        plannedQty: 30,
        unit: 'м³',
        status: 'open',
        planItemNumber: '2.6',
        planItemTitle: 'Разработка грунта под основание',
        briefMedia: [briefPhoto('Участок А', 'снять грунт · 100 × 3 м')],
      }),
      stage({
        title: 'Укладка геотекстиля',
        requirements: 'Нахлёст полотен по проекту.',
        plannedQty: 300,
        unit: 'м²',
        status: 'open',
        planItemNumber: '2.7',
        planItemTitle: 'Укладка геотекстиля',
        briefMedia: [briefPhoto('Геотекстиль', 'расстелить на корыте')],
      }),
      stage({
        title: 'Устройство песчаного основания',
        requirements: 'Песок карьерный, 30 см, послойно, уплотнить.',
        plannedQty: 300,
        unit: 'м²',
        status: 'open',
        planItemNumber: '2.8',
        planItemTitle: 'Устройство песчаного основания',
        briefMedia: [briefPhoto('Песок 30 см', 'отсыпать и уплотнить')],
      }),
    ],
  )

  const todayCable = base(
    key(0),
    'Участок В — вдоль проезжей части',
    {
      number: '5.2',
      title: 'Разработка траншеи',
      total: 0,
      unit: 'м',
    },
    [
      stage({
        title: 'Разработка траншеи',
        requirements: 'Глубина и ширина по проекту.',
        plannedQty: 40,
        unit: 'м',
        status: 'open',
        planItemNumber: '5.2',
        planItemTitle: 'Разработка траншеи',
        briefMedia: [briefPhoto('Траншея 40 м', 'вдоль проезжей части')],
      }),
      stage({
        title: 'Укладка трубы ПНД Ø63',
        requirements: 'Стыковка, песчаная подсыпка.',
        plannedQty: 40,
        unit: 'м',
        status: 'open',
        planItemNumber: '5.4',
        planItemTitle: 'Укладка трубы ПНД Ø63',
        briefMedia: [briefPhoto('Труба 63', 'уложить в траншею')],
      }),
      stage({
        title: 'Обратная засыпка траншеи',
        requirements: 'Послойно, без повреждения трубы.',
        plannedQty: 40,
        unit: 'м',
        status: 'open',
        planItemNumber: '5.8',
        planItemTitle: 'Обратная засыпка траншеи',
        briefMedia: [briefPhoto('Засыпка', 'закрыть траншею')],
      }),
    ],
  )

  const tomorrowCrushed = base(
    key(1),
    'Участок А — тротуар, чётная сторона',
    {
      number: '2.9',
      title: 'Устройство щебёночного основания',
      total: 28641,
      unit: 'м²',
    },
    [
      stage({
        title: 'Устройство щебёночного основания',
        requirements: 'Фракция 20–40, толщина 20 см, укатка, контроль отметок.',
        plannedQty: 300,
        unit: 'м²',
        status: 'open',
      }),
    ],
  )

  const dayAfterCurb = base(
    key(2),
    'Участок А — чётная сторона, пикет 12–18',
    {
      number: '1.3',
      title: 'Монтаж бортового камня',
      total: 20115,
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
    if (changed) writeLocal(settled)
    return resolveWorkDayBundle(siteId, settled)
  }
  return { siteId, assignments: [] }
}

/** @deprecated use persistWorkDayPlan */
export function saveWorkDayPlan(bundle: WorkDayPlanBundle): void {
  writeLocal(bundle)
  void persistWorkDayPlan(bundle)
}

function seedBundle(siteId: string): WorkDayPlanBundle {
  return {
    siteId,
    assignments: siteId === 'brusilova' ? buildDemoAssignments(siteId) : [],
  }
}

/**
 * Подтянуть план дня с сервера.
 * Демо на прод не пишем — только локально в DEV при совсем пустых данных.
 */
export async function syncWorkDayPlanFromServer(
  siteId: string,
): Promise<WorkDayPlanBundle> {
  const remote = await fetchWorkDayPlanRemote(siteId)
  if (!remote) {
    const local = readRaw(siteId)
    if (local) return resolveWorkDayBundle(siteId, {
      ...local,
      assignments: local.assignments.map(settleAssignment),
    })
    if (import.meta.env.DEV && siteId === 'brusilova') {
      const seed = seedBundle(siteId)
      writeLocal(seed)
      return resolveWorkDayBundle(siteId, seed)
    }
    const empty = { siteId, assignments: [] as WorkDayAssignment[] }
    writeLocal(empty)
    return empty
  }
  const local = readRaw(siteId)
  const remoteEmpty = remote.assignments.length === 0
  if (remoteEmpty && local && local.assignments.length > 0) {
    await persistWorkDayPlan(local)
    return resolveWorkDayBundle(siteId, {
      ...local,
      assignments: local.assignments.map(settleAssignment),
    })
  }
  if (remoteEmpty) {
    if (import.meta.env.DEV && siteId === 'brusilova') {
      const seed = seedBundle(siteId)
      writeLocal(seed)
      return resolveWorkDayBundle(siteId, seed)
    }
    const empty = { siteId, assignments: [] as WorkDayAssignment[] }
    writeLocal(empty)
    return empty
  }
  const normalized = normalizeBundle(siteId, remote)
  if (!normalized) {
    return { siteId, assignments: [] }
  }
  writeLocal(normalized)
  return resolveWorkDayBundle(siteId, normalized)
}

export function upsertAssignment(
  siteId: string,
  assignment: WorkDayAssignment,
): WorkDayPlanBundle {
  const bundle = loadWorkDayPlan(siteId)
  // loadWorkDayPlan резолвит URL — для хранения берём сырой local + замену
  const raw = readRaw(siteId) ?? { siteId, assignments: [] as WorkDayAssignment[] }
  const idx = raw.assignments.findIndex((a) => a.id === assignment.id)
  const next =
    idx >= 0
      ? raw.assignments.map((a, i) => (i === idx ? assignment : a))
      : [assignment, ...raw.assignments]
  const updated = { ...bundle, siteId, assignments: next }
  writeLocal(updated)
  void persistWorkDayPlan(updated)
  return resolveWorkDayBundle(siteId, updated)
}

export async function upsertAssignmentAndSync(
  siteId: string,
  assignment: WorkDayAssignment,
): Promise<{ bundle: WorkDayPlanBundle; ok: boolean }> {
  const raw = readRaw(siteId) ?? { siteId, assignments: [] as WorkDayAssignment[] }
  const idx = raw.assignments.findIndex((a) => a.id === assignment.id)
  const next =
    idx >= 0
      ? raw.assignments.map((a, i) => (i === idx ? assignment : a))
      : [assignment, ...raw.assignments]
  const updated = { siteId, assignments: next }
  const ok = await persistWorkDayPlan(updated)
  return { bundle: resolveWorkDayBundle(siteId, updated), ok }
}

export function removeAssignment(siteId: string, assignmentId: string): WorkDayPlanBundle {
  const raw = readRaw(siteId) ?? { siteId, assignments: [] as WorkDayAssignment[] }
  const updated = {
    siteId,
    assignments: raw.assignments.filter((a) => a.id !== assignmentId),
  }
  writeLocal(updated)
  void persistWorkDayPlan(updated)
  return resolveWorkDayBundle(siteId, updated)
}
