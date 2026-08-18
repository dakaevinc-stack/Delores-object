import { describe, expect, it } from 'vitest'
import {
  formatDriverTripNotifyText,
  namesMatchDriver,
  parseDriverTelegramCommand,
} from './driverTripNotify.mjs'

describe('driverTripNotify', () => {
  it('совпадение фамилии такое же, как в кабинете водителя', () => {
    expect(namesMatchDriver('Иванов Сергей', 'иванов')).toBe(true)
    expect(namesMatchDriver('Петров', 'Сидоров')).toBe(false)
  })

  it('текст оповещения содержит объект, адрес и ссылку на карты', () => {
    const text = formatDriverTripNotifyText({
      siteName: 'Брусилова',
      vehiclePlate: 'К 877 ТУ 799',
      pickup: { address: 'Карьер Щербинка' },
      cargo: [{ title: 'Щебень', quantity: 12, unitLabel: 'м³' }],
      point: {
        lat: 55.5,
        lng: 37.56,
        address: 'ул. Вокзальная, 12',
        hint: 'Западные ворота',
      },
    })
    expect(text).toContain('Новый маршрут')
    expect(text).toContain('Забрать: Карьер Щербинка')
    expect(text).toContain('Щебень')
    expect(text).toContain('Брусилова')
    expect(text).toContain('ул. Вокзальная, 12')
    expect(text).toContain('yandex.ru/maps')
  })

  it('разбирает команды личного чата с ботом', () => {
    expect(parseDriverTelegramCommand('/start')).toEqual({ type: 'start' })
    expect(parseDriverTelegramCommand('/start Иванов')).toEqual({
      type: 'bind',
      name: 'Иванов',
    })
    expect(parseDriverTelegramCommand('/stop')).toEqual({ type: 'stop' })
    expect(parseDriverTelegramCommand('Иванов Сергей')).toEqual({
      type: 'bind',
      name: 'Иванов Сергей',
    })
    expect(parseDriverTelegramCommand('/help')).toEqual({ type: 'help' })
  })
})
