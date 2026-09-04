import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { TasksPanel } from '../features/tasks/TasksPanel'
import { TaskCreateModal } from '../features/tasks/TaskCreateModal'
import {
  canCreateStaffTasks,
  countUnseenForAssignee,
  filterStaffTasks,
  type StaffTaskFilter,
} from '../domain/staffTask'
import { useLocalSession } from '../lib/useLocalSession'
import { useStaffTasks } from '../lib/useStaffTasks'
import styles from './TasksPage.module.css'

export function TasksPage() {
  const session = useLocalSession()
  const { tasks, create } = useStaffTasks()
  const [filter, setFilter] = useState<StaffTaskFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const canCreate = session ? canCreateStaffTasks(session.duty) : false

  const visible = useMemo(() => {
    if (!session) return []
    return filterStaffTasks(tasks, { login: session.login, filter })
  }, [tasks, session, filter])

  const counts = useMemo(() => {
    if (!session) return {}
    const mine = filterStaffTasks(tasks, {
      login: session.login,
      filter: 'all',
    })
    return {
      all: mine.length,
      new: mine.filter((t) => t.status === 'new').length,
      in_progress: mine.filter((t) => t.status === 'in_progress').length,
      done: mine.filter((t) => t.status === 'done').length,
    }
  }, [tasks, session])

  if (!session) return <Navigate to="/" replace />

  const unseen = countUnseenForAssignee(tasks, session.login)

  return (
    <div className={styles.page}>
      <div className={styles.nav}>
        <Link
          to={session.duty === 'driver' ? '/driver' : '/'}
          className={styles.homeLink}
        >
          {session.duty === 'driver' ? '← К рейсам' : '← На главную'}
        </Link>
        {unseen > 0 ? <span className={styles.badge}>{unseen}</span> : null}
      </div>

      <TasksPanel
        tasks={visible}
        filter={filter}
        onFilterChange={setFilter}
        canCreate={canCreate}
        onCreate={() => setCreateOpen(true)}
        title="Задачи"
        subtitle="Назначенные вам и вами"
        counts={counts}
      />

      <TaskCreateModal
        open={createOpen}
        excludeLogin={session.login}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => {
          create({
            ...values,
            creatorLogin: session.login,
            creatorName: session.fullName,
          })
        }}
      />
    </div>
  )
}
