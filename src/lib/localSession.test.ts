import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCAL_SESSION_KEY,
  clearLocalSession,
  loadLocalSession,
  saveLocalSession,
  sessionInitials,
} from './localSession'

describe('localSession', () => {
  afterEach(() => {
    clearLocalSession()
  })

  it('сохраняет и читает логин', () => {
    saveLocalSession('  Иванов  ')
    expect(loadLocalSession()?.login).toBe('Иванов')
    expect(localStorage.getItem(LOCAL_SESSION_KEY)).toContain('Иванов')
  })

  it('очищает сессию', () => {
    saveLocalSession('petrov')
    clearLocalSession()
    expect(loadLocalSession()).toBeNull()
  })

  it('строит инициалы', () => {
    expect(sessionInitials('Иван Петров')).toBe('ИП')
    expect(sessionInitials('admin')).toBe('AD')
  })
})
