import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  loadStaffTasks,
  subscribeStaffTasks,
  createStaffTask,
  updateStaffTaskStatus,
  markStaffTaskSeen,
  addStaffTaskComment,
  addStaffTaskAttachment,
  syncStaffTasksFromRemote,
  type CreateStaffTaskInput,
} from '../lib/staffTasksRepository'
import type { StaffTask, StaffTaskAttachment, StaffTaskStatus } from '../domain/staffTask'

function getSnapshot(): StaffTask[] {
  return loadStaffTasks()
}

function getServerSnapshot(): StaffTask[] {
  return []
}

export function useStaffTasks() {
  const tasks = useSyncExternalStore(subscribeStaffTasks, getSnapshot, getServerSnapshot)

  useEffect(() => {
    let cancelled = false
    const pull = () => {
      void syncStaffTasksFromRemote().then(() => {
        if (cancelled) return
      })
    }
    pull()
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    const interval = window.setInterval(pull, 20_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', pull)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', pull)
    }
  }, [])

  const create = useCallback((input: CreateStaffTaskInput) => createStaffTask(input), [])
  const setStatus = useCallback(
    (id: string, status: StaffTaskStatus) => updateStaffTaskStatus(id, status),
    [],
  )
  const markSeen = useCallback((id: string, login: string) => markStaffTaskSeen(id, login), [])
  const addComment = useCallback(
    (id: string, authorLogin: string, authorName: string, text: string) =>
      addStaffTaskComment(id, { authorLogin, authorName, text }),
    [],
  )
  const addFile = useCallback(
    (id: string, attachment: StaffTaskAttachment) => addStaffTaskAttachment(id, attachment),
    [],
  )

  return { tasks, create, setStatus, markSeen, addComment, addFile }
}
