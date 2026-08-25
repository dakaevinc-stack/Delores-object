/** Событие: парк техники изменился (реестр или правки единицы). */
export const FLEET_CHANGE_EVENT = 'deloresh-fleet-change'

export function emitFleetChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(FLEET_CHANGE_EVENT))
}
