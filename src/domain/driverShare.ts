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

/** Deep link в приложение Telegram с готовым текстом. */
export function telegramAppShareUrl(text: string, url: string): string {
  const body = [text.trim(), url.trim()].filter(Boolean).join('\n\n')
  // msg?text= лучше поддерживается Telegram Desktop / iOS / Android, чем msg_url.
  return `tg://msg?text=${encodeURIComponent(body)}`
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

function launchCustomProtocol(href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.target = '_self'
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Открыть шаринг в приложении Telegram.
 * 1) системный Share (если есть) — пользователь выбирает Telegram
 * 2) tg:// deep link в приложение
 * 3) запасной t.me в браузере
 */
export async function openTelegramShare(text: string, url: string): Promise<void> {
  if (typeof window === 'undefined') return

  const payload = text.trim()
  const maps = url.trim()
  const appUrl = telegramAppShareUrl(payload, maps)
  const webUrl = telegramWebShareUrl(payload, maps || 'https://t.me')

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Рейс водителю',
        text: payload,
        url: maps || undefined,
      })
      return
    } catch (err) {
      // Пользователь отменил — не открываем браузер.
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }

  let appTookFocus = false
  const onHide = () => {
    appTookFocus = true
  }
  window.addEventListener('blur', onHide, { once: true })
  window.addEventListener('pagehide', onHide, { once: true })
  document.addEventListener('visibilitychange', onHide, { once: true })

  launchCustomProtocol(appUrl)

  window.setTimeout(() => {
    window.removeEventListener('blur', onHide)
    window.removeEventListener('pagehide', onHide)
    document.removeEventListener('visibilitychange', onHide)
    if (appTookFocus || document.hidden) return
    window.open(webUrl, '_blank', 'noopener,noreferrer')
  }, 1600)
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
