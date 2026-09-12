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
    if (!session) {
      return { all: 0, new: 0, in_progress: 0, done: 0 }
    }
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
  const homeTo = session.duty === 'driver' ? '/driver' : '/'
  const homeLabel = session.duty === 'driver' ? 'К рейсам' : 'На главную'

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.heroGlow} aria-hidden />
        <span className={styles.heroGrid} aria-hidden />
        <span className={styles.heroStripe} aria-hidden />

        <div className={styles.heroTop}>
          <Link className={styles.back} to={homeTo}>
            <span className={styles.backArrow} aria-hidden>
              ←
            </span>
            {homeLabel}
          </Link>
          {unseen > 0 ? (
            <span className={styles.unseenBadge} aria-label={`Новых: ${unseen}`}>
              {unseen > 99 ? '99+' : unseen} новых
            </span>
          ) : null}
        </div>

        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Исполнение</p>
            <h1 className={styles.title}>Задачи</h1>
            <p className={styles.lead}>
              Назначить, контролировать срок и переписку по каждой задаче.
            </p>

            <div className={styles.heroStats} aria-label="Сводка по задачам">
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.all}</span>
                <span className={styles.statLabel}>всего</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.new}</span>
                <span className={styles.statLabel}>новые</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.in_progress}</span>
                <span className={styles.statLabel}>в работе</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.done}</span>
                <span className={styles.statLabel}>готово</span>
              </div>
            </div>
          </div>

          <div className={styles.logoFrame}>
            <span className={styles.logoFrameGlow} aria-hidden />
            <span className={styles.logoFrameRail} aria-hidden />
            <div className={styles.logoPlaque}>
              <img
                className={styles.logoImg}
                src="/brand-logotype.png?v=4"
                alt="Деловые Решения. Когда бизнес — личное."
                width={681}
                height={376}
                decoding="async"
              />
            </div>
          </div>
        </div>
      </header>

      <section className={styles.panel} aria-label="Список задач">
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <p className={styles.panelKicker}>Каталог</p>
            <h2 className={styles.panelTitle}>Мои задачи</h2>
          </div>
          {canCreate ? (
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.createBtn}
                onClick={() => setCreateOpen(true)}
              >
                Создать
              </button>
            </div>
          ) : null}
        </div>

        <TasksPanel
          tasks={visible}
          filter={filter}
          onFilterChange={setFilter}
          canCreate={false}
          onCreate={() => setCreateOpen(true)}
          counts={counts}
          embedded
          viewerLogin={session.login}
        />
      </section>

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
