import { describe, expect, it } from 'vitest'
import {
  formatLatLng,
  isValidLatLng,
  normalizeDeliveryPoint,
  renderDriverDirections,
  yandexMapsPointUrl,
  yandexMapsRouteUrl,
  yandexMapWidgetUrl,
  yandexNaviUrl,
} from './siteDeliveryPoint'

const point = {
  lat: 55.501234,
  lng: 37.559876,
  hint: 'Ворота с Вокзальной, разгрузка слева от бытовки',
  address: 'улица Вокзальная, Щербинка',
  updatedAtIso: '2026-08-17T16:00:00.000Z',
}

describe('siteDeliveryPoint', () => {
  it('отсекает мусорные координаты', () => {
    expect(isValidLatLng(55.75, 37.62)).toBe(true)
    expect(isValidLatLng(91, 0)).toBe(false)
    expect(isValidLatLng(0, 181)).toBe(false)
    expect(normalizeDeliveryPoint({ lat: 55.75, lng: 'nope' })).toBeNull()
  })

  it('нормализует точку из JSON', () => {
    const out = normalizeDeliveryPoint({
      lat: '55.5',
      lng: '37.56',
      hint: '  западные ворота  ',
      updatedAtIso: '2026-08-17T16:00:00Z',
    })
    expect(out?.lat).toBe(55.5)
    expect(out?.lng).toBe(37.56)
    expect(out?.hint).toBe('западные ворота')
    expect(out?.address).toBe('')
  })

  it('выбрасывает служебный адрес probe', () => {
    const out = normalizeDeliveryPoint({
      lat: 55.5,
      lng: 37.56,
      address: 'probe',
      updatedAtIso: '2026-08-17T16:00:00Z',
    })
    expect(out?.address).toBe('')
  })

  it('собирает ссылки Яндекса: pt — lng,lat; маршрут — lat,lng', () => {
    expect(yandexMapsPointUrl(point)).toContain('pt=37.559876%2C55.501234')
    expect(yandexMapsRouteUrl(point)).toContain('rtext=%7E55.501234%2C37.559876')
    expect(yandexNaviUrl(point)).toBe(
      'yandexnavi://build_route_on_map?lat_to=55.501234&lon_to=37.559876',
    )
    expect(yandexMapWidgetUrl(point)).toContain('pt=37.559876%2C55.501234')
  })

  it('текст водителю — объект, как подъехать и маршрут', () => {
    const text = renderDriverDirections('Щербинка, Вокзальная', point)
    expect(text).toContain('Адрес: улица Вокзальная, Щербинка')
    expect(text).toContain('Разгрузка: Ворота с Вокзальной, разгрузка слева от бытовки')
    expect(text).toContain(formatLatLng(point.lat, point.lng))
    expect(text).toContain('https://yandex.ru/maps/?')
  })
})
