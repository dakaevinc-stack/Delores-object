export type PinchPoint = { x: number; y: number }

function dist(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Два пальца → масштаб относительно центра щипка. */
export class PinchTracker {
  private pts = new Map<number, PinchPoint>()
  private lastDist = 0

  pointerCount(): number {
    return this.pts.size
  }

  isPinching(): boolean {
    return this.pts.size >= 2
  }

  down(id: number, p: PinchPoint): void {
    this.pts.set(id, p)
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()]
      this.lastDist = dist(a, b)
    }
  }

  move(id: number, p: PinchPoint): { factor: number; center: PinchPoint } | null {
    if (!this.pts.has(id)) return null
    this.pts.set(id, p)
    if (this.pts.size < 2) return null
    const [a, b] = [...this.pts.values()]
    const d = dist(a, b)
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (this.lastDist < 8) {
      this.lastDist = d
      return null
    }
    const factor = d / this.lastDist
    this.lastDist = d
    if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.002) return null
    return { factor, center }
  }

  up(id: number): void {
    this.pts.delete(id)
    if (this.pts.size < 2) this.lastDist = 0
  }

  clear(): void {
    this.pts.clear()
    this.lastDist = 0
  }
}
