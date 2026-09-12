import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  STAFF_TASK_STATUS_LABEL,
  canCreateStaffTasks,
  canDeleteStaffTask,
  formatTaskDayRu,
  isTaskForLogin,
  localDateKey,
} from '../domain/staffTask'
import { useLocalSession } from '../lib/useLocalSession'
import { useStaffTasks } from '../lib/useStaffTasks'
import type { StaffTaskAttachment, StaffTaskCommentAudio } from '../domain/staffTask'
import {
  MAX_VOICE_BYTES,
  MAX_VOICE_SEC,
  canRecordVoice,
  formatVoiceDuration,
  pickRecorderMime,
  voiceFileExt,
} from '../lib/staffTaskAudio'
import { uploadStaffMediaBlob } from '../lib/staffTaskMedia'
import { StaffTaskMedia } from '../features/tasks/StaffTaskMedia'
import styles from './TaskDetailPage.module.css'

const MAX_FILE_BYTES = 1.5 * 1024 * 1024
/** Сколько файлов можно выбрать за один раз (как в мессенджере). */
const MAX_PICK_FILES = 30

function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith('audio/') ||
    /\.(m4a|mp3|ogg|webm|wav|aac)$/i.test(file.name)
  )
}

async function fileToAttachment(
  file: File,
  byLogin: string,
): Promise<StaffTaskAttachment | null> {
  if (file.size > MAX_FILE_BYTES) return null
  const url = await uploadStaffMediaBlob(file, {
    name: file.name,
    mime: file.type || 'application/octet-stream',
  })
  if (!url) return null
  const id = url.split('/').pop() || `f-${Date.now().toString(36)}`
  return {
    id,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    dataUrl: url,
    addedAtIso: new Date().toISOString(),
    byLogin,
  }
}

async function fileToVoiceAudio(file: File): Promise<StaffTaskCommentAudio | null> {
  if (!file.type.startsWith('audio/') && !/\.(webm|m4a|mp3|ogg|wav|aac)$/i.test(file.name)) {
    return null
  }
  if (file.size > MAX_VOICE_BYTES) return null
  const url = await uploadStaffMediaBlob(file, {
    name: file.name,
    mime: file.type || 'audio/webm',
  })
  if (!url) return null
  return {
    mime: file.type || 'audio/webm',
    dataUrl: url,
    durationSec: 0,
  }
}

export function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const session = useLocalSession()
  const navigate = useNavigate()
  const { tasks, setStatus, markSeen, addComment, addFile, remove } = useStaffTasks()
  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId])
  const [text, setText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [fileError, setFileError] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [recording, setRecording] = useState(false)
  const [recSec, setRecSec] = useState(0)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [bodyOpen, setBodyOpen] = useState(false)
  const [kbdInset, setKbdInset] = useState(0)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const cancelRecRef = useRef(false)
  const audioFallbackRef = useRef<HTMLInputElement | null>(null)
  const knownCommentIds = useRef<Set<string> | null>(null)
  const [enteringCommentIds, setEnteringCommentIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  useEffect(() => {
    if (!session || !task) return
    markSeen(task.id, session.login)
  }, [session, task, markSeen])

  useEffect(() => {
    if (!task) return
    if (knownCommentIds.current === null) {
      knownCommentIds.current = new Set(task.comments.map((c) => c.id))
      return
    }
    const fresh = new Set<string>()
    for (const c of task.comments) {
      if (!knownCommentIds.current.has(c.id)) fresh.add(c.id)
      knownCommentIds.current.add(c.id)
    }
    if (fresh.size === 0) return
    setEnteringCommentIds(fresh)
    const timer = window.setTimeout(() => setEnteringCommentIds(new Set()), 280)
    return () => window.clearTimeout(timer)
  }, [task])

  useEffect(() => {
    knownCommentIds.current = null
    setEnteringCommentIds(new Set())
  }, [taskId])

  useEffect(() => {
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current)
      try {
        mediaRecRef.current?.stop()
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbdInset(inset > 40 ? inset : 0)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  if (!session) return <Navigate to="/" replace />
  if (!task || task.deletedAtIso || !isTaskForLogin(task, session.login)) {
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
  const canDelete = canDeleteStaffTask(task, session.login)
  const micOk = canRecordVoice()
  const today = localDateKey()
  const dueDay =
    task.dueDate === today ? 'Сегодня' : formatTaskDayRu(task.dueDate)
  const dueText = task.dueTime ? `${dueDay}, ${task.dueTime}` : dueDay
  const shortName = (full: string) => {
    const parts = full.trim().split(/\s+/)
    if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`
    return parts[0] || full
  }

  function onSend(e: FormEvent) {
    e.preventDefault()
    if (!session || !text.trim()) return
    addComment(task!.id, session.login, session.fullName, text)
    setText('')
  }

  function onDeleteTask() {
    if (!task || !canDelete || deleteBusy) return
    const ok = window.confirm('Удалить задачу? Переписка и файлы пропадут у всех.')
    if (!ok) return
    setDeleteBusy(true)
    remove(task.id)
    navigate('/tasks', { replace: true })
  }

  async function onPickFile(fileList: FileList | null) {
    if (!session || !fileList?.length) return
    setFileError('')
    const files = Array.from(fileList).slice(0, MAX_PICK_FILES)
    let ok = 0
    let tooBig = 0
    for (const file of files) {
      const att = await fileToAttachment(file, session.login)
      if (!att) {
        tooBig += 1
        continue
      }
      addFile(task!.id, att)
      ok += 1
    }
    if (tooBig > 0 && ok === 0) setFileError('Не удалось загрузить (лимит 1,5 МБ или нет связи)')
    else if (tooBig > 0) setFileError(`${tooBig} не добавлены — лимит или сервер`)
    if (fileList.length > MAX_PICK_FILES) {
      setFileError(`За раз до ${MAX_PICK_FILES} файлов`)
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function clearTick() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  async function finishVoiceBlob(blob: Blob, durationSec: number) {
    if (!session) return
    if (cancelRecRef.current) return
    if (blob.size < 64) {
      setVoiceError('Слишком короткая запись')
      return
    }
    if (blob.size > MAX_VOICE_BYTES) {
      setVoiceError('Голос до 2,5 МБ — запишите короче')
      return
    }
    setVoiceBusy(true)
    setVoiceError('')
    try {
      const url = await uploadStaffMediaBlob(blob, {
        name: `voice.${voiceFileExt(blob.type || pickRecorderMime() || 'audio/webm')}`,
        mime: blob.type || pickRecorderMime() || 'audio/webm',
      })
      if (!url) {
        setVoiceError('Не удалось загрузить голос на сервер')
        return
      }
      const mime = blob.type || pickRecorderMime() || 'audio/webm'
      addComment(task!.id, session.login, session.fullName, '', {
        mime,
        dataUrl: url,
        durationSec,
      })
    } catch {
      setVoiceError('Не удалось сохранить голос')
    } finally {
      setVoiceBusy(false)
    }
  }

  async function startRecording() {
    setVoiceError('')
    if (!window.isSecureContext || !micOk) {
      // HTTP / IP: браузер блокирует микрофон — системный выбор или Voice Memos
      audioFallbackRef.current?.click()
      return
    }
    cancelRecRef.current = false
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickRecorderMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      mediaRecRef.current = rec
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onstop = () => {
        clearTick()
        setRecording(false)
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        )
        const type = rec.mimeType || mime || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        stopTracks()
        mediaRecRef.current = null
        void finishVoiceBlob(blob, Math.min(durationSec, MAX_VOICE_SEC))
      }
      startedAtRef.current = Date.now()
      setRecSec(0)
      setRecording(true)
      rec.start(250)
      tickRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setRecSec(sec)
        if (sec >= MAX_VOICE_SEC) {
          try {
            mediaRecRef.current?.stop()
          } catch {
            /* ignore */
          }
        }
      }, 250)
    } catch {
      stopTracks()
      setRecording(false)
      setVoiceError('Нет доступа к микрофону — разрешите в настройках или прикрепите файл')
    }
  }

  function stopRecording(send: boolean) {
    cancelRecRef.current = !send
    clearTick()
    const rec = mediaRecRef.current
    if (!rec || rec.state === 'inactive') {
      setRecording(false)
      stopTracks()
      return
    }
    try {
      rec.stop()
    } catch {
      setRecording(false)
      stopTracks()
    }
  }

  async function onPickAudio(fileList: FileList | null) {
    if (!session || !task || !fileList?.length) return
    setVoiceError('')
    setVoiceBusy(true)
    try {
      const files = Array.from(fileList).slice(0, MAX_PICK_FILES)
      let tooBig = 0
      for (const file of files) {
        const audio = await fileToVoiceAudio(file)
        if (!audio) {
          tooBig += 1
          continue
        }
        addComment(task.id, session.login, session.fullName, '', audio)
      }
      if (tooBig > 0) setVoiceError('Аудио до 2,5 МБ (m4a, mp3, webm…)')
    } finally {
      setVoiceBusy(false)
    }
  }

  async function onPickChatFile(fileList: FileList | null) {
    if (!session || !task || !fileList?.length) return
    setVoiceError('')
    setVoiceBusy(true)
    try {
      const files = Array.from(fileList).slice(0, MAX_PICK_FILES)
      let tooBig = 0
      for (const file of files) {
        if (isAudioFile(file)) {
          const audio = await fileToVoiceAudio(file)
          if (!audio) {
            tooBig += 1
            continue
          }
          addComment(task.id, session.login, session.fullName, '', audio)
          continue
        }
        if (file.size > MAX_FILE_BYTES) {
          tooBig += 1
          continue
        }
        const url = await uploadStaffMediaBlob(file, {
          name: file.name,
          mime: file.type || 'application/octet-stream',
        })
        if (!url) {
          tooBig += 1
          continue
        }
        addComment(task.id, session.login, session.fullName, '', undefined, {
          name: file.name,
          mime: file.type || 'application/octet-stream',
          dataUrl: url,
        })
      }
      if (tooBig > 0) setVoiceError(`${tooBig} не отправлены — лимит размера`)
      if (fileList.length > MAX_PICK_FILES) {
        setVoiceError(`За раз до ${MAX_PICK_FILES} файлов`)
      }
    } catch {
      setVoiceError('Не удалось прикрепить файл')
    } finally {
      setVoiceBusy(false)
    }
  }

  const peerName = isAssignee
    ? shortName(task.creatorName)
    : shortName(task.assigneeName)
  const bodyText = (task.body || '').trim()
  const bodyLong = bodyText.length > 110
  const commentCount = task.comments.length
  const commentLabel =
    commentCount === 0
      ? 'нет сообщений'
      : `${commentCount} ${
          commentCount === 1 ? 'сообщение' : commentCount < 5 ? 'сообщения' : 'сообщений'
        }`

  let primaryAction: { label: string; onClick: () => void; tone: 'primary' | 'secondary' } | null =
    null
  let waitHint = ''
  if (canManage) {
    if (task.status === 'done') {
      primaryAction = {
        label: 'Вернуть в работу',
        onClick: () => setStatus(task.id, 'in_progress'),
        tone: 'secondary',
      }
    } else if (task.status === 'new' && isAssignee) {
      primaryAction = {
        label: 'В работу',
        onClick: () => setStatus(task.id, 'in_progress'),
        tone: 'primary',
      }
    } else {
      primaryAction = {
        label: 'Готово',
        onClick: () => setStatus(task.id, 'done'),
        tone: 'primary',
      }
    }
  } else if (task.status === 'new') {
    waitHint = 'Ожидает исполнителя'
  } else if (task.status === 'done') {
    waitHint = 'Задача выполнена'
  } else {
    waitHint = 'В работе у исполнителя'
  }

  return (
    <div
      className={styles.page}
      style={{ ['--kbd-inset' as string]: `${kbdInset}px` }}
    >
      <div className={styles.atmosphere} aria-hidden />

      <header className={styles.top}>
        <button type="button" className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Назад">
          ‹
        </button>
        <div className={styles.topCenter}>
          <p className={styles.topKicker}>Исполнение</p>
          <h1 className={styles.topTitle}>Задача</h1>
        </div>
        <span className={styles.topSpacer} />
      </header>

      <div className={`${styles.hero} ${styles.heroEnter}`}>
        <span className={styles.heroEdge} aria-hidden />
        <span className={styles.heroGlow} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroStatusRow}>
            <span className={`${styles.statusPill} ${styles[`st_${task.status}`]}`}>
              {STAFF_TASK_STATUS_LABEL[task.status]}
            </span>
            {task.siteName ? (
              <span className={styles.siteChip} title={task.siteName}>
                {task.siteName}
              </span>
            ) : null}
          </div>

          <h2 className={styles.h2}>{task.title}</h2>

          <div className={styles.metaChips} aria-label="Параметры задачи">
            <span className={styles.chip}>
              <span className={styles.chipKey}>Срок</span>
              {dueText}
            </span>
            <span className={styles.chip}>
              <span className={styles.chipKey}>От</span>
              {shortName(task.creatorName)}
            </span>
            <span className={styles.chip}>
              <span className={styles.chipKey}>Кому</span>
              <span className={isAssignee ? styles.chipYou : undefined}>
                {isAssignee ? 'Вы' : shortName(task.assigneeName)}
              </span>
            </span>
          </div>

          {bodyText ? (
            <div className={styles.bodyBlock}>
              <p className={`${styles.bodyText} ${bodyOpen || !bodyLong ? '' : styles.bodyClamp}`}>
                {bodyText}
              </p>
              {bodyLong ? (
                <button
                  type="button"
                  className={styles.bodyMore}
                  onClick={() => setBodyOpen((v) => !v)}
                >
                  {bodyOpen ? 'Свернуть' : 'Ещё'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={styles.heroFiles}>
            {task.attachments.map((a) => (
              <StaffTaskMedia
                key={a.id}
                as="a"
                className={styles.file}
                src={a.dataUrl}
                download={a.name}
                alt={a.name}
              />
            ))}
            <label className={styles.clipBtn} title="Прикрепить к задаче">
              <span aria-hidden>+</span>
              Файл
              <input
                type="file"
                accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
                multiple
                hidden
                onChange={(e) => {
                  void onPickFile(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {fileError ? <p className={styles.errLight}>{fileError}</p> : null}
        </div>
      </div>

      <div className={styles.actionBar}>
        {primaryAction ? (
          <button
            type="button"
            className={primaryAction.tone === 'primary' ? styles.primary : styles.secondary}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </button>
        ) : waitHint ? (
          <p className={styles.waitHint}>{waitHint}</p>
        ) : null}
        {canManage && task.status === 'new' && isAssignee ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setStatus(task.id, 'done')}
          >
            Готово
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className={styles.danger}
            disabled={deleteBusy}
            onClick={onDeleteTask}
          >
            Удалить
          </button>
        ) : null}
      </div>

      <section className={`${styles.sheet} ${styles.chatSheet}`}>
        <div className={styles.chatHead}>
          <div className={styles.chatHeadLeft}>
            <span className={styles.chatAvatar} aria-hidden>
              {(isAssignee ? task.creatorName : task.assigneeName).trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <h3 className={styles.chatTitle}>Переписка</h3>
              <p className={styles.chatPeer}>с {peerName}</p>
            </div>
          </div>
          <span className={styles.chatCount}>{commentLabel}</span>
        </div>

        <div className={styles.chatWell}>
          <div className={styles.chat}>
            {task.comments.length === 0 ? (
              <p className={styles.chatEmpty}>Напишите или приложите файл</p>
            ) : (
              task.comments.map((c) => {
                const mine =
                  c.authorLogin.toLocaleLowerCase('en-US') ===
                  session.login.trim().toLocaleLowerCase('en-US')
                return (
                  <div
                    key={c.id}
                    className={[
                      styles.msgRow,
                      mine ? styles.msgRowMe : '',
                      enteringCommentIds.has(c.id) ? styles.msgRowEnter : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {!mine ? (
                      <span className={styles.msgAvatar} aria-hidden>
                        {c.authorName.trim().charAt(0).toUpperCase()}
                      </span>
                    ) : null}
                    <div className={`${styles.msg} ${mine ? styles.msgMe : ''}`}>
                      <div className={styles.msgMeta}>
                        <span>{mine ? 'Вы' : c.authorName.split(' ')[0]}</span>
                        <span className={styles.msgTime}>
                          {new Date(c.createdAtIso).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {c.text ? <div className={styles.msgText}>{c.text}</div> : null}
                      {c.file?.dataUrl ? (
                        <div className={styles.fileMsg}>
                          {c.file.mime.startsWith('image/') ? (
                            <StaffTaskMedia
                              className={styles.fileImg}
                              src={c.file.dataUrl}
                              alt={c.file.name}
                            />
                          ) : (
                            <StaffTaskMedia
                              as="a"
                              className={styles.fileChip}
                              src={c.file.dataUrl}
                              download={c.file.name}
                              alt={c.file.name}
                            />
                          )}
                        </div>
                      ) : null}
                      {c.audio?.dataUrl ? (
                        <div className={styles.voiceMsg}>
                          <StaffTaskMedia
                            as="audio"
                            className={styles.audio}
                            src={c.audio.dataUrl}
                          />
                          {c.audio.durationSec > 0 ? (
                            <span className={styles.voiceDur}>
                              {formatVoiceDuration(c.audio.durationSec)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {recording ? (
          <div className={styles.recBar} role="status">
            <span className={styles.recDot} aria-hidden />
            <span className={styles.recLabel}>Запись {formatVoiceDuration(recSec)}</span>
            <button type="button" className={styles.recCancel} onClick={() => stopRecording(false)}>
              Отмена
            </button>
            <button type="button" className={styles.recStop} onClick={() => stopRecording(true)}>
              Стоп · отправить
            </button>
          </div>
        ) : (
          <form className={styles.compose} onSubmit={onSend}>
            <div className={styles.composeTools} aria-label="Вложения">
              <label className={styles.toolBtn} title="Фото, документ или аудиофайл">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
                  <path
                    d="M8 4h5l3 3v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path d="M13 4v3h3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span className={styles.toolLabel}>Файл</span>
                <span className={styles.srOnly}>Прикрепить фото, документы или аудио</span>
                <input
                  type="file"
                  accept="image/*,audio/*,.pdf,.xlsx,.xls,.doc,.docx,.txt,.m4a,.mp3,.ogg,.webm,.wav"
                  multiple
                  hidden
                  disabled={voiceBusy}
                  onChange={(e) => {
                    void onPickChatFile(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                className={`${styles.toolBtn} ${styles.micBtn}`}
                aria-label={micOk ? 'Записать аудио' : 'Выбрать или записать аудио'}
                title={
                  micOk
                    ? 'Записать голос'
                    : 'Выбрать аудиофайл (запись в браузере — после HTTPS)'
                }
                disabled={voiceBusy}
                onClick={() => void startRecording()}
              >
                <svg
                  className={styles.micIcon}
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  aria-hidden
                  focusable="false"
                >
                  <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M5 11a7 7 0 0 0 14 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 18v3M9 21h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span className={styles.toolLabel}>Аудио</span>
              </button>
              <input
                ref={audioFallbackRef}
                type="file"
                accept="audio/*,.m4a,.mp3,.ogg,.webm,.wav"
                multiple
                hidden
                disabled={voiceBusy}
                onChange={(e) => {
                  void onPickAudio(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            <div className={styles.composeField}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Написать сообщение…"
                aria-label="Сообщение"
                disabled={voiceBusy}
              />
              <button type="submit" aria-label="Отправить" disabled={voiceBusy || !text.trim()}>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
                  <path
                    d="M4 10h11M10 5l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </form>
        )}
        {voiceError ? <p className={styles.err}>{voiceError}</p> : null}
        {voiceBusy ? <p className={styles.voiceHint}>Сохраняю…</p> : null}
      </section>

      <Link className={styles.backLink} to="/tasks">
        ← Все задачи
      </Link>
    </div>
  )
}
