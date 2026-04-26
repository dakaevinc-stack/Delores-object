import { describe, expect, it, beforeEach } from 'vitest'
import {
  exportDeloreshLocalStorageSnapshot,
  importDeloreshLocalStorageSnapshot,
  listDeloreshLocalStorageKeys,
} from './deloreshLocalStorageBackup'

describe('deloreshLocalStorageBackup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('собирает только известные ключи', () => {
    localStorage.setItem('fleet:registry', '{"added":[],"removedIds":[],"customCategories":[]}')
    localStorage.setItem('fleet:overrides:x', '{"specs":{"year":2020}}')
    localStorage.setItem('deloresh-procurement-requests:s1:v1', '[]')
    localStorage.setItem('deloresh-brigadier-reports:s1:v1', '[]')
    localStorage.setItem('other-app', 'noise')
    const keys = listDeloreshLocalStorageKeys()
    expect(keys).toContain('fleet:registry')
    expect(keys).toContain('fleet:overrides:x')
    expect(keys).toContain('deloresh-procurement-requests:s1:v1')
    expect(keys).toContain('deloresh-brigadier-reports:s1:v1')
    expect(keys.some((k) => k === 'other-app')).toBe(false)
  })

  it('экспорт и импорт круговой', () => {
    localStorage.setItem('deloresh-user-sites:v1', '[]')
    const snap = exportDeloreshLocalStorageSnapshot()
    localStorage.clear()
    const r = importDeloreshLocalStorageSnapshot(snap)
    expect(r.applied).toBeGreaterThan(0)
    expect(localStorage.getItem('deloresh-user-sites:v1')).toBe('[]')
  })
})
