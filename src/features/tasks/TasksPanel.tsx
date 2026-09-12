import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STAFF_TASK_STATUS_LABEL,
  localDateKey,
  type StaffTask,
  type StaffTaskFilter,
  type StaffTaskStatus,
} from '../../domain/staffTask'
import styles from './TasksPanel.module.css'

const FILTERS: { id: StaffTaskFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'done', label: 'Готово' },
]

type TasksPanelProps = {
  tasks: readonly StaffTask[]
  filter: StaffTaskFilter
  onFilterChange: (f: StaffTaskFilter) => void
  canCreate: boolean
  onCreate: () => void
  title?: string
  subtitle?: string
  counts?: Partial<Record<StaffTaskStatus | 'all', number>>
  /** Без своей шапки/стекла — внутри страницы хаба */
  embedded?: boolean
  /** Логин текущего пользователя — для «от / для» как в почте */
  viewerLogin?: string
}

function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return (parts[0] || '?').slice(0, 2).toUpperCase()
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`
  return parts[0] || full
}

/** Собеседник: как в почте — не «я», а другой участник. */
function counterpart(task: StaffTask, viewerLogin?: string): { name: string; role: 'from' | 'to' } {
  if (viewerLogin && task.assigneeLogin === viewerLogin && task.creatorLogin !== viewerLogin) {
    return { name: task.creatorName, role: 'from' }
  }
  if (viewerLogin && task.creatorLogin === viewerLogin && task.assigneeLogin !== viewerLogin) {
    return { name: task.assigneeName, role: 'to' }
  }
  return { name: task.creatorName, role: 'from' }
}

function arrivedText(task: StaffTask): string {
  const lastComment = task.comments.length
    ? task.comments.reduce((a, b) => (a.createdAtIso >= b.createdAtIso ? a : b))
    : null
  const iso = lastComment?.createdAtIso || task.createdAtIso
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''

  const time = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const dayKey = localDateKey(dt)
  const today = localDateKey()
  if (dayKey === today) return time

  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (dayKey === localDateKey(yest)) return `Вчера`

  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function previewText(task: StaffTask): string {
  const last = task.comments.length
    ? task.comments.reduce((a, b) => (a.createdAtIso >= b.createdAtIso ? a : b))
    : null
  if (last) {
    const t = last.text.trim()
    if (t) return t
    if (last.audio) return 'Голосовое сообщение'
    if (last.file) return last.file.name || 'Файл'
  }
  const body = task.body.trim()
  return body || ''
}

function isUnread(task: StaffTask, viewerLogin?: string): boolean {
  if (!viewerLogin) return false
  return task.assigneeLogin === viewerLogin && !task.seenByAssignee && task.status !== 'done'
}

export function TasksPanel({
  tasks,
  filter,
  onFilterChange,
  canCreate,
  onCreate,
  title = 'Мои задачи',
  subtitle,
  counts,
  embedded = false,
  viewerLogin,
}: TasksPanelProps) {
  const knownIds = useRef<Set<string> | null>(null)
  const [enteringIds, setEnteringIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (knownIds.current === null) {
      knownIds.current = new Set(tasks.map((t) => t.id))
      return
    }
    const fresh = new Set<string>()
    for (const t of tasks) {
      if (!knownIds.current.has(t.id)) fresh.add(t.id)
      knownIds.current.add(t.id)
    }
    if (fresh.size === 0) return
    setEnteringIds(fresh)
    const timer = window.setTimeout(() => setEnteringIds(new Set()), 480)
    return () => window.clearTimeout(timer)
  }, [tasks])

  return (
    <section
      className={embedded ? styles.embedded : styles.panel}
      aria-labelledby={embedded ? undefined : 'tasks-panel-title'}
      aria-label={embedded ? 'Список задач' : undefined}
    >
      {!embedded ? (
        <div className={styles.head}>
          <div>
            <p className={styles.kicker}>Исполнение</p>
            <h2 id="tasks-panel-title" className={styles.title}>
              {title}
            </h2>
            {subtitle ? <p className={styles.sub}>{subtitle}</p> : null}
          </div>
          {canCreate ? (
            <button type="button" className={styles.createBtn} onClick={onCreate}>
              Создать
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.filters} role="tablist" aria-label="Фильтр задач">
        {FILTERS.map((f) => {
          const n =
            f.id === 'new'
              ? counts?.new
              : f.id === 'in_progress'
                ? counts?.in_progress
                : f.id === 'done'
                  ? counts?.done
                  : f.id === 'all'
                    ? counts?.all
                    : undefined
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`${styles.chip} ${filter === f.id ? styles.chipOn : ''}`}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label}
              {typeof n === 'number' ? (
                <span className={styles.chipCount}>{n}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {tasks.length === 0 ? (
        <p className={styles.empty}>Нет задач по фильтру</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task, index) => {
            const other = counterpart(task, viewerLogin)
            const unread = isUnread(task, viewerLogin)
            const preview = previewText(task)
            return (
              <li
                key={task.id}
                className={[
                  styles.listItem,
                  enteringIds.has(task.id) ? styles.listItemEnter : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--row-i' as string]: String(Math.min(index, 12)) }}
              >
                <Link
                  to={`/tasks/${task.id}`}
                  className={[
                    styles.row,
                    styles[`row_${task.status}`],
                    unread ? styles.rowUnread : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={styles.avatar} aria-hidden>
                    {initials(other.name)}
                  </span>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className={styles.person}>
                        {other.role === 'to' ? (
                          <>
                            <span className={styles.personRole}>для</span>{' '}
                            {shortName(other.name)}
                          </>
                        ) : (
                          shortName(other.name)
                        )}
                      </span>
                      <time className={styles.time} title="Когда пришло">
                        {arrivedText(task)}
                      </time>
                    </div>
                    <div className={styles.subject}>{task.title}</div>
                    <div className={styles.snippet}>
                      <span className={styles.statusMark}>
                        {STAFF_TASK_STATUS_LABEL[task.status]}
                      </span>
                      {preview ? (
                        <>
                          <span className={styles.dot} aria-hidden>
                            ·
                          </span>
                          <span className={styles.snippetText}>{preview}</span>
                        </>
                      ) : null}
                      {task.siteName ? (
                        <>
                          <span className={styles.dot} aria-hidden>
                            ·
                          </span>
                          <span className={styles.site}>{task.siteName}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {unread ? <span className={styles.unreadDot} aria-label="Непрочитано" /> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
