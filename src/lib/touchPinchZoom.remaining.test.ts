import { describe, expect, it } from 'vitest'
import { PinchTracker } from './touchPinchZoom'

describe('PinchTracker remaining-finger handoff', () => {
  it('keeps the other finger after one lifts from a pinch', () => {
    const pinch = new PinchTracker()
    pinch.down(1, { x: 100, y: 100 })
    pinch.down(2, { x: 200, y: 100 })
    expect(pinch.isPinching()).toBe(true)
    const moved = pinch.move(2, { x: 260, y: 100 })
    expect(moved?.factor).toBeGreaterThan(1)
    pinch.up(2)
    expect(pinch.isPinching()).toBe(false)
    expect(pinch.remaining()).toEqual({ id: 1, point: { x: 100, y: 100 } })
  })

  it('returns null remaining after both fingers up', () => {
    const pinch = new PinchTracker()
    pinch.down(1, { x: 0, y: 0 })
    pinch.down(2, { x: 40, y: 0 })
    pinch.up(1)
    pinch.up(2)
    expect(pinch.remaining()).toBeNull()
    expect(pinch.pointerCount()).toBe(0)
  })

  it('re-arms pinch when a second finger returns', () => {
    const pinch = new PinchTracker()
    pinch.down(1, { x: 10, y: 10 })
    pinch.down(2, { x: 50, y: 10 })
    pinch.up(2)
    expect(pinch.remaining()?.id).toBe(1)
    pinch.down(3, { x: 80, y: 10 })
    expect(pinch.isPinching()).toBe(true)
    const g = pinch.move(3, { x: 120, y: 10 })
    expect(g).not.toBeNull()
  })
})
