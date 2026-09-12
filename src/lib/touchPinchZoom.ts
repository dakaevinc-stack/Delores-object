export type PinchPoint = { x: number; y: number }

export type PinchGesture = {
  factor: number
  center: PinchPoint
  /** Сдвиг центра щипка — двухпальцевый pan как в DWG FastView. */
  panX: number
  panY: number
}

function dist(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Два пальца → масштаб + pan относительно центра щипка. */
export class PinchTracker {
  private pts = new Map<number, PinchPoint>()
  private lastDist = 0
  private lastCenter: PinchPoint | null = null

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
      this.lastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }

  move(id: number, p: PinchPoint): PinchGesture | null {
    if (!this.pts.has(id)) return null
    this.pts.set(id, p)
    if (this.pts.size < 2) return null
    const [a, b] = [...this.pts.values()]
    const d = dist(a, b)
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const panX = this.lastCenter ? center.x - this.lastCenter.x : 0
    const panY = this.lastCenter ? center.y - this.lastCenter.y : 0
    this.lastCenter = center

    let factor = 1
    if (this.lastDist >= 4) {
      const raw = d / this.lastDist
      this.lastDist = d
      if (Number.isFinite(raw) && raw > 0 && Math.abs(raw - 1) >= 0.001) {
        factor = Math.min(1.28, Math.max(1 / 1.28, raw))
      }
    } else {
      this.lastDist = d
    }

    if (Math.abs(factor - 1) < 0.001 && Math.hypot(panX, panY) < 0.4) return null
    return { factor, center, panX, panY }
  }

  up(id: number): void {
    this.pts.delete(id)
    if (this.pts.size < 2) {
      this.lastDist = 0
      this.lastCenter = null
    } else {
      const [a, b] = [...this.pts.values()]
      this.lastDist = dist(a, b)
      this.lastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }

  /** Оставшийся палец после щипка — чтобы снова включить pan. */
  remaining(): { id: number; point: PinchPoint } | null {
    if (this.pts.size !== 1) return null
    const [id, point] = [...this.pts.entries()][0]!
    return { id, point }
  }

  clear(): void {
    this.pts.clear()
    this.lastDist = 0
    this.lastCenter = null
  }
}
