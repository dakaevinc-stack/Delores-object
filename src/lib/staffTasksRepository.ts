import {
  localDateKey,
  type StaffTask,
  type StaffTaskAttachment,
  type StaffTaskComment,
  type StaffTaskStatus,
} from '../domain/staffTask'
import {
  fetchStaffTasksRemote,
  putStaffTasksRemote,
  upsertStaffTaskRemote,
} from './siteFormsApi'

const KEY = 'deloresh-staff-tasks:v1'
const CHANGE = 'deloresh-staff-tasks-change'

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function emit(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CHANGE))
}

function isTask(x: unknown): x is StaffTask {
  if (!x || typeof x !== 'object') return false
  const t = x as StaffTask
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.assigneeLogin === 'string' &&
    typeof t.creatorLogin === 'string' &&
    typeof t.dueDate === 'string' &&
    (t.status === 'new' || t.status === 'in_progress' || t.status === 'done')
  )
}

function seedDemo(): StaffTask[] {
  const today = localDateKey()
  const now = new Date().toISOString()
  return [
    {
      id: 'demo-task-1',
      title: 'Сверить объёмы А–С',
      body: 'Сверить зоны А–С с чертежом. Приложить фото.',
      dueDate: today,
      dueTime: '18:00',
      status: 'new',
      assigneeLogin: 'Gevenyan',
      assigneeName: 'Гевенян Георгий Амлетович',
      creatorLogin: 'Isaev',
      creatorName: 'Исаев Дмитрий Владимирович',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      attachments: [],
      comments: [],
      createdAtIso: now,
      updatedAtIso: now,
      seenByAssignee: false,
    },
    {
      id: 'demo-task-2',
      title: 'Согласовать выезд катка',
      body: 'Написать ФИО машиниста и время выезда.',
      dueDate: today,
      dueTime: '16:00',
      status: 'new',
      assigneeLogin: 'Gevenyan',
      assigneeName: 'Гевенян Георгий Амлетович',
      creatorLogin: 'Dakaev',
      creatorName: 'Дакаев Ибрагим Мансурович',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      attachments: [],
      comments: [
        {
          id: 'demo-c1',
          authorLogin: 'Dakaev',
          authorName: 'Дакаев Ибрагим Мансурович',
          text: 'Нужен каток к 17:00.',
          createdAtIso: now,
        },
      ],
      createdAtIso: now,
      updatedAtIso: now,
      seenByAssignee: false,
    },
    {
      id: 'demo-task-3',
      title: 'Фото корыта',
      body: 'Сфотографировать корыто и коротко описать.',
      dueDate: today,
      dueTime: '',
      status: 'in_progress',
      assigneeLogin: 'Gevenyan',
      assigneeName: 'Гевенян Георгий Амлетович',
      creatorLogin: 'Gulikyan',
      creatorName: 'Гуликян Татевос Жораевич',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      attachments: [],
      comments: [
        {
          id: 'demo-c2',
          authorLogin: 'Gulikyan',
          authorName: 'Гуликян Татевос Жораевич',
          text: 'Нужен ракурс с торца.',
          createdAtIso: now,
        },
      ],
      createdAtIso: now,
      updatedAtIso: now,
      seenByAssignee: true,
    },
    {
      id: 'demo-task-4',
      title: 'Список на смене',
      body: 'Прислать список людей на смене.',
      dueDate: today,
      dueTime: '',
      status: 'done',
      assigneeLogin: 'Gevenyan',
      assigneeName: 'Гевенян Георгий Амлетович',
      creatorLogin: 'Minasyan',
      creatorName: 'Минасян Армен Лаврентьевич',
      siteId: null,
      siteName: null,
      attachments: [],
      comments: [],
      createdAtIso: now,
      updatedAtIso: now,
      seenByAssignee: true,
    },
  ]
}

function mergeById<T extends { id: string }>(items: readonly T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.id, item)
  return [...map.values()]
}

export function mergeStaffTasks(
  local: readonly StaffTask[],
  remote: readonly StaffTask[],
): StaffTask[] {
  const map = new Map<string, StaffTask>()
  for (const t of [...remote, ...local]) {
    const prev = map.get(t.id)
    if (!prev) {
      map.set(t.id, t)
      continue
    }
    const newer = prev.updatedAtIso >= t.updatedAtIso ? prev : t
    const older = newer === prev ? t : prev
    map.set(t.id, {
      ...newer,
      seenByAssignee: newer.seenByAssignee || older.seenByAssignee,
      comments: mergeById([...older.comments, ...newer.comments]),
      attachments: mergeById([...older.attachments, ...newer.attachments]),
    })
  }
  return [...map.values()].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    return b.updatedAtIso.localeCompare(a.updatedAtIso)
  })
}

export function loadStaffTasks(): StaffTask[] {
  const s = storage()
  if (!s) return seedDemo()
  const raw = s.getItem(KEY)
  if (!raw) {
    const seeded = seedDemo()
    s.setItem(KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return seedDemo()
    return parsed.filter(isTask)
  } catch {
    return seedDemo()
  }
}

function saveAll(tasks: readonly StaffTask[]): void {
  const s = storage()
  if (!s) return
  s.setItem(KEY, JSON.stringify(tasks))
  emit()
}

export function replaceStaffTasks(tasks: readonly StaffTask[]): void {
  saveAll(tasks)
}

export function subscribeStaffTasks(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE, onChange)
  }
}

export function getStaffTask(id: string): StaffTask | null {
  return loadStaffTasks().find((t) => t.id === id) ?? null
}

export type CreateStaffTaskInput = {
  title: string
  body: string
  dueDate: string
  dueTime: string
  assigneeLogin: string
  assigneeName: string
  creatorLogin: string
  creatorName: string
  siteId: string | null
  siteName: string | null
  attachments?: readonly StaffTaskAttachment[]
}

export function createStaffTask(input: CreateStaffTaskInput): StaffTask {
  const now = new Date().toISOString()
  const task: StaffTask = {
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    body: input.body.trim(),
    dueDate: input.dueDate,
    dueTime: input.dueTime.trim(),
    status: 'new',
    assigneeLogin: input.assigneeLogin,
    assigneeName: input.assigneeName,
    creatorLogin: input.creatorLogin,
    creatorName: input.creatorName,
    siteId: input.siteId,
    siteName: input.siteName,
    attachments: input.attachments ?? [],
    comments: [],
    createdAtIso: now,
    updatedAtIso: now,
    seenByAssignee: false,
  }
  const next = [task, ...loadStaffTasks()]
  saveAll(next)
  void upsertStaffTaskRemote(task)
  return task
}

export function updateStaffTaskStatus(
  id: string,
  status: StaffTaskStatus,
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  const updated: StaffTask = {
    ...all[i],
    status,
    updatedAtIso: new Date().toISOString(),
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void upsertStaffTaskRemote(updated)
  return updated
}

export function markStaffTaskSeen(id: string, login: string): void {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return
  const t = all[i]
  if (t.assigneeLogin.toLocaleLowerCase('en-US') !== login.trim().toLocaleLowerCase('en-US'))
    return
  if (t.seenByAssignee) return
  const updated: StaffTask = {
    ...t,
    seenByAssignee: true,
    updatedAtIso: new Date().toISOString(),
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void upsertStaffTaskRemote(updated)
}

export function addStaffTaskComment(
  id: string,
  comment: Omit<StaffTaskComment, 'id' | 'createdAtIso'> & { text: string },
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  const text = comment.text.trim()
  if (!text) return all[i]
  const row: StaffTaskComment = {
    id: `c-${Date.now().toString(36)}`,
    authorLogin: comment.authorLogin,
    authorName: comment.authorName,
    text,
    createdAtIso: new Date().toISOString(),
  }
  const t = all[i]
  const updated: StaffTask = {
    ...t,
    comments: [...t.comments, row],
    updatedAtIso: row.createdAtIso,
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void upsertStaffTaskRemote(updated)
  return updated
}

export function addStaffTaskAttachment(
  id: string,
  attachment: StaffTaskAttachment,
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  const t = all[i]
  const updated: StaffTask = {
    ...t,
    attachments: [...t.attachments, attachment],
    updatedAtIso: new Date().toISOString(),
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void upsertStaffTaskRemote(updated)
  return updated
}

/** Подтянуть задачи с сервера и смержить с локальными. */
export async function syncStaffTasksFromRemote(): Promise<boolean> {
  const remoteRaw = await fetchStaffTasksRemote()
  if (remoteRaw === null) return false
  const remote = remoteRaw.filter(isTask)
  const local = loadStaffTasks()
  if (remote.length === 0 && local.length > 0) {
    return putStaffTasksRemote(local)
  }
  const merged = mergeStaffTasks(local, remote)
  saveAll(merged)
  if (JSON.stringify(merged) !== JSON.stringify(remote)) {
    await putStaffTasksRemote(merged)
  }
  return true
}
