import { describe, expect, it } from 'vitest'
import { collectTodayTripsForDriver, formatTripAssignedTime, isTripUnread, namesMatchDriver, normalizeDriverTrip, tripCargoPreview, tripPickupLabel, tripUnloadLabel } from './driverTrip'

const point = {
  lat: 55.5,
  lng: 37.56,
  hint: 'Западные ворота',
  address: 'ул. Вокзальная, 12',
  updatedAtIso: '2026-08-17T16:00:00.000Z',
}

describe('driverTrip', () => {
  it('водитель видит рейс, даже если написали фамилию чуть иначе', () => {
    expect(namesMatchDriver('Иванов Сергей', 'иванов')).toBe(true)
    expect(namesMatchDriver('Петров', 'Сидоров')).toBe(false)
  })

  it('подписи откуда/куда и время для карточки', () => {
    const trip = normalizeDriverTrip({
      id: '1',
      dateKey: '2026-08-18',
      driverName: 'Иванов',
      vehiclePlate: '',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      point,
      pickup: { address: 'База Пески, ворота 2', hint: '' },
      assignedBy: '',
      assignedByRole: 'dispatcher',
      createdAtIso: '2026-08-18T10:30:00.000Z',
    })
    expect(trip).not.toBeNull()
    if (!trip) return
    expect(tripPickupLabel(trip)).toBe('База Пески, ворота 2')
    expect(tripUnloadLabel(trip)).toBe('ул. Вокзальная, 12')
    expect(formatTripAssignedTime(trip.createdAtIso)).toMatch(/\d{2}:\d{2}/)
    expect(tripPickupLabel({ pickup: { address: '', hint: '' } })).toBe('Уже в кузове')
    expect(tripUnloadLabel({ point: { ...point, address: '' }, siteName: 'Объект А' })).toBe(
      'Объект А',
    )
  })

  it('сегодняшние рейсы — только свои и на сегодня', () => {
    const trips = [
      normalizeDriverTrip({
        id: '1',
        dateKey: '2026-08-18',
        driverName: 'Иванов С.',
        vehiclePlate: 'К 877 ТУ 799',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedBy: 'Минасян',
        assignedByRole: 'brigadier',
        createdAtIso: '2026-08-18T07:00:00.000Z',
      }),
      normalizeDriverTrip({
        id: '2',
        dateKey: '2026-08-18',
        driverName: 'Петров',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedBy: 'Диспетчер',
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T07:10:00.000Z',
      }),
      normalizeDriverTrip({
        id: '3',
        dateKey: '2026-08-17',
        driverName: 'Иванов С.',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedBy: 'Минасян',
        assignedByRole: 'brigadier',
        createdAtIso: '2026-08-17T07:00:00.000Z',
      }),
    ].filter((x) => x !== null)

    const mine = collectTodayTripsForDriver(trips, 'Иванов', '2026-08-18')
    expect(mine.map((t) => t.id)).toEqual(['1'])
    expect(mine[0]?.point.address).toBe('ул. Вокзальная, 12')
  })

  it('старый рейс без груза всё равно читается, новый — с забрать/везти', () => {
    const old = normalizeDriverTrip({
      id: '1',
      dateKey: '2026-08-18',
      driverName: 'Иванов',
      vehiclePlate: '',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      point,
      assignedBy: '',
      assignedByRole: 'dispatcher',
      createdAtIso: '2026-08-18T07:00:00.000Z',
    })
    expect(old?.cargo).toEqual([])
    expect(old?.pickup.address).toBe('')
    expect(old?.seenAtIso).toBeNull()

    const next = normalizeDriverTrip({
      id: '2',
      dateKey: '2026-08-18',
      driverName: 'Иванов',
      vehiclePlate: '',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      point,
      pickup: { address: 'Карьер Щербинка', hint: '' },
      cargo: [{ title: 'Щебень', quantity: 12, unitLabel: 'м³' }],
      cargoNote: 'Накрыть тентом',
      assignedBy: '',
      assignedByRole: 'dispatcher',
      createdAtIso: '2026-08-18T08:00:00.000Z',
    })
    expect(next).not.toBeNull()
    expect(tripCargoPreview(next!)).toBe('Щебень — 12 м³, Накрыть тентом')
    expect(isTripUnread(next!)).toBe(true)
  })
})
