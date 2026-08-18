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

export function telegramShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ url, text })
  return `https://t.me/share/url?${params.toString()}`
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
