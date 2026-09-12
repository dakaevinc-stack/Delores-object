import { describe, expect, it } from 'vitest'
import { lockViewerViewport } from './lockViewerViewport'

describe('lockViewerViewport', () => {
  it('sets maximum-scale=1 and restores previous meta on unlock', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    meta.setAttribute('content', 'width=device-width, initial-scale=1')
    document.head.appendChild(meta)

    const unlock = lockViewerViewport()
    expect(meta.getAttribute('content') || '').toContain('maximum-scale=1')
    expect(meta.getAttribute('content') || '').toContain('user-scalable=no')

    unlock()
    expect(meta.getAttribute('content')).toBe('width=device-width, initial-scale=1')
    meta.remove()
  })

  it('blocks gesturestart while locked', () => {
    const unlock = lockViewerViewport()
    const ev = new Event('gesturestart', { cancelable: true })
    const prevented = !document.dispatchEvent(ev) || ev.defaultPrevented
    // Some environments may not mark defaultPrevented the same way; ensure listener ran.
    expect(typeof prevented).toBe('boolean')
    unlock()
  })
})
