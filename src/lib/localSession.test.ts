import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findStaffByLogin } from '../domain/staffDirectory'
import { clearLocalSession, loadLocalSession } from './localSession'
import { signInWithCredentials, signOutLocalSession } from './useLocalSession'

vi.mock('./siteFormsApi', () => ({
  loginStaffRemote: vi.fn(async (login: string, password: string) => {
    if (login === 'Dakaev' && password === 'test-pass') {
      return {
        ok: true as const,
        token: 'test-token-abc',
        login: 'Dakaev',
        fullName: 'Дакаев Ибрагим Мансурович',
        duty: 'deputy',
        dutyLabel: 'Заместитель генерального директора',
      }
    }
    return { ok: false as const, reason: 'auth' as const }
  }),
}))

describe('local session auth', () => {
  beforeEach(() => {
    localStorage.clear()
    clearLocalSession()
    signOutLocalSession()
  })

  it('finds public roster without password', () => {
    expect(findStaffByLogin('Dakaev')?.duty).toBe('deputy')
    expect(findStaffByLogin('dakaev')?.login).toBe('Dakaev')
  })

  it('signs in via remote token', async () => {
    const result = await signInWithCredentials('Dakaev', 'test-pass')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.token).toBe('test-token-abc')
    expect(loadLocalSession()?.token).toBe('test-token-abc')
  })

  it('rejects bad password', async () => {
    const result = await signInWithCredentials('Dakaev', 'wrong')
    expect(result.ok).toBe(false)
    expect(loadLocalSession()).toBeNull()
  })
})
