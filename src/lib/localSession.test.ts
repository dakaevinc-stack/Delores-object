import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCAL_SESSION_KEY,
  clearLocalSession,
  loadLocalSession,
  saveLocalSession,
  sessionInitials,
} from './localSession'
import { findStaffByCredentials } from '../domain/staffDirectory'
import { signInWithCredentials, signOutLocalSession } from './useLocalSession'

describe('localSession', () => {
  afterEach(() => {
    clearLocalSession()
  })

  it('сохраняет и читает профиль с должностью', () => {
    saveLocalSession({
      login: 'Dakaev',
      fullName: 'Dakaev',
      duty: 'deputy',
      dutyLabel: 'Заместитель генерального директора',
    })
    const session = loadLocalSession()
    expect(session?.login).toBe('Dakaev')
    expect(session?.duty).toBe('deputy')
    expect(localStorage.getItem(LOCAL_SESSION_KEY)).toContain('Dakaev')
  })

  it('очищает сессию', () => {
    saveLocalSession({
      login: 'Dakaev',
      fullName: 'Dakaev',
      duty: 'deputy',
      dutyLabel: 'Заместитель генерального директора',
    })
    clearLocalSession()
    expect(loadLocalSession()).toBeNull()
  })

  it('строит инициалы', () => {
    expect(sessionInitials('Дакаев Ибрагим Мансурович')).toBe('ДИ')
    expect(sessionInitials('Dakaev')).toBe('DA')
    expect(sessionInitials('Иван Петров')).toBe('ИП')
  })
})

describe('staffDirectory / signIn', () => {
  afterEach(() => {
    signOutLocalSession()
  })

  it('принимает верные учётные данные', () => {
    expect(findStaffByCredentials('Dakaev', 'Ameda095')?.duty).toBe('deputy')
    const result = signInWithCredentials('Dakaev', 'Ameda095')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.login).toBe('Dakaev')
      expect(result.session.fullName).toBe('Дакаев Ибрагим Мансурович')
      expect(result.session.duty).toBe('deputy')
    }
  })

  it('отклоняет неверный пароль и логин в другом регистре', () => {
    expect(findStaffByCredentials('Dakaev', 'wrong')).toBeNull()
    expect(findStaffByCredentials('dakaev', 'Ameda095')).toBeNull()
    const result = signInWithCredentials('Dakaev', 'wrong')
    expect(result.ok).toBe(false)
  })
})
