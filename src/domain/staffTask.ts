/**
 * Именные задачи сотрудников (исполнение на день).
 * Не общий чат — переписка только внутри задачи.
 */

export type StaffTaskStatus = 'new' | 'in_progress' | 'done'

export type StaffTaskAttachment = {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly dataUrl: string
  readonly addedAtIso: string
  readonly byLogin: string
}

export type StaffTaskComment = {
  readonly id: string
  readonly authorLogin: string
  readonly authorName: string
  readonly text: string
  readonly createdAtIso: string
}

export type StaffTask = {
  readonly id: string
  readonly title: string
  readonly body: string
  /** YYYY-MM-DD (локальный календарный день) */
  readonly dueDate: string
  /** HH:mm или пусто = весь день */
  readonly dueTime: string
  readonly status: StaffTaskStatus
  readonly assigneeLogin: string
  readonly assigneeName: string
  readonly creatorLogin: string
  readonly creatorName: string
  readonly siteId: string | null
  readonly siteName: string | null
  readonly attachments: readonly StaffTaskAttachment[]
  readonly comments: readonly StaffTaskComment[]
  readonly createdAtIso: string
  readonly updatedAtIso: string
  /** Исполнитель открывал карточку */
  readonly seenByAssignee: boolean
}

export type StaffTaskFilter =
  | 'all'
  | 'new'
  | 'in_progress'
  | 'done'
  | 'today'
  | 'assigned_by_me'
  | 'assigned_to_me'

export const STAFF_TASK_STATUS_LABEL: Record<StaffTaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Готово',
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatTaskDayRu(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (!y || !m || !d) return dueDate
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function taskDueLabel(task: StaffTask, today = localDateKey()): string {
  if (task.dueTime) return task.dueTime
  if (task.dueDate === today) return 'сегодня'
  return formatTaskDayRu(task.dueDate)
}

export function isTaskForLogin(task: StaffTask, login: string): boolean {
  const l = login.trim().toLocaleLowerCase('en-US')
  return (
    task.assigneeLogin.toLocaleLowerCase('en-US') === l ||
    task.creatorLogin.toLocaleLowerCase('en-US') === l
  )
}

export function filterStaffTasks(
  tasks: readonly StaffTask[],
  opts: {
    login: string
    filter: StaffTaskFilter
    today?: string
  },
): StaffTask[] {
  const today = opts.today ?? localDateKey()
  const login = opts.login.trim().toLocaleLowerCase('en-US')
  let list = tasks.filter((t) => isTaskForLogin(t, opts.login))

  switch (opts.filter) {
    case 'new':
      list = list.filter((t) => t.status === 'new')
      break
    case 'in_progress':
      list = list.filter((t) => t.status === 'in_progress')
      break
    case 'done':
      list = list.filter((t) => t.status === 'done')
      break
    case 'today':
      list = list.filter((t) => t.dueDate === today)
      break
    case 'assigned_by_me':
      list = list.filter((t) => t.creatorLogin.toLocaleLowerCase('en-US') === login)
      break
    case 'assigned_to_me':
      list = list.filter((t) => t.assigneeLogin.toLocaleLowerCase('en-US') === login)
      break
    default:
      break
  }

  return [...list].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    const at = a.dueTime || '99:99'
    const bt = b.dueTime || '99:99'
    if (at !== bt) return at.localeCompare(bt)
    return b.updatedAtIso.localeCompare(a.updatedAtIso)
  })
}

export function countUnseenForAssignee(
  tasks: readonly StaffTask[],
  login: string,
): number {
  const l = login.trim().toLocaleLowerCase('en-US')
  return tasks.filter(
    (t) =>
      t.assigneeLogin.toLocaleLowerCase('en-US') === l &&
      !t.seenByAssignee &&
      t.status !== 'done',
  ).length
}

export function canCreateStaffTasks(duty: string): boolean {
  return (
    duty === 'manager' ||
    duty === 'deputy' ||
    duty === 'pto' ||
    duty === 'dispatcher'
  )
}
