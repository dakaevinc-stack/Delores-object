import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  STAFF_TASK_STATUS_LABEL,
  canCreateStaffTasks,
  isTaskForLogin,
  taskDueLabel,
} from '../domain/staffTask'
import { useLocalSession } from '../lib/useLocalSession'
import { useStaffTasks } from '../lib/useStaffTasks'
import type { StaffTaskAttachment } from '../domain/staffTask'
import styles from './TaskDetailPage.module.css'

const MAX_FILE_BYTES = 1.5 * 1024 * 1024

async function fileToAttachment(
  file: File,
  byLogin: string,
): Promise<StaffTaskAttachment | null> {
  if (file.size > MAX_FILE_BYTES) return null
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(file)
  })
  return {
    id: `f-${Date.now().toString(36)}`,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    dataUrl,
    addedAtIso: new Date().toISOString(),
    byLogin,
  }
}

export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const session = useLocalSession()
  const navigate = useNavigate()
  const { tasks, setStatus, markSeen, addComment, addFile } = useStaffTasks()
  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId])
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState('')

  useEffect(() => {
    if (!session || !task) return
    markSeen(task.id, session.login)
  }, [session, task, markSeen])

  if (!session) return <Navigate to="/" replace />
  if (!task || !isTaskForLogin(task, session.login)) {
    return (
      <div className={styles.page}>
        <p className={styles.missing}>Задача не найдена</p>
        <Link className={styles.back} to="/tasks">
          ← К задачам
        </Link>
      </div>
    )
  }

  const isAssignee =
    task.assigneeLogin.toLocaleLowerCase('en-US') ===
    session.login.trim().toLocaleLowerCase('en-US')
  const canManage = isAssignee || canCreateStaffTasks(session.duty)

  function onSend(e: FormEvent) {
    e.preventDefault()
    if (!session || !text.trim()) return
    addComment(task!.id, session.login, session.fullName, text)
    setText('')
  }

  async function onPickFile(fileList: FileList | null) {
    if (!session || !fileList?.[0]) return
    setFileError('')
    const att = await fileToAttachment(fileList[0], session.login)
    if (!att) {
      setFileError('Файл до 1,5 МБ')
      return
    }
    addFile(task!.id, att)
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <button type="button" className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Назад">
          ‹
        </button>
        <h1 className={styles.topTitle}>Задача</h1>
        <span className={styles.topSpacer} />
      </header>

      <div className={styles.hero}>
        <div className={styles.pills}>
          <span className={`${styles.pill} ${styles[`st_${task.status}`]}`}>
            {STAFF_TASK_STATUS_LABEL[task.status]}
          </span>
          <span className={styles.pill}>{taskDueLabel(task)}</span>
          {task.siteName ? <span className={styles.pill}>{task.siteName}</span> : null}
        </div>
        <h2 className={styles.h2}>{task.title}</h2>
        <p className={styles.from}>
          От <strong>{task.creatorName}</strong>
          {isAssignee ? null : (
            <>
              {' '}
              → <strong>{task.assigneeName}</strong>
            </>
          )}
        </p>
      </div>

      <section className={styles.sheet}>
        <h3 className={styles.lbl}>Сделать</h3>
        <p className={styles.bodyText}>{task.body || '—'}</p>
        {task.attachments.length > 0 ? (
          <div className={styles.files}>
            {task.attachments.map((a) => (
              <a key={a.id} className={styles.file} href={a.dataUrl} download={a.name}>
                {a.name}
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.sheet}>
        <h3 className={styles.lbl}>Ваш файл</h3>
        <label className={styles.upload}>
          + Фото или файл
          <input
            type="file"
            accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
            hidden
            onChange={(e) => {
              void onPickFile(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        {fileError ? <p className={styles.err}>{fileError}</p> : null}
      </section>

      {canManage ? (
        <div className={styles.actions}>
          {task.status === 'new' && isAssignee ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => setStatus(task.id, 'in_progress')}
            >
              В работу
            </button>
          ) : null}
          {task.status !== 'done' ? (
            <button
              type="button"
              className={task.status === 'new' && isAssignee ? styles.secondary : styles.primary}
              onClick={() => setStatus(task.id, 'done')}
            >
              Готово
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setStatus(task.id, 'in_progress')}
            >
              Вернуть в работу
            </button>
          )}
        </div>
      ) : null}

      <section className={styles.sheet}>
        <h3 className={styles.lbl}>
          Чат · {isAssignee ? task.creatorName.split(' ')[0] : task.assigneeName.split(' ')[0]}
        </h3>
        <div className={styles.chat}>
          {task.comments.length === 0 ? (
            <p className={styles.chatEmpty}>Пока пусто</p>
          ) : (
            task.comments.map((c) => {
              const mine =
                c.authorLogin.toLocaleLowerCase('en-US') ===
                session.login.trim().toLocaleLowerCase('en-US')
              return (
                <div key={c.id} className={`${styles.msg} ${mine ? styles.msgMe : ''}`}>
                  <div className={styles.msgMeta}>
                    {c.authorName.split(' ')[0]} ·{' '}
                    {new Date(c.createdAtIso).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  {c.text}
                </div>
              )
            })
          )}
        </div>
        <form className={styles.compose} onSubmit={onSend}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Сообщение"
            aria-label="Сообщение"
          />
          <button type="submit" aria-label="Отправить">
            ➤
          </button>
        </form>
      </section>

      <Link className={styles.backLink} to="/tasks">
        ← Все задачи
      </Link>
    </div>
  )
}
