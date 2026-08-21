import { tripCargoLines, type DriverTrip } from './driverTrip'
import {
  renderDriverDirections,
  yandexMapsRouteUrl,
  yandexNaviUrl,
  type SiteDeliveryPoint,
} from './siteDeliveryPoint'

/** Боевой адрес — в шаринге с localhost подставляем его, чтобы водитель открыл кабинет. */
export const PUBLIC_APP_ORIGIN = 'http://94.242.58.24'

export function driverCabinetUrl(origin: string): string {
  let base = origin.replace(/\/$/, '') || PUBLIC_APP_ORIGIN
  try {
    const raw = base.includes('://') ? base : `http://${base}`
    const host = new URL(raw).hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      base = PUBLIC_APP_ORIGIN
    }
  } catch {
    base = PUBLIC_APP_ORIGIN
  }
  return `${base}/driver`
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Deep link: открыть приложение Telegram (текст на Desktop часто не подставляется). */
export function telegramAppShareUrl(text: string, url: string): string {
  const body = [text.trim(), url.trim()].filter(Boolean).join('\n\n')
  return `tg://msg?text=${encodeURIComponent(body)}`
}

/** Полный текст для буфера / мессенджера. */
export function telegramSharePayload(text: string, url: string): string {
  return [text.trim(), url.trim()].filter(Boolean).join('\n\n')
}

/** Открыть приложение Telegram (без веб-страницы t.me). */
export function openTelegramApp(text: string, url: string): void {
  if (typeof window === 'undefined') return
  // Сначала пробуем шаринг с текстом; если клиент проигнорирует — приложение всё равно откроется.
  window.location.href = telegramAppShareUrl(text, url)
}

/** Веб-шаринг Telegram (только если явно нужен браузер). */
export function telegramWebShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ url, text })
  return `https://t.me/share/url?${params.toString()}`
}

/** @deprecated используйте telegramAppShareUrl */
export function telegramShareUrl(text: string, url: string): string {
  return telegramAppShareUrl(text, url)
}

/** Deeplink MAX: экран выбора чата с готовым текстом. */
export function maxShareUrl(text: string): string {
  return `https://max.ru/:share?text=${encodeURIComponent(text)}`
}

const SEP = '——————'

/**
 * Текст рейса в мессенджер: короткие шаги, крупные подписи.
 * Водитель должен понять маршрут с телефона за несколько секунд.
 */
export function renderDriverTripShareText(trip: DriverTrip, cabinetUrl: string): string {
  const cargo = tripCargoLines(trip)
  const pickup = trip.pickup.address.trim()
  const pickupHint = trip.pickup.hint.trim()
  const address = trip.point.address.trim()
  const hint = trip.point.hint.trim()
  const site = trip.siteName.trim()
  const plate = trip.vehiclePlate.trim()

  const lines: Array<string | null> = [
    `РЕЙС ДЛЯ: ${trip.driverName}`,
    plate ? `Машина: ${plate}` : null,
    '',
    SEP,
    'ШАГ 1. ЗАБРАТЬ ГРУЗ',
  ]

  if (pickup) {
    lines.push('Адрес погрузки:')
    lines.push(pickup)
    if (pickupHint) lines.push(`Подсказка: ${pickupHint}`)
  } else {
    lines.push('Груз уже в кузове.')
    lines.push('Сразу езжай на разгрузку (шаг 3).')
  }

  lines.push('')
  lines.push(SEP)
  lines.push('ШАГ 2. ЧТО ГРУЗИТЬ')
  if (cargo.length > 0) {
    for (const line of cargo) lines.push(`• ${line}`)
  } else {
    lines.push('Скажет диспетчер / уже в кузове.')
  }

  lines.push('')
  lines.push(SEP)
  lines.push('ШАГ 3. ВЕЗТИ СЮДА (разгрузить)')
  if (address) {
    lines.push('Адрес разгрузки:')
    lines.push(address)
  } else if (site) {
    lines.push('Адрес разгрузки:')
    lines.push(site)
  } else {
    lines.push('Точка на карте — открой ссылку ниже.')
  }
  if (hint) lines.push(`Как подъехать: ${hint}`)
  if (address && site) lines.push(`(объект работ: ${site})`)

  lines.push('')
  lines.push(SEP)
  lines.push('ШАГ 4. ОТКРЫТЬ ДОРОГУ')
  lines.push('Нажми ссылку — откроется Яндекс.Навигатор:')
  lines.push(yandexNaviUrl(trip.point))
  lines.push('Или карты:')
  lines.push(yandexMapsRouteUrl(trip.point))

  lines.push('')
  lines.push(SEP)
  lines.push('Все рейсы на сегодня:')
  lines.push(cabinetUrl)
  lines.push('Открой ссылку и напиши свою фамилию.')

  return lines.filter((x): x is string => x !== null).join('\n')
}

export function renderDriverShareText(
  siteName: string,
  point: SiteDeliveryPoint,
  trip: DriverTrip | null,
  cabinetUrl: string,
): string {
  if (trip) return renderDriverTripShareText(trip, cabinetUrl)
  return renderDriverDirections(siteName, point)
}
