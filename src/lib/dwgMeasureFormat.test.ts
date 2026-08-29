import { describe, expect, it } from 'vitest'
import {
  buildRegionEdgeScreenLabels,
  closedPolygonEdgeLengths,
  extractContourMeasureSides,
  formatLinear,
  measureBetween,
  polygonArea,
  polygonPerimeter,
  regionPerimeterRingsMeters,
} from './dwgMeasureFormat'

describe('dwgMeasureFormat', () => {
  it('computes rectangle area', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]
    expect(polygonArea(rect)).toBe(50)
    expect(polygonPerimeter(rect, true)).toBe(30)
  })

  it('formats linear values in meters', () => {
    expect(formatLinear(12.456)).toBe('12.46 м')
  })

  it('measures exact length between two points', () => {
    const m = measureBetween({ x: 0, y: 0 }, { x: 3, y: 4 })
    expect(m.distance).toBe(5)
    expect(m.deltaX).toBe(3)
    expect(m.deltaY).toBe(4)
  })

  it('lists closed polygon edge lengths and sums to perimeter', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]
    const edges = closedPolygonEdgeLengths(rect)
    expect(edges).toEqual([10, 5, 10, 5])
    expect(edges.reduce((s, v) => s + v, 0)).toBe(polygonPerimeter(rect, true))
  })

  it('merges collinear points into four rectangle sides', () => {
    const noisyRect = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 7, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: 10, y: 5 },
      { x: 6, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 3 },
    ]
    const sides = extractContourMeasureSides(noisyRect)
    expect(sides).toHaveLength(4)
    expect(sides.every((s) => s.shape === 'line')).toBe(true)
    const sum = sides.reduce((acc, s) => acc + s.length, 0)
    expect(sum).toBeCloseTo(polygonPerimeter(noisyRect, true), 6)
  })

  it('treats bent chain as one arc side with path length', () => {
    const arcish = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 12 },
      { x: 0, y: 10 },
    ]
    const sides = extractContourMeasureSides(arcish, { cornerDeg: 35, arcChordRatio: 0.02 })
    expect(sides.length).toBeGreaterThanOrEqual(3)
    expect(sides.length).toBeLessThanOrEqual(5)
    const sum = sides.reduce((acc, s) => acc + s.length, 0)
    expect(sum).toBeCloseTo(polygonPerimeter(arcish, true), 6)
  })

  it('builds perimeter rings in meters for world space', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    const rings = regionPerimeterRingsMeters({
      outline: square,
      holes: [],
      space: 'world',
      insUnits: 6,
      pixelsPerUnit: 1,
    })
    expect(rings).toHaveLength(1)
    expect(rings[0].edges).toHaveLength(4)
    expect(rings[0].edges.map((e) => e.lengthM)).toEqual([4, 4, 4, 4])
  })

  it('places edge labels at outward screen midpoints', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const rings = regionPerimeterRingsMeters({
      outline: square,
      holes: [],
      space: 'world',
      insUnits: 6,
      pixelsPerUnit: 1,
    })
    const labels = buildRegionEdgeScreenLabels({
      outline: square,
      holes: [],
      rings,
      toScreen: (p) => [p.x, p.y],
      pushPx: 0,
      minScreenEdgePx: 0,
    })
    expect(labels).toHaveLength(4)
    expect(labels[0].side).toBe(1)
    expect(labels[0].x).toBeCloseTo(50, 0)
    expect(labels[0].y).toBeCloseTo(0, 0)
    expect(labels[1].side).toBe(2)
    expect(labels[1].x).toBeCloseTo(100, 0)
    expect(labels[1].y).toBeCloseTo(50, 0)
  })
})
