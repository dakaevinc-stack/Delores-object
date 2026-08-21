import { tripCargoLines, type DriverTrip } from './driverTrip'
import {
  renderDriverDirections,
  yandexMapsRouteUrl,
  type SiteDeliveryPoint,
} from './siteDeliveryPoint'

export function driverCabinetUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/driver`
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Deep link в приложение Telegram (шаринг в чат). */
export function telegramAppShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ url, text })
  return `tg://msg_url?${params.toString()}`
}

/** Веб-запасной вариант, если приложение не открылось. */
export function telegramWebShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ url, text })
  return `https://t.me/share/url?${params.toString()}`
}

/** @deprecated используйте telegramAppShareUrl / telegramWebShareUrl */
export function telegramShareUrl(text: string, url: string): string {
  return telegramAppShareUrl(text, url)
}

/**
 * Сначала пробуем открыть приложение Telegram, если не вышло — веб-шаринг.
 */
export function openTelegramShare(text: string, url: string): void {
  if (typeof window === 'undefined') return
  const appUrl = telegramAppShareUrl(text, url)
  const webUrl = telegramWebShareUrl(text, url)
  const started = Date.now()
  let fellBack = false

  const fallback = () => {
    if (fellBack) return
    fellBack = true
    window.open(webUrl, '_blank', 'noopener,noreferrer')
  }

  const onBlur = () => {
    window.clearTimeout(timer)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pagehide', onBlur)
  }

  window.addEventListener('blur', onBlur)
  window.addEventListener('pagehide', onBlur)

  // На macOS/iOS/Android зарегистрированный tg:// открывает приложение.
  window.location.href = appUrl

  const timer = window.setTimeout(() => {
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pagehide', onBlur)
    // Если страница всё ещё на переднем плане — приложение не перехватило ссылку.
    if (Date.now() - started >= 600 && !document.hidden && document.hasFocus()) {
      fallback()
    }
  }, 900)
}

/** Deeplink MAX: экран выбора чата с готовым текстом. */
export function maxShareUrl(text: string): string {
  return `https://max.ru/:share?text=${encodeURIComponent(text)}`
}

export function renderDriverTripShareText(trip: DriverTrip, cabinetUrl: string): string {
  const cargo = tripCargoLines(trip)
  const pickup = trip.pickup.address.trim()
  const pickupHint = trip.pickup.hint.trim()
  const address = trip.point.address.trim()
  const hint = trip.point.hint.trim()
  const lines = [
    `Рейс для ${trip.driverName}`,
    `Кабинет водителя: ${cabinetUrl}`,
    pickup ? `Забрать: ${pickup}` : 'Груз уже в кузове — сразу на объект',
    pickupHint ? `Погрузка: ${pickupHint}` : null,
    cargo.length ? `Что везти:` : null,
    ...cargo.map((line) => `• ${line}`),
    `Везти: ${trip.siteName}`,
    address ? `Адрес: ${address}` : null,
    hint ? `Разгрузка: ${hint}` : null,
    `Яндекс.Карты:`,
    yandexMapsRouteUrl(trip.point),
  ]
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
