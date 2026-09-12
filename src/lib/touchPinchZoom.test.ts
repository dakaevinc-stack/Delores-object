import { describe, expect, it } from 'vitest'
import { PinchTracker } from './touchPinchZoom'

describe('PinchTracker', () => {
  it('returns zoom factor when two pointers spread', () => {
    const t = new PinchTracker()
    t.down(1, { x: 100, y: 100 })
    t.down(2, { x: 200, y: 100 })
    const hit = t.move(2, { x: 260, y: 100 })
    expect(hit).not.toBeNull()
    expect(hit!.factor).toBeGreaterThan(1)
    expect(hit!.center.x).toBeCloseTo(180, 0)
  })

  it('clears after both pointers up', () => {
    const t = new PinchTracker()
    t.down(1, { x: 0, y: 0 })
    t.down(2, { x: 100, y: 0 })
    t.up(1)
    expect(t.isPinching()).toBe(false)
    t.up(2)
    t.clear()
    expect(t.pointerCount()).toBe(0)
  })

  it('reports remaining finger after one pointer lifts from a pinch', () => {
    const pinch = new PinchTracker()
    pinch.down(1, { x: 10, y: 10 })
    pinch.down(2, { x: 40, y: 10 })
    expect(pinch.isPinching()).toBe(true)
    pinch.up(2)
    expect(pinch.isPinching()).toBe(false)
    expect(pinch.pointerCount()).toBe(1)
    const left = pinch.remaining()
    expect(left).toEqual({ id: 1, point: { x: 10, y: 10 } })
  })

  it('remaining is null with 0 or 2 pointers', () => {
    const pinch = new PinchTracker()
    expect(pinch.remaining()).toBeNull()
    pinch.down(1, { x: 0, y: 0 })
    pinch.down(2, { x: 1, y: 1 })
    expect(pinch.remaining()).toBeNull()
  })
})
