/**
 * Точка разгрузки на объекте: куда водителю везти материал.
 * Хранится на объекте (не в каждой заявке) — ворота и штабель не прыгают каждый рейс.
 */

export type SiteDeliveryPoint = {
  lat: number
  lng: number
  /** Как подъехать / где разгружаться — своими словами. */
  hint: string
  /** Найденный или введённый адрес — то, что видит водитель. */
  address: string
  updatedAtIso: string
}

/** Центр Москвы — стартовый вид карты, пока точку не поставили. */
export const MOSCOW_MAP_CENTER = { lat: 55.7558, lng: 37.6173 } as const

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export function normalizeDeliveryPoint(row: unknown): SiteDeliveryPoint | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const lat = typeof r.lat === 'number' ? r.lat : Number(r.lat)
  const lng = typeof r.lng === 'number' ? r.lng : Number(r.lng)
  if (!isValidLatLng(lat, lng)) return null
  const rawAt = typeof r.updatedAtIso === 'string' ? r.updatedAtIso.trim() : ''
  const updatedAtIso =
    rawAt && !Number.isNaN(new Date(rawAt).getTime()) ? new Date(rawAt).toISOString() : new Date().toISOString()
  return {
    lat,
    lng,
    hint: typeof r.hint === 'string' ? r.hint.trim() : '',
    address: typeof r.address === 'string' ? r.address.trim() : '',
    updatedAtIso,
  }
}

export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/**
 * Точка на Яндекс.Картах (pt = долгота,широта).
 * https://yandex.ru/dev/yandex-apps-launch/maps/doc/concepts/yandexmaps-web.html
 */
export function yandexMapsPointUrl(point: Pick<SiteDeliveryPoint, 'lat' | 'lng'>): string {
  const pt = `${point.lng},${point.lat}`
  const params = new URLSearchParams({
    pt,
    z: '17',
    l: 'map',
  })
  return `https://yandex.ru/maps/?${params.toString()}`
}

/**
 * Построить маршрут до точки. rtext = широта,долгота (порядок другой, чем у pt).
 */
export function yandexMapsRouteUrl(point: Pick<SiteDeliveryPoint, 'lat' | 'lng'>): string {
  const rtext = `~${point.lat},${point.lng}`
  const params = new URLSearchParams({
    rtext,
    rtt: 'auto',
  })
  return `https://yandex.ru/maps/?${params.toString()}`
}

/** Глубокая ссылка в Яндекс.Навигатор (телефон водителя). */
export function yandexNaviUrl(point: Pick<SiteDeliveryPoint, 'lat' | 'lng'>): string {
  const params = new URLSearchParams({
    lat_to: String(point.lat),
    lon_to: String(point.lng),
  })
  return `yandexnavi://build_route_on_map?${params.toString()}`
}

/** Виджет Яндекс.Карт — превью без API-ключа. */
export function yandexMapWidgetUrl(point: Pick<SiteDeliveryPoint, 'lat' | 'lng'>): string {
  const ll = `${point.lng},${point.lat}`
  const pt = `${point.lng},${point.lat},pm2rdm`
  const params = new URLSearchParams({
    ll,
    z: '17',
    pt,
    l: 'map',
  })
  return `https://yandex.ru/map-widget/v1/?${params.toString()}`
}

/** Текст, который снабжение / бригадир кидает водителю в мессенджер. */
export function renderDriverDirections(siteName: string, point: SiteDeliveryPoint): string {
  const hint = point.hint.trim()
  const address = point.address.trim()
  const lines = [
    `Куда везти материал`,
    `Объект: ${siteName}`,
    address ? `Адрес: ${address}` : null,
    hint ? `Разгрузка: ${hint}` : null,
    `Точка: ${formatLatLng(point.lat, point.lng)}`,
    `Маршрут в Яндекс.Картах:`,
    yandexMapsRouteUrl(point),
  ]
  return lines.filter((x): x is string => x !== null).join('\n')
}
