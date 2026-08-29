import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { parseDxf, type DxfDocument, type DxfEntity } from '@cadview/core'
import {
  findRegionAtWorldPoint,
  hatchPathToPolygon,
  pointInPolygon,
  polylineWithBulgesToPolygon,
  tessellateBulge,
} from './dwgRegionPick'

describe('dwgRegionPick', () => {
  it('tessellates quarter-circle bulge to origin-centered arc', () => {
    const bulge = Math.tan(Math.PI / 8)
    const pts = tessellateBulge({ x: 1, y: 0 }, { x: 0, y: 1 }, bulge)
    expect(pts.length).toBeGreaterThan(2)
    const mid = pts[Math.floor(pts.length / 2)]
    expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(1, 2)
  })

  it('computes closed polyline area with no bulge', () => {
    const poly = polylineWithBulgesToPolygon(
      [
        { x: 0, y: 0, bulge: 0 },
        { x: 10, y: 0, bulge: 0 },
        { x: 10, y: 4, bulge: 0 },
        { x: 0, y: 4, bulge: 0 },
      ],
      true,
    )
    expect(poly).not.toBeNull()
    expect(pointInPolygon({ x: 5, y: 2 }, poly!)).toBe(true)
    expect(pointInPolygon({ x: 20, y: 2 }, poly!)).toBe(false)
  })

  it('treats inner hatch path as a hole, not a fill', () => {
    const doc = {
      header: { insUnits: 6 },
      layers: new Map(),
      lineTypes: new Map(),
      styles: new Map(),
      blocks: new Map(),
      entities: [
        {
          type: 'HATCH',
          layer: 'A',
          visible: true,
          boundaryPaths: [
            {
              type: 'polyline',
              isClosed: true,
              vertices: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 },
                { x: 0, y: 10 },
              ],
            },
            {
              type: 'polyline',
              isClosed: true,
              vertices: [
                { x: 4, y: 4 },
                { x: 6, y: 4 },
                { x: 6, y: 6 },
                { x: 4, y: 6 },
              ],
            },
          ],
        },
      ],
    } as unknown as DxfDocument

    const fill = findRegionAtWorldPoint(doc, { x: 1, y: 1 })
    expect(fill).not.toBeNull()
    expect(fill!.area).toBeCloseTo(100 - 4, 5)
    expect(fill!.holes).toHaveLength(1)

    const inHole = findRegionAtWorldPoint(doc, { x: 5, y: 5 })
    expect(inHole).toBeNull()
  })

  it('finds hatch inside an INSERT block', () => {
    const hatch = {
      type: 'HATCH',
      layer: 'A',
      visible: true,
      boundaryPaths: [
        {
          type: 'polyline',
          isClosed: true,
          vertices: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
        },
      ],
    } as unknown as DxfEntity
    const doc = {
      header: { insUnits: 6 },
      layers: new Map(),
      lineTypes: new Map(),
      styles: new Map(),
      blocks: new Map([['LOT', { name: 'LOT', basePoint: { x: 0, y: 0, z: 0 }, entities: [hatch], flags: 0 }]]),
      entities: [
        {
          type: 'INSERT',
          layer: 'A',
          visible: true,
          blockName: 'LOT',
          insertionPoint: { x: 100, y: 200, z: 0 },
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          rotation: 0,
        },
      ],
    } as unknown as DxfDocument

    const region = findRegionAtWorldPoint(doc, { x: 101, y: 201 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(4, 5)
    expect(findRegionAtWorldPoint(doc, { x: 1, y: 1 })).toBeNull()
  })

  it('builds polygon from hatch line edges', () => {
    const poly = hatchPathToPolygon({
      edges: [
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 3, y: 0 } },
        { type: 'line', start: { x: 3, y: 0 }, end: { x: 3, y: 2 } },
        { type: 'line', start: { x: 3, y: 2 }, end: { x: 0, y: 2 } },
        { type: 'line', start: { x: 0, y: 2 }, end: { x: 0, y: 0 } },
      ],
    })
    expect(poly).not.toBeNull()
    expect(pointInPolygon({ x: 1.5, y: 1 }, poly!)).toBe(true)
  })

  it('ignores CIRCLE entities — only HATCH fills are selectable', () => {
    const doc = {
      header: { insUnits: 6 },
      layers: new Map(),
      lineTypes: new Map(),
      styles: new Map(),
      blocks: new Map(),
      entities: [
        {
          type: 'CIRCLE',
          layer: '0',
          visible: true,
          center: { x: 0, y: 0, z: 0 },
          radius: 5,
        },
        {
          type: 'LWPOLYLINE',
          layer: '0',
          visible: true,
          closed: true,
          vertices: [
            { x: -1, y: -1, bulge: 0 },
            { x: 1, y: -1, bulge: 0 },
            { x: 1, y: 1, bulge: 0 },
            { x: -1, y: 1, bulge: 0 },
          ],
        },
        {
          type: 'HATCH',
          layer: 'A',
          visible: true,
          boundaryPaths: [
            {
              type: 'polyline',
              isClosed: true,
              vertices: [
                { x: -10, y: -10 },
                { x: 10, y: -10 },
                { x: 10, y: 10 },
                { x: -10, y: 10 },
              ],
            },
          ],
        },
      ],
    } as unknown as DxfDocument

    const region = findRegionAtWorldPoint(doc, { x: 0, y: 0 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(400, 5)
    expect(region!.vertices.length).toBe(4)
  })

  it('ignores nested circular hatch and picks the covering area', () => {
    const doc = {
      header: { insUnits: 6 },
      layers: new Map(),
      lineTypes: new Map(),
      styles: new Map(),
      blocks: new Map(),
      entities: [
        {
          type: 'HATCH',
          layer: 'cover',
          visible: true,
          boundaryPaths: [
            {
              type: 'polyline',
              isClosed: true,
              vertices: [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 20, y: 20 },
                { x: 0, y: 20 },
              ],
            },
          ],
        },
        {
          type: 'HATCH',
          layer: 'well',
          visible: true,
          boundaryPaths: [
            {
              type: 'edges',
              edges: [
                {
                  type: 'arc',
                  center: { x: 10, y: 10 },
                  radius: 1.5,
                  startAngle: 0,
                  endAngle: Math.PI * 2,
                  ccw: true,
                },
              ],
            },
          ],
        },
      ],
    } as unknown as DxfDocument

    const region = findRegionAtWorldPoint(doc, { x: 10, y: 10 })
    expect(region).not.toBeNull()
    expect(region!.area).toBeCloseTo(400, 5)
    expect(region!.layer).toBe('cover')
  })

  it('does not select a lone circular hatch', () => {
    const doc = {
      header: { insUnits: 6 },
      layers: new Map(),
      lineTypes: new Map(),
      styles: new Map(),
      blocks: new Map(),
      entities: [
        {
          type: 'HATCH',
          layer: 'well',
          visible: true,
          boundaryPaths: [
            {
              type: 'edges',
              edges: [
                {
                  type: 'arc',
                  center: { x: 0, y: 0 },
                  radius: 2,
                  startAngle: 0,
                  endAngle: Math.PI * 2,
                  ccw: true,
                },
              ],
            },
          ],
        },
      ],
    } as unknown as DxfDocument

    expect(findRegionAtWorldPoint(doc, { x: 0, y: 0 })).toBeNull()
  })

  it('finds hatch under tap on brusilova plan', () => {
    const doc = parseDxf(gunzipSync(readFileSync('/tmp/brusilova.dxf.gz')).toString('utf8'))
    const region = findRegionAtWorldPoint(doc, { x: 4730, y: -18547 })
    expect(region).not.toBeNull()
    expect(region!.vertices.length).toBeGreaterThanOrEqual(3)
    expect(region!.area).toBeGreaterThan(0)
    expect(pointInPolygon({ x: 4730, y: -18547 }, region!.vertices)).toBe(true)
  })
})
