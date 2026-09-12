/**
 * Какой DWG показывать как чертёж объекта.
 * Порядок важен, поэтому правило вынесено из компонента и закрыто тестами.
 */

export type FeaturedDrawingCandidate = {
  uploadedAtIso: string
  featuredAtIso?: string
  pngPreviewStatus?: string
  pngPreviewAtIso?: string
}

function hasServerPlan(row: FeaturedDrawingCandidate): boolean {
  return row.pngPreviewStatus === 'ready' || Boolean(row.pngPreviewAtIso)
}

export function pickFeaturedDrawing<T extends FeaturedDrawingCandidate>(
  drawings: readonly T[],
): T | null {
  if (drawings.length === 0) return null
  return [...drawings].sort((a, b) => {
    // 1. Выбранный вручную чертёж главнее всего: иначе при замене карточка
    //    молча переключилась бы на старый файл с уже готовым планом.
    const af = a.featuredAtIso ?? ''
    const bf = b.featuredAtIso ?? ''
    if (af !== bf) return bf.localeCompare(af)
    // 2. Никто не выбирал — берём тот, чей план на сервере уже собран,
    //    чтобы недогруженная загрузка не перекрывала рабочий чертёж.
    const ar = hasServerPlan(a) ? 1 : 0
    const br = hasServerPlan(b) ? 1 : 0
    if (ar !== br) return br - ar
    // 3. Прочее равно — свежий.
    return b.uploadedAtIso.localeCompare(a.uploadedAtIso)
  })[0]!
}
