import { describe, expect, it } from 'vitest'
import {
  canCreateStaffTasks,
  countUnseenForAssignee,
  filterStaffTasks,
  isTaskForLogin,
  localDateKey,
  taskDueLabel,
  type StaffTask,
} from './staffTask'
import { mergeStaffTasks } from '../lib/staffTasksRepository'

function task(partial: Partial<StaffTask> & Pick<StaffTask, 'id' | 'title'>): StaffTask {
  const today = localDateKey()
  return {
    body: '',
    dueDate: today,
    dueTime: '',
    status: 'new',
    assigneeLogin: 'Gevenyan',
    assigneeName: 'Гевенян',
    creatorLogin: 'Isaev',
    creatorName: 'Исаев',
    siteId: null,
    siteName: null,
    attachments: [],
    comments: [],
    createdAtIso: '2026-01-01T00:00:00.000Z',
    updatedAtIso: '2026-01-01T00:00:00.000Z',
    seenByAssignee: false,
    ...partial,
  }
}

describe('staffTask', () => {
  it('allows create for manager/deputy/pto/dispatcher only', () => {
    expect(canCreateStaffTasks('manager')).toBe(true)
    expect(canCreateStaffTasks('deputy')).toBe(true)
    expect(canCreateStaffTasks('pto')).toBe(true)
    expect(canCreateStaffTasks('dispatcher')).toBe(true)
    expect(canCreateStaffTasks('brigadier')).toBe(false)
    expect(canCreateStaffTasks('driver')).toBe(false)
    expect(canCreateStaffTasks('supply')).toBe(false)
  })

  it('matches assignee and creator case-insensitively', () => {
    const t = task({ id: '1', title: 'A', assigneeLogin: 'Gevenyan', creatorLogin: 'Isaev' })
    expect(isTaskForLogin(t, 'gevenyan')).toBe(true)
    expect(isTaskForLogin(t, 'ISAEV')).toBe(true)
    expect(isTaskForLogin(t, 'Dakaev')).toBe(false)
  })

  it('filters assigned_to_me and today', () => {
    const today = localDateKey()
    const list = [
      task({ id: '1', title: 'Mine', assigneeLogin: 'Gevenyan', dueDate: today, status: 'new' }),
      task({
        id: '2',
        title: 'Created',
        assigneeLogin: 'Dakaev',
        creatorLogin: 'Gevenyan',
        dueDate: today,
      }),
      task({
        id: '3',
        title: 'Later',
        assigneeLogin: 'Gevenyan',
        dueDate: '2099-01-01',
        status: 'done',
      }),
    ]
    expect(
      filterStaffTasks(list, { login: 'Gevenyan', filter: 'assigned_to_me' }).map((t) => t.id),
    ).toEqual(['1', '3'])
    expect(
      filterStaffTasks(list, { login: 'Gevenyan', filter: 'today' }).map((t) => t.id),
    ).toEqual(['1', '2'])
  })

  it('counts unseen for assignee', () => {
    const list = [
      task({ id: '1', title: 'A', seenByAssignee: false, status: 'new' }),
      task({ id: '2', title: 'B', seenByAssignee: true, status: 'new' }),
      task({ id: '3', title: 'C', seenByAssignee: false, status: 'done' }),
      task({ id: '4', title: 'D', assigneeLogin: 'Other', seenByAssignee: false }),
    ]
    expect(countUnseenForAssignee(list, 'Gevenyan')).toBe(1)
  })

  it('formats due label', () => {
    const today = localDateKey()
    expect(taskDueLabel(task({ id: '1', title: 'T', dueDate: today, dueTime: '18:00' }))).toBe(
      '18:00',
    )
    expect(taskDueLabel(task({ id: '2', title: 'T', dueDate: today, dueTime: '' }))).toBe(
      'сегодня',
    )
  })

  it('merges remote and local by updatedAt and unions comments', () => {
    const local = task({
      id: '1',
      title: 'Local',
      updatedAtIso: '2026-01-02T00:00:00.000Z',
      status: 'in_progress',
      comments: [
        {
          id: 'c1',
          authorLogin: 'A',
          authorName: 'A',
          text: 'hi',
          createdAtIso: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const remote = task({
      id: '1',
      title: 'Remote',
      updatedAtIso: '2026-01-01T00:00:00.000Z',
      status: 'new',
      seenByAssignee: true,
      comments: [
        {
          id: 'c2',
          authorLogin: 'B',
          authorName: 'B',
          text: 'yo',
          createdAtIso: '2026-01-01T01:00:00.000Z',
        },
      ],
    })
    const merged = mergeStaffTasks([local], [remote])
    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('Local')
    expect(merged[0].status).toBe('in_progress')
    expect(merged[0].seenByAssignee).toBe(true)
    expect(merged[0].comments.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })
})
