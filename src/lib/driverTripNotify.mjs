/**
 * Текст оповещения водителю о новом рейсе и разбор команд Telegram.
 * Чистый ESM — его импортируют и vitest, и Node (site-forms, tg-bridge).
 */

/**
 * @param {string} name
 */
export function normalizeDriverName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} tripName
 * @param {string} driverName
 */
export function namesMatchDriver(tripName, driverName) {
  const a = normalizeDriverName(tripName)
  const b = normalizeDriverName(driverName)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * @param {{ lat: number, lng: number }} point
 */
export function yandexMapsRouteUrl(point) {
  const params = new URLSearchParams({
    rtext: `~${point.lat},${point.lng}`,
    rtt: 'auto',
  })
  return `https://yandex.ru/maps/?${params.toString()}`
}

/**
 * @param {object} trip
 * @param {string} trip.siteName
 * @param {string} [trip.vehiclePlate]
 * @param {string} [trip.driverName]
 * @param {{ lat: number, lng: number, address?: string, hint?: string }} trip.point
 */
export function formatDriverTripNotifyText(trip) {
  const point = trip.point || {}
  const pickup = trip.pickup || {}
  const cargo = Array.isArray(trip.cargo) ? trip.cargo : []
  const cargoLines = cargo
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const title = String(item.title || '').trim()
      if (!title) return ''
      const qty = item.quantity != null && Number.isFinite(Number(item.quantity)) ? String(item.quantity) : ''
      const unit = String(item.unitLabel || '').trim()
      if (qty && unit) return `• ${title} — ${qty} ${unit}`
      if (qty) return `• ${title} — ${qty}`
      return `• ${title}`
    })
    .filter(Boolean)
  const note = String(trip.cargoNote || '').trim()
  if (note) cargoLines.push(`• ${note}`)

  const hasPickup = Boolean(String(pickup.address || '').trim())
  const lines = [
    'Новый маршрут',
    hasPickup ? `Забрать: ${String(pickup.address).trim()}` : null,
    pickup.hint ? `Погрузка: ${pickup.hint}` : null,
    cargoLines.length ? (hasPickup ? 'Что грузить:' : 'Что везти:') : null,
    ...cargoLines,
    trip.siteName ? `Везти: ${trip.siteName}` : null,
    trip.vehiclePlate ? `Машина: ${trip.vehiclePlate}` : null,
    point.address ? `Адрес: ${point.address}` : null,
    point.hint ? `Разгрузка: ${point.hint}` : null,
    Number.isFinite(point.lat) && Number.isFinite(point.lng)
      ? `Маршрут: ${yandexMapsRouteUrl(point)}`
      : null,
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Команда из личного чата с ботом.
 *
 * @param {string} text
 * @returns {{ type: 'stop' } | { type: 'start' } | { type: 'bind', name: string } | { type: 'help' } | null}
 */
export function parseDriverTelegramCommand(text) {
  const raw = String(text || '').replace(/\u00a0/g, ' ').trim()
  if (!raw) return null

  const cmd = raw.replace(/@[\w]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (/^\/(?:stop|отвяз)/i.test(cmd)) {
    return { type: 'stop' }
  }

  const start = cmd.match(/^\/start(?:\s+(.+))?$/i)
  if (start) {
    const payload = (start[1] || '').trim()
    if (!payload) return { type: 'start' }
    return { type: 'bind', name: clipDriverName(payload) }
  }

  const bind = cmd.match(/^\/(?:bind|фамилия)\s+(.+)$/i)
  if (bind) return { type: 'bind', name: clipDriverName(bind[1]) }

  if (cmd.startsWith('/')) return { type: 'help' }

  if (cmd.includes('\n')) return null
  if (cmd.length < 2 || cmd.length > 80) return null
  return { type: 'bind', name: clipDriverName(cmd) }
}

/** @param {string} name */
function clipDriverName(name) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}
