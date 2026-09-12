import { describe, expect, it } from 'vitest'
import { buildDriverLineStats, buildFleetLineStats, collectAllTripsForSite, collectTodayTripsForDriver, collectTripsForSite, collectTripsInRange, driverNameMatchesQuery, formatTripAssignedTime, isTripUnread, namesMatchDriver, normalizeDriverTrip, reassignDriverTrip, resolveTripStatus, tripCargoPreview, tripPickupLabel, tripUnloadLabel, withTripAccepted, withTripCancelled, withTripDone, withTripSeen, withTripStarted } from './driverTrip'

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
        startedAtIso: '2026-08-18T08:10:00.000Z',
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

  it('открытие карточки не переводит рейс в работу', () => {
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
    expect(isTripUnread(base)).toBe(true)

    const seen = withTripSeen(base, '2026-08-18T09:00:00.000Z')
    expect(resolveTripStatus(seen)).toBe('waiting')
    expect(isTripUnread(seen)).toBe(false)
    expect(withTripSeen(seen, '2026-08-18T10:00:00.000Z').seenAtIso).toBe(
      '2026-08-18T09:00:00.000Z',
    )

    const accepted = withTripAccepted(seen, '2026-08-18T09:05:00.000Z')
    expect(resolveTripStatus(accepted)).toBe('accepted')
    expect(withTripAccepted(accepted, '2026-08-18T09:06:00.000Z').acceptedAtIso).toBe(
      '2026-08-18T09:05:00.000Z',
    )

    const started = withTripStarted(accepted, '2026-08-18T09:10:00.000Z')
    expect(resolveTripStatus(started)).toBe('started')
    expect(withTripStarted(started, '2026-08-18T09:11:00.000Z').startedAtIso).toBe(
      '2026-08-18T09:10:00.000Z',
    )

    const done = withTripDone(started, '2026-08-18T11:00:00.000Z')
    expect(resolveTripStatus(done)).toBe('done')
    expect(withTripDone(done, '2026-08-18T12:00:00.000Z').completedAtIso).toBe(
      '2026-08-18T11:00:00.000Z',
    )

    const skip = withTripDone(base, '2026-08-18T11:30:00.000Z')
    expect(resolveTripStatus(skip)).toBe('done')
    expect(skip.seenAtIso).toBe('2026-08-18T11:30:00.000Z')
  })

  it('отмена и переназначение пишут причину, исполненный не трогают', () => {
    const base = normalizeDriverTrip({
      id: 'c1',
      dateKey: '2026-08-18',
      driverName: 'Иванов',
      vehiclePlate: 'А111АА799',
      siteId: 'brusilova',
      siteName: 'Брусилова',
      point,
      assignedBy: 'Минасян',
      assignedByRole: 'dispatcher',
      createdAtIso: '2026-08-18T08:00:00.000Z',
      startedAtIso: '2026-08-18T08:20:00.000Z',
    })
    expect(base).not.toBeNull()
    if (!base) return

    expect(withTripCancelled(base, { reason: 'да', actor: 'Диспетчер' }).ok).toBe(false)

    const cancelled = withTripCancelled(base, {
      reason: 'Заказчик отменил выгрузку',
      actor: 'Минасян',
      atIso: '2026-08-18T09:00:00.000Z',
    })
    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) return
    expect(resolveTripStatus(cancelled.trip)).toBe('cancelled')
    expect(cancelled.trip.cancelReason).toBe('Заказчик отменил выгрузку')
    expect(withTripDone(cancelled.trip, '2026-08-18T10:00:00.000Z').completedAtIso).toBeNull()
    expect(
      reassignDriverTrip(cancelled.trip, {
        driverName: 'Петров',
        vehiclePlate: '',
        reason: 'Другой водитель ближе',
        actor: 'Минасян',
      }).ok,
    ).toBe(false)

    const moved = reassignDriverTrip(base, {
      driverName: 'Петров',
      vehiclePlate: 'В222ВВ799',
      reason: 'Иванов сломался',
      actor: 'Минасян',
      atIso: '2026-08-18T09:30:00.000Z',
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.trip.driverName).toBe('Петров')
    expect(moved.trip.vehiclePlate).toBe('В222ВВ799')
    expect(resolveTripStatus(moved.trip)).toBe('waiting')
    expect(moved.trip.startedAtIso).toBeNull()
    expect(moved.trip.assignmentHistory).toHaveLength(1)
    expect(moved.trip.assignmentHistory[0]?.driverName).toBe('Иванов')
    expect(moved.trip.assignmentHistory[0]?.reason).toBe('Иванов сломался')

    const finished = withTripDone(base, '2026-08-18T11:00:00.000Z')
    expect(
      withTripCancelled(finished, { reason: 'Поздно отменяем', actor: 'Минасян' }).ok,
    ).toBe(false)
    expect(
      reassignDriverTrip(finished, {
        driverName: 'Петров',
        vehiclePlate: '',
        reason: 'Уже везёт другой',
        actor: 'Минасян',
      }).ok,
    ).toBe(false)
  })

  it('Excel объекта не забирает рейсы чужих площадок', () => {
    const trips = [
      normalizeDriverTrip({
        id: 'a',
        dateKey: '2026-08-10',
        driverName: 'А',
        vehiclePlate: '',
        siteId: 'brusilova',
        siteName: 'Брусилова',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-10T08:00:00.000Z',
      }),
      normalizeDriverTrip({
        id: 'b',
        dateKey: '2026-08-12',
        driverName: 'Б',
        vehiclePlate: '',
        siteId: 'other',
        siteName: 'Другой',
        point,
        assignedByRole: 'dispatcher',
        createdAtIso: '2026-08-12T08:00:00.000Z',
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
        createdAtIso: '2026-08-18T08:00:00.000Z',
      }),
    ].filter((x) => x !== null)

    const scoped = collectTripsInRange(collectAllTripsForSite(trips, 'brusilova'), '2026-08-01', '2026-08-31')
    expect(scoped.map((t) => t.id)).toEqual(['a', 'c'])
    expect(scoped.every((t) => t.siteId === 'brusilova')).toBe(true)
  })
})
