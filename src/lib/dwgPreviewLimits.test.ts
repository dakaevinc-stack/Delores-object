import { describe, expect, it } from 'vitest'
import { pickPngRenderWidth } from '../../server/dwg-preview.mjs'

describe('pickPngRenderWidth (VPS-safe defaults)', () => {
  it('caps default renders at 2048 for fast open', () => {
    const small = Buffer.alloc(500_000)
    expect(pickPngRenderWidth(small)).toBe(2048)
  })

  it('shrinks huge DWG further', () => {
    expect(pickPngRenderWidth(Buffer.alloc(9_000_000))).toBe(2048)
    expect(pickPngRenderWidth(Buffer.alloc(17_000_000))).toBe(1536)
  })

  it('respects explicit width', () => {
    expect(pickPngRenderWidth(Buffer.alloc(100), 1024)).toBe(1024)
  })
})
