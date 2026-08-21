import { describe, expect, it } from 'vitest'
import {
  driverCabinetUrl,
  maxShareUrl,
  renderDriverShareText,
  renderDriverTripShareText,
  telegramAppShareUrl,
  telegramWebShareUrl,
  whatsappShareUrl,
} from './driverShare'
import type { DriverTrip } from './driverTrip'

const point = {
  lat: 55.501234,
  lng: 37.559876,
  hint: 'Ворота слева',
  address: 'ул. Вокзальная, 12',
  updatedAtIso: '2026-08-17T16:00:00.000Z',
}

const trip: DriverTrip = {
  id: '1',
  dateKey: '2026-08-18',
  driverName: 'Иванов',
  vehiclePlate: 'К 877 ТУ 799',
  siteId: 'brusilova',
  siteName: 'Брусилова',
  point,
  pickup: { address: 'Карьер Щербинка', hint: '' },
  cargo: [{ title: 'Щебень', quantity: 12, unitLabel: 'м³' }],
  cargoNote: '',
  assignedBy: '',
  assignedByRole: 'dispatcher',
  createdAtIso: '2026-08-18T08:00:00.000Z',
  seenAtIso: null,
}

describe('driverShare', () => {
  it('ссылка кабинета — origin + /driver; localhost → прод', () => {
    expect(driverCabinetUrl('http://94.242.58.24/')).toBe('http://94.242.58.24/driver')
    expect(driverCabinetUrl('http://localhost:5173')).toBe('http://94.242.58.24/driver')
    expect(driverCabinetUrl('http://127.0.0.1:5173/')).toBe('http://94.242.58.24/driver')
  })

  it('WhatsApp, Telegram и Max открывают шаринг с текстом', () => {
    const text = 'Куда везти\nБрусилова'
    expect(whatsappShareUrl(text)).toContain('https://wa.me/?text=')
    expect(whatsappShareUrl(text)).toContain(encodeURIComponent(text))
    expect(telegramAppShareUrl(text, 'https://yandex.ru/maps/?rtext=1')).toContain('tg://msg?text=')
    expect(telegramAppShareUrl(text, 'https://yandex.ru/maps/?rtext=1')).toContain(
      encodeURIComponent(text),
    )
    expect(telegramWebShareUrl(text, 'https://yandex.ru/maps/?rtext=1')).toContain(
      'https://t.me/share/url?',
    )
    expect(maxShareUrl(text)).toContain('https://max.ru/:share?text=')
    expect(maxShareUrl(text)).toContain(encodeURIComponent(text))
  })

  it('текст рейса — кабинет, забрать, груз и Яндекс.Карты', () => {
    const text = renderDriverTripShareText(trip, 'http://example.test/driver')
    expect(text).toContain('Рейс для Иванов')
    expect(text).toContain('http://example.test/driver')
    expect(text).toContain('Забрать: Карьер Щербинка')
    expect(text).toContain('Щебень — 12 м³')
    expect(text).toContain('Везти: Брусилова')
    expect(text).toContain('yandex.ru/maps')
  })

  it('без рейса остаётся короткая точка разгрузки', () => {
    const text = renderDriverShareText('Брусилова', point, null, 'http://example.test/driver')
    expect(text).toContain('Куда везти материал')
    expect(text).not.toContain('Кабинет водителя')
    expect(renderDriverShareText('Брусилова', point, trip, 'http://example.test/driver')).toContain(
      'Кабинет водителя',
    )
  })
})
