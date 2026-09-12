import { describe, expect, it } from 'vitest'
import { completedWorksFolderId, completedWorksFolderName } from './completedWorksDocs'

describe('completedWorksDocs', () => {
  it('builds per-site folder names', () => {
    expect(completedWorksFolderName('Брусилова')).toBe('Выполненные работы Брусилова')
    expect(completedWorksFolderName('пос. Кирпичного завода')).toBe(
      'Выполненные работы Кирпичного завода',
    )
    expect(completedWorksFolderId('brusilova')).toBe('completed-works-brusilova')
  })
})
