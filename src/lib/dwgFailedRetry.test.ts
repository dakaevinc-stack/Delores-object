import { describe, expect, it } from 'vitest'
import { shouldRetryFailedPng, PNG_FAILED_RETRY_MS } from '../../server/dwg-preview.mjs'

describe('shouldRetryFailedPng', () => {
  it('retries when failed without timestamp', () => {
    expect(shouldRetryFailedPng({ pngPreviewStatus: 'failed' })).toBe(true)
  })

  it('waits for cooldown', () => {
    const now = Date.parse('2026-09-11T12:00:00.000Z')
    const recent = new Date(now - 60_000).toISOString()
    expect(
      shouldRetryFailedPng(
        { pngPreviewStatus: 'failed', pngPreviewFailedAtIso: recent },
        now,
      ),
    ).toBe(false)
    const old = new Date(now - PNG_FAILED_RETRY_MS - 1).toISOString()
    expect(
      shouldRetryFailedPng(
        { pngPreviewStatus: 'failed', pngPreviewFailedAtIso: old },
        now,
      ),
    ).toBe(true)
  })

  it('ignores non-failed', () => {
    expect(shouldRetryFailedPng({ pngPreviewStatus: 'ready' })).toBe(false)
  })
})
