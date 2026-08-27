import { describe, expect, it } from 'vitest'
import { buildDriverLineStats, buildFleetLineStats, collectTodayTripsForDriver, collectTripsForSite, driverNameMatchesQuery, formatTripAssignedTime, isTripUnread, namesMatchDriver, normalizeDriverTrip, resolveTripStatus, tripCargoPreview, tripPickupLabel, tripUnloadLabel, withTripDone, withTripSeen } from './driverTrip'

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

  it('поиск по фамилии находит водителя из парка', () => {
    expect(driverNameMatchesQuery('Васильев Р. Т.', 'Васильев')).toBe(true)
    expect(driverNameMatchesQuery('Васильев Р. Т.', 'василь')).toBe(true)
    expect(driverNameMatchesQuery('Васильев Р. Т.', 'Васильева')).toBe(true)
    expect(driverNameMatchesQuery('Васильев Р. Т.', 'Петров')).toBe(false)
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

  it('рейсы объекта на дату — новые сверху', () => {
    const trips = [
      normalizeDriverTrip({
        id: 'a',
        dateKey: '2026-08-18',
        driverName: 'А',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T08:00:00.000Z',
      }),
      normalizeDriverTrip({
        id: 'b',
        dateKey: '2026-08-18',
        driverName: 'Б',
        vehiclePlate: '',
        siteId: 'other',
        siteName: 'Другой',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T09:00:00.000Z',
      }),
      normalizeDriverTrip({
        id: 'c',
        dateKey: '2026-08-18',
        driverName: 'В',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T10:00:00.000Z',
      }),
    ].filter((x) => x !== null)

    expect(collectTripsForSite(trips, 'brusilova', '2026-08-18').map((t) => t.id)).toEqual([
      'c',
      'a',
    ])
  })

  it('сводка техники и водителей по рейсам сегодня', () => {
    const trips = [
      normalizeDriverTrip({
        id: '1',
        dateKey: '2026-08-18',
        driverName: 'Исматов Жамшид Урал Угли',
        vehiclePlate: 'А111АА799',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T08:00:00.000Z',
        seenAtIso: '2026-08-18T08:05:00.000Z',
      }),
      normalizeDriverTrip({
        id: '2',
        dateKey: '2026-08-18',
        driverName: 'Арамян Геворк Карапетович',
        vehiclePlate: 'В222ВВ799',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T09:00:00.000Z',
      }),
    ].filter((x) => x !== null)

    const fleet = buildFleetLineStats(
      [{ plate: 'А111АА799' }, { plate: 'В222ВВ799' }, { plate: 'С333СС799' }],
      trips,
    )
    expect(fleet.total).toBe(3)
    expect(fleet.onLine).toBe(2)
    expect(fleet.hint).toBe('на рейсах сегодня')
    expect(fleet.alert).toBeNull()
    expect(fleet.rows.find((r) => r.label === 'В работе')?.count).toBe(1)
    expect(fleet.rows.find((r) => r.label === 'Ожидают')?.count).toBe(1)
    expect(fleet.rows.find((r) => r.label === 'Свободны')?.count).toBe(1)

    const bare = buildFleetLineStats([{ plate: 'А111АА799' }], [
      normalizeDriverTrip({
        id: 'x',
        dateKey: '2026-08-18',
        driverName: 'Исматов',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-18T10:00:00.000Z',
      })!,
    ])
    expect(bare.onLine).toBe(0)
    expect(bare.rows.find((r) => r.label === 'Без ТС')).toBeUndefined()
    expect(bare.alert).toMatch(/без ТС/)
    expect(bare.rows.map((r) => r.label)).toEqual(['В работе', 'Ожидают', 'Свободны'])

    const drivers = buildDriverLineStats(
      ['Исматов Жамшид Урал Угли', 'Арамян Геворк Карапетович', 'Санамян Амбарцум Овсепович'],
      trips,
    )
    expect(drivers.total).toBe(3)
    expect(drivers.onLine).toBe(2)
    expect(drivers.rows.find((r) => r.label === 'В работе')?.count).toBe(1)
    expect(drivers.rows.find((r) => r.label === 'Ожидают')?.count).toBe(1)
    expect(drivers.rows.find((r) => r.label === 'Свободны')?.count).toBe(1)
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

  it('статусы: ожидает → в работе → исполнен, назад нельзя', () => {
    const base = normalizeDriverTrip({
      id: 's1',
      dateKey: '2026-08-18',
      driverName: 'Иванов',
      vehiclePlate: '',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      point,
      assignedByRole: 'dispatcher',
      createdAtIso: '2026-08-18T08:00:00.000Z',
    })
    expect(base).not.toBeNull()
    if (!base) return

    expect(resolveTripStatus(base)).toBe('waiting')
    const seen = withTripSeen(base, '2026-08-18T09:00:00.000Z')
    expect(resolveTripStatus(seen)).toBe('accepted')
    expect(withTripSeen(seen, '2026-08-18T10:00:00.000Z').seenAtIso).toBe(
      '2026-08-18T09:00:00.000Z',
    )

    const done = withTripDone(seen, '2026-08-18T11:00:00.000Z')
    expect(resolveTripStatus(done)).toBe('done')
    expect(withTripDone(done, '2026-08-18T12:00:00.000Z').completedAtIso).toBe(
      '2026-08-18T11:00:00.000Z',
    )

    const skip = withTripDone(base, '2026-08-18T11:30:00.000Z')
    expect(resolveTripStatus(skip)).toBe('done')
    expect(skip.seenAtIso).toBe('2026-08-18T11:30:00.000Z')
  })
})
