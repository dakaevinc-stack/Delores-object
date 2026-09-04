import { useMemo, useState } from 'react'
import { localDateKey } from '../../domain/staffTask'
import { listAssignableStaff } from '../../domain/staffDirectory.assignable'
import { useAllSites } from '../../lib/useAllSites'
import styles from './TaskCreateModal.module.css'

export type TaskCreateValues = {
  title: string
  body: string
  dueDate: string
  dueTime: string
  assigneeLogin: string
  assigneeName: string
  siteId: string | null
  siteName: string | null
}

type TaskCreateModalProps = {
  open: boolean
  excludeLogin?: string
  onClose: () => void
  onSubmit: (values: TaskCreateValues) => void
}

export function TaskCreateModal({
  open,
  excludeLogin,
  onClose,
  onSubmit,
}: TaskCreateModalProps) {
  const sites = useAllSites()
  const people = useMemo(() => listAssignableStaff(excludeLogin), [excludeLogin])
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [query, setQuery] = useState('')
  const [assigneeLogin, setAssigneeLogin] = useState('')
  const [dueDate, setDueDate] = useState(localDateKey())
  const [dueTime, setDueTime] = useState('18:00')
  const [siteId, setSiteId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  if (!open) return null

  const filtered = people.filter((p) => {
    const q = query.trim().toLocaleLowerCase('ru-RU')
    if (!q) return true
    return (
      p.fullName.toLocaleLowerCase('ru-RU').includes(q) ||
      p.login.toLocaleLowerCase('en-US').includes(q)
    )
  })

  const selected = people.find((p) => p.login === assigneeLogin)

  function resetAndClose() {
    setStep(1)
    setQuery('')
    setAssigneeLogin('')
    setDueDate(localDateKey())
    setDueTime('18:00')
    setSiteId('')
    setTitle('')
    setBody('')
    onClose()
  }

  function submit() {
    if (!selected || !title.trim()) return
    const site = sites.find((s) => s.id === siteId) ?? null
    onSubmit({
      title: title.trim(),
      body: body.trim(),
      dueDate,
      dueTime: dueTime.trim(),
      assigneeLogin: selected.login,
      assigneeName: selected.fullName,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
    })
    resetAndClose()
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={resetAndClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <p className={styles.step}>Шаг {step} из 3</p>
            <h2 id="task-create-title" className={styles.title}>
              {step === 1 ? 'Кому' : step === 2 ? 'Когда' : 'Что сделать'}
            </h2>
          </div>
          <button type="button" className={styles.iconClose} onClick={resetAndClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className={styles.body}>
          {step === 1 ? (
            <>
              <label className={styles.lbl} htmlFor="task-who">
                Сотрудник
              </label>
              <input
                id="task-who"
                className={styles.field}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
                autoComplete="off"
              />
              <div className={styles.people}>
                {filtered.map((p) => (
                  <button
                    key={p.login}
                    type="button"
                    className={`${styles.person} ${assigneeLogin === p.login ? styles.personOn : ''}`}
                    onClick={() => setAssigneeLogin(p.login)}
                  >
                    <span className={styles.ava} aria-hidden>
                      {p.fullName
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    <span>
                      <span className={styles.personName}>{p.fullName}</span>
                      <span className={styles.personDuty}>{p.dutyLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <label className={styles.lbl} htmlFor="task-day">
                День
              </label>
              <input
                id="task-day"
                type="date"
                className={styles.field}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className={styles.lbl}>Срок</p>
              <div className={styles.chips}>
                {['', '12:00', '18:00'].map((t) => (
                  <button
                    key={t || 'all'}
                    type="button"
                    className={`${styles.chip} ${dueTime === t ? styles.chipOn : ''}`}
                    onClick={() => setDueTime(t)}
                  >
                    {t || 'Весь день'}
                  </button>
                ))}
              </div>
              {dueTime && dueTime !== '12:00' && dueTime !== '18:00' ? null : null}
              <label className={styles.lbl} htmlFor="task-time">
                Время (необязательно)
              </label>
              <input
                id="task-time"
                type="time"
                className={styles.field}
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
              <label className={styles.lbl} htmlFor="task-site">
                Объект
              </label>
              <select
                id="task-site"
                className={styles.field}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">Без объекта</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <label className={styles.lbl} htmlFor="task-title">
                Заголовок
              </label>
              <input
                id="task-title"
                className={styles.field}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Кратко"
              />
              <label className={styles.lbl} htmlFor="task-body">
                Описание
              </label>
              <textarea
                id="task-body"
                className={styles.field}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Что сделать"
              />
            </>
          ) : null}
        </div>

        <footer className={styles.foot}>
          {step === 1 ? (
            <>
              <button type="button" className={styles.btnGhost} onClick={resetAndClose}>
                Отмена
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!assigneeLogin}
                onClick={() => setStep(2)}
              >
                Далее
              </button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <button type="button" className={styles.btnGhost} onClick={() => setStep(1)}>
                Назад
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => setStep(3)}>
                Далее
              </button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <button type="button" className={styles.btnGhost} onClick={() => setStep(2)}>
                Назад
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!title.trim()}
                onClick={submit}
              >
                Назначить
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
