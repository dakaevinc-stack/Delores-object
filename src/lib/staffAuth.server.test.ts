import { describe, expect, it } from 'vitest'

describe('staff-passwords server', () => {
  it('verifies known credentials without embedding secrets in tests', async () => {
    const { verifyStaffCredentials, STAFF_PASSWORDS } = await import(
      '../../server/staff-auth.mjs'
    )
    const login = 'Dakaev'
    const pass = STAFF_PASSWORDS[login]
    expect(typeof pass).toBe('string')
    expect(pass.length).toBeGreaterThan(0)
    const ok = verifyStaffCredentials(login, pass)
    expect(ok?.login).toBe(login)
    expect(verifyStaffCredentials(login, 'nope')).toBeNull()
  })
})
