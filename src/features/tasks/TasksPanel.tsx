import { Link } from 'react-router-dom'
import {
  STAFF_TASK_STATUS_LABEL,
  taskDueLabel,
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
}

function statusClass(status: StaffTaskStatus): string {
  if (status === 'new') return styles.stNew
  if (status === 'in_progress') return styles.stWork
  return styles.stDone
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
}: TasksPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="tasks-panel-title">
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
            + Задача
          </button>
        ) : null}
      </div>

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
              {typeof n === 'number' ? ` ${n}` : ''}
            </button>
          )
        })}
      </div>

      {tasks.length === 0 ? (
        <p className={styles.empty}>Нет задач по фильтру</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/tasks/${task.id}`}
                className={`${styles.row} ${task.status === 'new' ? styles.rowHot : ''} ${task.status === 'done' ? styles.rowDone : ''}`}
              >
                <div className={styles.rowMain}>
                  <div className={styles.meta}>
                    <span className={`${styles.st} ${statusClass(task.status)}`}>
                      {STAFF_TASK_STATUS_LABEL[task.status]}
                    </span>
                    <span className={styles.who}>{task.creatorName.split(' ')[0]}</span>
                    {task.siteName ? (
                      <span className={styles.site}>{task.siteName}</span>
                    ) : null}
                  </div>
                  <div className={styles.rowTitle}>{task.title}</div>
                </div>
                <div className={styles.rowRight}>
                  <span className={styles.due}>{taskDueLabel(task)}</span>
                  <span className={styles.chev} aria-hidden>
                    ›
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
