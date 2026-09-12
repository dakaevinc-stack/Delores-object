import {
  localDateKey,
  type StaffTask,
  type StaffTaskAttachment,
  type StaffTaskComment,
  type StaffTaskStatus,
} from '../domain/staffTask'
import {
  fetchStaffTasksRemote,
  markStaffTaskSeenRemote,
  upsertStaffTaskRemote,
  deleteStaffTaskRemote,
} from './siteFormsApi'
import { slimMediaRef } from './staffTaskMedia'

const KEY = 'deloresh-staff-tasks:v1'
const CHANGE = 'deloresh-staff-tasks-change'

/** Стабильная ссылка для useSyncExternalStore (новый массив на каждый getSnapshot → Maximum update depth). */
let cachedTasks: StaffTask[] | null = null
let cachedRaw: string | null | undefined

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

function invalidateCache(): void {
  cachedTasks = null
  cachedRaw = undefined
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

function isDemoTaskId(id: string): boolean {
  return id.startsWith('demo-task-')
}

function commentRichness(c: StaffTaskComment): number {
  return (
    (c.audio?.dataUrl ? 2 : 0) +
    (c.file?.dataUrl ? 2 : 0) +
    (c.text?.trim() ? 1 : 0)
  )
}

function mergeComments(
  a: readonly StaffTaskComment[],
  b: readonly StaffTaskComment[],
): StaffTaskComment[] {
  const map = new Map<string, StaffTaskComment>()
  for (const c of [...a, ...b]) {
    if (!c || typeof c.id !== 'string') continue
    const prev = map.get(c.id)
    if (!prev || commentRichness(c) >= commentRichness(prev)) map.set(c.id, c)
  }
  return [...map.values()].sort((x, y) => x.createdAtIso.localeCompare(y.createdAtIso))
}

function mergeAttachments(
  a: readonly StaffTaskAttachment[],
  b: readonly StaffTaskAttachment[],
): StaffTaskAttachment[] {
  const map = new Map<string, StaffTaskAttachment>()
  for (const item of [...a, ...b]) {
    if (!item || typeof item.id !== 'string') continue
    map.set(item.id, item)
  }
  return [...map.values()]
}

/** Нормализация формы задачи (битые/старые записи с сервера). */
export function normalizeStaffTask(x: unknown): StaffTask | null {
  if (!isTask(x)) return null
  const t = x as StaffTask & Record<string, unknown>
  const comments = Array.isArray(t.comments)
    ? (t.comments as StaffTaskComment[]).filter(
        (c) => c && typeof c.id === 'string' && typeof c.authorLogin === 'string',
      )
    : []
  const attachments = Array.isArray(t.attachments)
    ? (t.attachments as StaffTaskAttachment[]).filter(
        (a) => a && typeof a.id === 'string' && typeof a.dataUrl === 'string',
      )
    : []
  return {
    id: t.id,
    title: t.title,
    body: typeof t.body === 'string' ? t.body : '',
    dueDate: t.dueDate,
    dueTime: typeof t.dueTime === 'string' ? t.dueTime : '',
    status: t.status,
    assigneeLogin: t.assigneeLogin,
    assigneeName: typeof t.assigneeName === 'string' ? t.assigneeName : t.assigneeLogin,
    creatorLogin: t.creatorLogin,
    creatorName: typeof t.creatorName === 'string' ? t.creatorName : t.creatorLogin,
    siteId: typeof t.siteId === 'string' ? t.siteId : null,
    siteName: typeof t.siteName === 'string' ? t.siteName : null,
    attachments,
    comments,
    createdAtIso:
      typeof t.createdAtIso === 'string' ? t.createdAtIso : new Date().toISOString(),
    updatedAtIso:
      typeof t.updatedAtIso === 'string' ? t.updatedAtIso : new Date().toISOString(),
    seenByAssignee: Boolean(t.seenByAssignee),
    ...(typeof t.deletedAtIso === 'string' && t.deletedAtIso
      ? { deletedAtIso: t.deletedAtIso }
      : {}),
  }
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

export function mergeStaffTasks(
  local: readonly StaffTask[],
  remote: readonly StaffTask[],
): StaffTask[] {
  const map = new Map<string, StaffTask>()
  for (const raw of [...remote, ...local]) {
    const t = normalizeStaffTask(raw)
    if (!t || isDemoTaskId(t.id)) continue
    const prev = map.get(t.id)
    if (!prev) {
      map.set(t.id, t)
      continue
    }
    const newer = prev.updatedAtIso >= t.updatedAtIso ? prev : t
    const older = newer === prev ? t : prev
    const deletedAtIso = newer.deletedAtIso || older.deletedAtIso
    map.set(t.id, {
      ...newer,
      seenByAssignee: newer.seenByAssignee || older.seenByAssignee,
      comments: mergeComments(older.comments, newer.comments),
      attachments: mergeAttachments(older.attachments, newer.attachments),
      ...(deletedAtIso ? { deletedAtIso } : {}),
    })
  }
  return [...map.values()].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    return b.updatedAtIso.localeCompare(a.updatedAtIso)
  })
}

export function loadStaffTasks(): StaffTask[] {
  const s = storage()
  if (!s) {
    if (!cachedTasks) cachedTasks = seedDemo()
    return cachedTasks
  }
  const raw = s.getItem(KEY)
  if (raw === cachedRaw && cachedTasks) return cachedTasks

  if (!raw) {
    // Пустой стор — не сеем демо. Пишем [] один раз, чтобы getSnapshot был стабильным.
    const empty: StaffTask[] = []
    const serialized = '[]'
    try {
      s.setItem(KEY, serialized)
    } catch {
      /* quota — держим только в памяти */
    }
    cachedRaw = serialized
    cachedTasks = empty
    return empty
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      cachedRaw = raw
      cachedTasks = []
      return cachedTasks
    }
    const list = parsed
      .map(normalizeStaffTask)
      .filter((t): t is StaffTask => Boolean(t))
      .filter((t) => !isDemoTaskId(t.id))
    cachedRaw = raw
    cachedTasks = list
    return list
  } catch {
    cachedRaw = raw
    cachedTasks = []
    return cachedTasks
  }
}

function slimComment(c: StaffTaskComment): StaffTaskComment {
  const audioRef = c.audio ? slimMediaRef(c.audio.dataUrl) : ''
  const fileRef = c.file ? slimMediaRef(c.file.dataUrl) : ''
  return {
    id: c.id,
    authorLogin: c.authorLogin,
    authorName: c.authorName,
    text: c.text,
    createdAtIso: c.createdAtIso,
    ...(c.audio && audioRef
      ? {
          audio: {
            mime: c.audio.mime,
            dataUrl: audioRef,
            durationSec: c.audio.durationSec,
          },
        }
      : {}),
    ...(c.file && fileRef
      ? {
          file: {
            name: c.file.name,
            mime: c.file.mime,
            dataUrl: fileRef,
          },
        }
      : {}),
  }
}

function slimTask(t: StaffTask): StaffTask {
  return {
    ...t,
    attachments: t.attachments
      .map((a) => ({ ...a, dataUrl: slimMediaRef(a.dataUrl) }))
      .filter((a) => Boolean(a.dataUrl)),
    comments: t.comments.map(slimComment),
  }
}

function saveAll(tasks: readonly StaffTask[]): void {
  const s = storage()
  if (!s) return
  const slimmed = tasks.map(slimTask)
  const serialized = JSON.stringify(slimmed)
  if (serialized === cachedRaw) return
  try {
    s.setItem(KEY, serialized)
    cachedRaw = serialized
    cachedTasks = [...slimmed]
    emit()
  } catch {
    // QuotaExceeded — не роняем UI; оставляем кэш в памяти
    cachedTasks = [...slimmed]
    emit()
  }
}

function pushStaffTaskRemote(task: StaffTask): void {
  void upsertStaffTaskRemote(slimTask(task))
}

export function subscribeStaffTasks(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) {
      invalidateCache()
      onChange()
    }
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
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
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
  pushStaffTaskRemote(task)
  return task
}

export function updateStaffTaskStatus(
  id: string,
  status: StaffTaskStatus,
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  if (all[i].deletedAtIso) return null
  const updated: StaffTask = {
    ...all[i],
    status,
    updatedAtIso: new Date().toISOString(),
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  pushStaffTaskRemote(updated)
  return updated
}

/** Мягкое удаление: tombstone + DELETE/upsert на сервер (другие устройства подхватят). */
export function deleteStaffTask(id: string): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  if (all[i].deletedAtIso) return all[i]
  const now = new Date().toISOString()
  const updated: StaffTask = {
    ...all[i],
    deletedAtIso: now,
    updatedAtIso: now,
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void deleteStaffTaskRemote(id).then((ok) => {
    if (!ok) pushStaffTaskRemote(updated)
  })
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
  // Не трогаем updatedAt и не шлём полный upsert — иначе можно затереть статус/чат.
  const updated: StaffTask = {
    ...t,
    seenByAssignee: true,
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  void markStaffTaskSeenRemote(id)
}

export function addStaffTaskComment(
  id: string,
  comment: Omit<StaffTaskComment, 'id' | 'createdAtIso'> & {
    text: string
    audio?: StaffTaskComment['audio']
    file?: StaffTaskComment['file']
  },
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  if (all[i].deletedAtIso) return null
  const text = comment.text.trim()
  const audio = comment.audio
  const file = comment.file
  const hasAudio = Boolean(audio?.dataUrl && audio.mime)
  const hasFile = Boolean(file?.dataUrl && file.mime && file.name)
  if (!text && !hasAudio && !hasFile) return all[i]
  const row: StaffTaskComment = {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    authorLogin: comment.authorLogin,
    authorName: comment.authorName,
    text,
    createdAtIso: new Date().toISOString(),
    ...(hasAudio
      ? {
          audio: {
            mime: audio!.mime,
            dataUrl: audio!.dataUrl,
            durationSec: Math.max(0, Math.floor(audio!.durationSec || 0)),
          },
        }
      : {}),
    ...(hasFile
      ? {
          file: {
            name: file!.name,
            mime: file!.mime,
            dataUrl: file!.dataUrl,
          },
        }
      : {}),
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
  pushStaffTaskRemote(updated)
  return updated
}

export function addStaffTaskAttachment(
  id: string,
  attachment: StaffTaskAttachment,
): StaffTask | null {
  const all = loadStaffTasks()
  const i = all.findIndex((t) => t.id === id)
  if (i < 0) return null
  if (all[i].deletedAtIso) return null
  const t = all[i]
  const updated: StaffTask = {
    ...t,
    attachments: [...t.attachments, attachment],
    updatedAtIso: new Date().toISOString(),
  }
  const next = [...all]
  next[i] = updated
  saveAll(next)
  pushStaffTaskRemote(updated)
  return updated
}

/** Подтянуть задачи с сервера и смержить с локальными. */
export async function syncStaffTasksFromRemote(): Promise<boolean> {
  const remoteRaw = await fetchStaffTasksRemote()
  if (remoteRaw === null) return false
  const remote = remoteRaw
    .map(normalizeStaffTask)
    .filter((t): t is StaffTask => Boolean(t))
    .filter((t) => !isDemoTaskId(t.id))
  const local = loadStaffTasks().filter((t) => !isDemoTaskId(t.id))
  const merged = mergeStaffTasks(local, remote)
  const localRaw = JSON.stringify(local)
  const mergedRaw = JSON.stringify(merged)
  if (mergedRaw !== localRaw) {
    saveAll(merged)
  }
  // Не делаем полный PUT всего массива (гонка между устройствами).
  // Если на сервере пусто — аккуратно догружаем локальные через POST upsert.
  if (remote.length === 0 && local.length > 0) {
    for (const t of local) {
      await upsertStaffTaskRemote(slimTask(t))
    }
    return true
  }
  // Локальные задачи, которых нет на сервере — тоже upsert.
  // Tombstone удаления всегда пушим (иначе чужое устройство вернёт задачу).
  const remoteIds = new Set(remote.map((t) => t.id))
  for (const t of local) {
    if (t.deletedAtIso || !remoteIds.has(t.id)) await upsertStaffTaskRemote(slimTask(t))
  }
  return true
}
