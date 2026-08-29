import { describe, expect, it } from 'vitest'
import { headerBoundsInflated } from './dwgViewerFit'
import type { DxfDocument } from '@cadview/core'

function doc(
  entities: DxfDocument['entities'],
  extMin?: { x: number; y: number; z: number },
  extMax?: { x: number; y: number; z: number },
): DxfDocument {
  return {
    header: {
      acadVersion: 'AC1032',
      insUnits: 0,
      measurement: 0,
      ltScale: 1,
      extMin,
      extMax,
    },
    layers: new Map(),
    lineTypes: new Map(),
    styles: new Map(),
    blocks: new Map(),
    entities,
  }
}

describe('headerBoundsInflated', () => {
  it('detects huge header vs small entity bounds', () => {
    const d = doc(
      [
        {
          type: 'LINE',
          layer: '0',
          color: 256,
          lineType: 'BYLAYER',
          lineTypeScale: 1,
          lineWeight: -1,
          visible: true,
          extrusion: { x: 0, y: 0, z: 1 },
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 50, z: 0 },
        },
      ],
      { x: -1e6, y: -1e6, z: 0 },
      { x: 1e6, y: 1e6, z: 0 },
    )
    expect(headerBoundsInflated(d)).toBe(true)
  })

  it('accepts header close to entity bounds', () => {
    const d = doc(
      [
        {
          type: 'LINE',
          layer: '0',
          color: 256,
          lineType: 'BYLAYER',
          lineTypeScale: 1,
          lineWeight: -1,
          visible: true,
          extrusion: { x: 0, y: 0, z: 1 },
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 50, z: 0 },
        },
      ],
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 50, z: 0 },
    )
    expect(headerBoundsInflated(d)).toBe(false)
  })
})
