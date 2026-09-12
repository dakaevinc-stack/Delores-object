import { describe, expect, it } from 'vitest'
import { isStaffBlobRef, slimMediaRef } from './staffTaskMedia'

describe('staffTaskMedia', () => {
  it('detects blob refs', () => {
    expect(isStaffBlobRef('/api/staff-tasks/blobs/stb-abc')).toBe(true)
    expect(isStaffBlobRef('data:image/png;base64,xx')).toBe(false)
  })

  it('slims huge data urls but keeps blob paths', () => {
    expect(slimMediaRef('/api/staff-tasks/blobs/x')).toBe('/api/staff-tasks/blobs/x')
    expect(slimMediaRef(`data:text/plain;base64,${'a'.repeat(5000)}`)).toBe('')
    expect(slimMediaRef('data:text/plain;base64,abc')).toBe('data:text/plain;base64,abc')
  })
})
