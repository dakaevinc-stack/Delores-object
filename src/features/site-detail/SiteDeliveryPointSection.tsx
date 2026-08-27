import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  displayDeliveryAddress,
  formatLatLng,
  yandexMapsRouteUrl,
  yandexNaviUrl,
  type SiteDeliveryPoint,
} from '../../domain/siteDeliveryPoint'
import type { AddressHit } from '../../domain/addressSearch'
import { driverCabinetUrl, renderDriverShareText } from '../../domain/driverShare'
import {
  driverNameMatchesQuery,
  buildDriverLineStats,
  buildFleetLineStats,
  collectActiveTrips,
  collectDoneTrips,
  collectTripsForDate,
  collectTripsForSite,
  DRIVER_TRIP_STATUS_LABELS,
  formatTripAssignedDate,
  formatTripAssignedTime,
  resolveTripStatus,
  tripCargoPreview,
  tripPickupLabel,
  tripUnloadLabel,
  type DriverTrip,
  type DriverTripAssignerRole,
} from '../../domain/driverTrip'
import {
  loadDriverTrips,
  markDriverTripDone,
} from '../../lib/driverTripsRepository'
import { downloadDriverTripsExcel } from '../../lib/downloadDriverTripsExcel'
import { markDriverTripDoneRemote } from '../../lib/siteFormsApi'
import { toDateKey, addDays } from '../../domain/workDayPlan'
import { reverseGeocodeRemote, searchAddressRemote } from '../../lib/siteFormsApi'
import { DriverMessengerShare } from '../driver/DriverMessengerShare'
import { useFleetRegistry } from '../fleet/useFleetRegistry'
import { listStaffDriverNames } from '../../domain/staffDirectory'
import { DeliveryPointMap } from './DeliveryPointMap'
import styles from './SiteDeliveryPointSection.module.css'

type MapTarget = 'unload' | 'pickup'

type Props = {
  siteName: string
  siteId: string
  address?: string
  point: SiteDeliveryPoint | null
  serverBacked?: boolean
  onSave?: (point: SiteDeliveryPoint | null) => void | Promise<void>
  onAssignTrip?: (
    trip: DriverTrip,
  ) => void | Promise<void | { telegramNotified?: boolean }>
  /** Кто назначает рейс. После входа подставим должность; чипсы на форме не нужны. */
  assignerRole?: DriverTripAssignerRole
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Фамилия и инициалы — короче и читаемее в списке. */
function shortPersonName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return full.trim()
  const [sur, ...rest] = parts
  const initials = rest
    .map((p) => (p[0] ? `${p[0]!.toLocaleUpperCase('ru-RU')}.` : ''))
    .filter(Boolean)
    .join(' ')
  return `${sur} ${initials}`.trim()
}

export function SiteDeliveryPointSection({
  siteName,
  siteId,
  address,
  point,
  serverBacked = false,
  onSave,
  onAssignTrip,
  assignerRole = 'dispatcher',
}: Props) {
  const fieldId = useId()
  const canEditPoint = Boolean(onSave)
  const canAssignTrip = Boolean(onAssignTrip)
  const { vehicles } = useFleetRegistry()
  const [mapTarget, setMapTarget] = useState<MapTarget>(() => (onAssignTrip ? 'pickup' : 'unload'))
  const [query, setQuery] = useState(() =>
    onAssignTrip ? '' : displayDeliveryAddress(point?.address ?? ''),
  )
  const [hits, setHits] = useState<AddressHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hint, setHint] = useState(point?.hint ?? '')
  const [geoError, setGeoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [driverName, setDriverName] = useState('')
  const [driverMenuOpen, setDriverMenuOpen] = useState(false)
  const [exportFrom, setExportFrom] = useState(() => toDateKey(addDays(new Date(), -30)))
  const [exportTo, setExportTo] = useState(() => toDateKey(new Date()))
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [lastTrip, setLastTrip] = useState<DriverTrip | null>(null)
  const [assignedOk, setAssignedOk] = useState<'off' | 'saved' | 'telegram'>('off')
  const [siteTrips, setSiteTrips] = useState<DriverTrip[]>(() =>
    collectTripsForSite(loadDriverTrips(), siteId),
  )
  const [todayTrips, setTodayTrips] = useState<DriverTrip[]>(() =>
    collectTripsForDate(loadDriverTrips()),
  )
  const activeTrips = useMemo(() => collectActiveTrips(siteTrips), [siteTrips])
  const doneTrips = useMemo(() => collectDoneTrips(siteTrips), [siteTrips])
  const tripStats = useMemo(() => {
    let waiting = 0
    let accepted = 0
    for (const t of activeTrips) {
      if (resolveTripStatus(t) === 'waiting') waiting += 1
      else accepted += 1
    }
    return { waiting, accepted, done: doneTrips.length }
  }, [activeTrips, doneTrips])
  const fleetStats = useMemo(
    () => buildFleetLineStats(vehicles, todayTrips),
    [vehicles, todayTrips],
  )
  const driverStats = useMemo(
    () => buildDriverLineStats(listStaffDriverNames(), todayTrips),
    [todayTrips],
  )
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupLat, setPickupLat] = useState<number | null>(null)
  const [pickupLng, setPickupLng] = useState<number | null>(null)
  const [alreadyLoaded, setAlreadyLoaded] = useState(false)
  const [tripComment, setTripComment] = useState('')
  const skipDebounce = useRef(false)
  const queryFocused = useRef(false)
  const strippedJunkAddress = useRef(false)

  const operators = useMemo(() => listStaffDriverNames(), [])

  const driverHits = useMemo(() => {
    const q = driverName.trim()
    if (!q) return operators
    return operators.filter((n) => driverNameMatchesQuery(n, q))
  }, [operators, driverName])

  useEffect(() => {
    setHint(point?.hint ?? '')
  }, [point?.hint])

  useEffect(() => {
    const all = loadDriverTrips()
    setSiteTrips(collectTripsForSite(all, siteId))
    setTodayTrips(collectTripsForDate(all))
  }, [siteId])

  useEffect(() => {
    if (!canAssignTrip) return
    const tick = () => {
      const all = loadDriverTrips()
      setSiteTrips(collectTripsForSite(all, siteId))
      setTodayTrips(collectTripsForDate(all))
    }
    const t = window.setInterval(tick, 8_000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [canAssignTrip, siteId])

  const refreshSiteTrips = () => {
    const all = loadDriverTrips()
    setSiteTrips(collectTripsForSite(all, siteId))
    setTodayTrips(collectTripsForDate(all))
  }

  const handleCompleteTrip = async (id: string) => {
    markDriverTripDone(id)
    refreshSiteTrips()
    await markDriverTripDoneRemote(id)
    refreshSiteTrips()
  }

  const handleExportExcel = () => {
    const result = downloadDriverTripsExcel(loadDriverTrips(), exportFrom, exportTo)
    if (!result.ok) {
      setExportNote(result.reason)
      return
    }
    setExportNote(`Скачано: ${result.count} рейс.`)
    window.setTimeout(() => setExportNote(null), 3200)
  }

  useEffect(() => {
    if (queryFocused.current) return
    if (mapTarget !== 'unload') return
    setQuery(displayDeliveryAddress(point?.address ?? ''))
  }, [point?.lat, point?.lng, point?.address, mapTarget])

  useEffect(() => {
    if (strippedJunkAddress.current || !onSave || !point) return
    const shown = displayDeliveryAddress(point.address)
    if (shown === (point.address ?? '').trim()) return
    strippedJunkAddress.current = true
    void onSave({ ...point, address: shown })
  }, [onSave, point])

  useEffect(() => {
    if (!canEditPoint && mapTarget === 'unload') {
      setHits([])
      return
    }
    if (mapTarget === 'pickup' && alreadyLoaded) {
      setHits([])
      return
    }
    const q = query.trim()
    if (skipDebounce.current) {
      skipDebounce.current = false
      return
    }
    const currentLabel =
      mapTarget === 'unload'
        ? displayDeliveryAddress(point?.address ?? '')
        : pickupAddress.trim()
    if (q.length < 3 || q === currentLabel) {
      setHits([])
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        setGeoError(null)
        try {
          const found = await searchAddressRemote(q)
          setHits(found)
          if (found.length === 0)
            setGeoError('Адрес не нашёлся. Проверьте написание или поставьте точку на карте.')
        } catch {
          setGeoError('Поиск адреса сейчас недоступен. Поставьте точку на карте.')
        } finally {
          setSearching(false)
        }
      })()
    }, 400)
    return () => window.clearTimeout(t)
  }, [canEditPoint, query, point?.address, mapTarget, pickupAddress, alreadyLoaded])

  const commit = async (next: SiteDeliveryPoint | null) => {
    if (!onSave) return
    setBusy(true)
    try {
      await onSave(next)
    } finally {
      setBusy(false)
    }
  }

  const placeUnload = (lat: number, lng: number, foundAddress: string, nextHint = hint) => {
    skipDebounce.current = true
    queryFocused.current = false
    const label = displayDeliveryAddress(foundAddress)
    if (label) setQuery(label)
    else setQuery(formatLatLng(lat, lng))
    setHits([])
    void commit({
      lat,
      lng,
      hint: nextHint.trim(),
      address: label,
      updatedAtIso: new Date().toISOString(),
    })
  }

  const placePickup = (foundAddress: string, lat?: number, lng?: number) => {
    skipDebounce.current = true
    queryFocused.current = false
    const label =
      displayDeliveryAddress(foundAddress) ||
      (lat != null && lng != null ? formatLatLng(lat, lng) : '')
    setPickupAddress(label)
    if (lat != null && lng != null) {
      setPickupLat(lat)
      setPickupLng(lng)
    }
    if (mapTarget === 'pickup') setQuery(label)
    setHits([])
    setAlreadyLoaded(false)
  }

  const pickHit = (hit: AddressHit) => {
    setGeoError(null)
    if (mapTarget === 'pickup') placePickup(hit.label, hit.lat, hit.lng)
    else placeUnload(hit.lat, hit.lng, hit.label)
  }

  const handleSearchNow = async () => {
    const q = query.trim() || (mapTarget === 'unload' ? siteName : '')
    if (!q) {
      setGeoError('Введите адрес или ткните карту.')
      return
    }
    setSearching(true)
    setGeoError(null)
    try {
      const found = await searchAddressRemote(q)
      setHits(found)
      if (found.length === 1) {
        pickHit(found[0]!)
        return
      }
      if (found.length === 0) setGeoError('Адрес не нашёлся. Поставьте точку на карте сами.')
    } catch {
      setGeoError('Поиск адреса сейчас недоступен. Поставьте точку на карте.')
    } finally {
      setSearching(false)
    }
  }

  const handleMapPick = async (lat: number, lng: number) => {
    if (mapTarget === 'pickup') {
      // Сразу в поле «Откуда грузить», затем уточняем адрес по геокоду.
      placePickup(formatLatLng(lat, lng), lat, lng)
      const found = (await reverseGeocodeRemote(lat, lng)) ?? ''
      if (found.trim()) placePickup(found, lat, lng)
      return
    }
    placeUnload(lat, lng, formatLatLng(lat, lng))
    const found = (await reverseGeocodeRemote(lat, lng)) ?? ''
    if (found.trim()) placeUnload(lat, lng, found)
  }

  const handleHere = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Этот телефон не отдаёт геолокацию. Введите адрес или ткните карту.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void handleMapPick(pos.coords.latitude, pos.coords.longitude),
      () => setGeoError('Не удалось определить место. Введите адрес или ткните карту.'),
      { enableHighAccuracy: true, timeout: 12_000 },
    )
  }

  const saveHint = () => {
    if (!point) return
    if (hint.trim() === point.hint) return
    void commit({ ...point, hint: hint.trim(), updatedAtIso: new Date().toISOString() })
  }

  const clearPickup = () => {
    setPickupAddress('')
    setPickupLat(null)
    setPickupLng(null)
    if (mapTarget === 'pickup') {
      skipDebounce.current = true
      setQuery('')
    }
    setHits([])
  }

  const switchMapTarget = (next: MapTarget) => {
    setMapTarget(next)
    setHits([])
    setGeoError(null)
    skipDebounce.current = true
    if (next === 'unload') {
      setQuery(displayDeliveryAddress(point?.address ?? ''))
    } else {
      setQuery(pickupAddress)
    }
  }

  const handleAssign = async () => {
    if (!point || !onAssignTrip || !driverName.trim()) return
    const note = tripComment.trim()
    const trip: DriverTrip = {
      id: newId(),
      dateKey: toDateKey(new Date()),
      driverName: driverName.trim(),
      vehiclePlate: '',
      siteId,
      siteName,
      point,
      pickup: alreadyLoaded
        ? { address: '', hint: '' }
        : { address: pickupAddress.trim(), hint: '' },
      cargo: [],
      cargoNote: note,
      assignedBy: '',
      assignedByRole: assignerRole,
      createdAtIso: new Date().toISOString(),
      seenAtIso: null,
      completedAtIso: null,
    }
    const result = await onAssignTrip(trip)
    setLastTrip(trip)
    refreshSiteTrips()
    setAssignedOk(result && result.telegramNotified ? 'telegram' : 'saved')
    window.setTimeout(() => setAssignedOk('off'), 3200)
    setTripComment('')
    setDriverName('')
  }

  const sharePoint = point ? { ...point, hint: hint.trim() || point.hint } : null
  const cabinetUrl =
    typeof window !== 'undefined' ? driverCabinetUrl(window.location.origin) : '/driver'
  const shareText = sharePoint
    ? renderDriverShareText(siteName, sharePoint, lastTrip, cabinetUrl)
    : ''
  const captionAddr = displayDeliveryAddress(point?.address ?? '') || null
  const searchEnabled = canEditPoint || (canAssignTrip && mapTarget === 'pickup' && !alreadyLoaded)
  const searchPlaceholder =
    mapTarget === 'pickup'
      ? 'Склад, карьер, база…'
      : address?.trim() || 'Улица, дом, посёлок'

  return (
    <section
      className={styles.section}
      aria-label={canAssignTrip ? 'Управление рейсами' : 'Куда разгружать'}
    >
      {canAssignTrip ? (
        <>
          <div className={styles.lineStats} aria-label="Ситуация по парку и водителям">
            <article className={styles.lineCard} data-accent="navy">
              <span className={styles.lineStripe} aria-hidden />
              <span className={styles.lineSpecular} aria-hidden />
              <div className={styles.lineFace}>
                <div className={styles.lineHead}>
                  <p className={styles.lineTitle}>Техника сейчас</p>
                  {fleetStats.alert ? (
                    <span className={styles.lineAlertChip}>{fleetStats.alert}</span>
                  ) : (
                    <span className={styles.lineAlertSlot} aria-hidden />
                  )}
                </div>
                <div className={styles.lineHeroBlock}>
                  <p className={styles.lineHero}>
                    <span className={styles.lineHeroOn}>{fleetStats.onLine}</span>
                    <span className={styles.lineHeroSep}>/</span>
                    <span className={styles.lineHeroTotal}>{fleetStats.total}</span>
                  </p>
                  <p className={styles.lineHeroHint}>{fleetStats.hint}</p>
                </div>
                <ul className={styles.linePills}>
                  {fleetStats.rows.map((row) => (
                    <li key={row.label} className={styles.linePill} data-tone={row.tone}>
                      <span className={styles.lineDot} aria-hidden />
                      <span className={styles.lineLabel}>{row.label}</span>
                      <span className={styles.lineCount}>{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            <article className={styles.lineCard} data-accent="red">
              <span className={styles.lineStripe} aria-hidden />
              <span className={styles.lineSpecular} aria-hidden />
              <div className={styles.lineFace}>
                <div className={styles.lineHead}>
                  <p className={styles.lineTitle}>Водители</p>
                  <span className={styles.lineAlertSlot} aria-hidden />
                </div>
                <div className={styles.lineHeroBlock}>
                  <p className={styles.lineHero}>
                    <span className={styles.lineHeroOn}>{driverStats.onLine}</span>
                    <span className={styles.lineHeroSep}>/</span>
                    <span className={styles.lineHeroTotal}>{driverStats.total}</span>
                  </p>
                  <p className={styles.lineHeroHint}>{driverStats.hint}</p>
                </div>
                <ul className={styles.linePills}>
                  {driverStats.rows.map((row) => (
                    <li key={row.label} className={styles.linePill} data-tone={row.tone}>
                      <span className={styles.lineDot} aria-hidden />
                      <span className={styles.lineLabel}>{row.label}</span>
                      <span className={styles.lineCount}>{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>

          <div className={styles.tripsPanel} aria-label="Ближайшие задачи">
          <div className={styles.tripsHead}>
            <p className={styles.tripsTitle}>Ближайшие задачи</p>
            <div className={styles.tripsStats} aria-label="Сводка статусов">
              <span className={styles.tripsStat} data-tone="waiting">
                <span className={styles.tripsStatDot} aria-hidden />
                Ожидают <b>{tripStats.waiting}</b>
              </span>
              <span className={styles.tripsStat} data-tone="accepted">
                <span className={styles.tripsStatDot} aria-hidden />
                В работе <b>{tripStats.accepted}</b>
              </span>
              <span className={styles.tripsStat} data-tone="done">
                <span className={styles.tripsStatDot} aria-hidden />
                Исполнен <b>{tripStats.done}</b>
              </span>
            </div>
          </div>

          <div className={styles.exportBar}>
            <span className={styles.exportLabel}>Excel за период</span>
            <label className={styles.exportField}>
              <span className={styles.exportFieldLabel}>с</span>
              <input
                type="date"
                className={styles.exportInput}
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
              />
            </label>
            <label className={styles.exportField}>
              <span className={styles.exportFieldLabel}>по</span>
              <input
                type="date"
                className={styles.exportInput}
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
              />
            </label>
            <button type="button" className={styles.exportBtn} onClick={handleExportExcel}>
              Скачать Excel
            </button>
            {exportNote ? <span className={styles.exportNote}>{exportNote}</span> : null}
          </div>

          {activeTrips.length === 0 && doneTrips.length === 0 ? (
            <p className={styles.tripsEmpty}>Нет рейсов по объекту.</p>
          ) : (
            <ul className={styles.tripsList}>
              {activeTrips.map((t) => {
                const status = resolveTripStatus(t)
                const cargo = tripCargoPreview(t) || 'Рейс'
                const route = `${tripPickupLabel(t)} → ${tripUnloadLabel(t)}`
                return (
                  <li key={t.id} className={styles.tripRow} data-tone={status}>
                    <span
                      className={styles.tripDot}
                      title={DRIVER_TRIP_STATUS_LABELS[status]}
                      aria-label={DRIVER_TRIP_STATUS_LABELS[status]}
                    />
                    <span className={styles.tripWhen}>
                      <span className={styles.tripDay}>{formatTripAssignedDate(t.createdAtIso)}</span>
                      <span className={styles.tripTime}>
                        {formatTripAssignedTime(t.createdAtIso)}
                      </span>
                    </span>
                    <span className={styles.tripTask} title={route}>
                      {cargo}
                    </span>
                    <span className={styles.tripObject}>{t.siteName}</span>
                    <span className={styles.tripWho} title={t.driverName}>
                      {shortPersonName(t.driverName)}
                      {t.vehiclePlate ? (
                        <span className={styles.tripPlate}>{t.vehiclePlate}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={styles.tripDoneBtn}
                      title="Отметить исполненным"
                      onClick={() => void handleCompleteTrip(t.id)}
                    >
                      Готово
                    </button>
                  </li>
                )
              })}
              {doneTrips.map((t) => {
                const cargo = tripCargoPreview(t) || 'Рейс'
                return (
                  <li key={t.id} className={styles.tripRow} data-tone="done">
                    <span
                      className={styles.tripDot}
                      title="Исполнен"
                      aria-label="Исполнен"
                    />
                    <span className={styles.tripWhen}>
                      <span className={styles.tripDay}>{formatTripAssignedDate(t.createdAtIso)}</span>
                      <span className={styles.tripTime}>
                        {formatTripAssignedTime(t.createdAtIso)}
                      </span>
                    </span>
                    <span className={styles.tripTask}>{cargo}</span>
                    <span className={styles.tripObject}>{t.siteName}</span>
                    <span className={styles.tripWho} title={t.driverName}>
                      {shortPersonName(t.driverName)}
                    </span>
                    <span className={styles.tripDoneLabel}>Исполнен</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        </>
      ) : null}

      <div className={styles.sheet}>
        <div className={styles.split}>
          <div className={styles.mapPane}>
            {searchEnabled ? (
              <div className={styles.searchOverlay}>
                {canAssignTrip ? (
                  <div className={styles.mapMode} role="group" aria-label="Что ставим на карте">
                    <button
                      type="button"
                      className={`${styles.mapModeBtn} ${mapTarget === 'unload' ? styles.mapModeOn : ''}`}
                      onClick={() => switchMapTarget('unload')}
                    >
                      Куда везти
                    </button>
                    <button
                      type="button"
                      className={`${styles.mapModeBtn} ${mapTarget === 'pickup' ? styles.mapModeOn : ''}`}
                      onClick={() => switchMapTarget('pickup')}
                      disabled={alreadyLoaded}
                    >
                      Откуда грузить
                    </button>
                  </div>
                ) : null}
                <label className={styles.searchLabel} htmlFor={`${fieldId}-address`}>
                  {mapTarget === 'pickup' ? 'Адрес погрузки' : 'Адрес разгрузки'}
                </label>
                <div className={styles.searchRow}>
                  <input
                    id={`${fieldId}-address`}
                    className={styles.search}
                    type="text"
                    autoComplete="street-address"
                    value={query}
                    placeholder={searchPlaceholder}
                    onFocus={() => {
                      queryFocused.current = true
                    }}
                    onBlur={() => {
                      queryFocused.current = false
                    }}
                    onChange={(e) => {
                      queryFocused.current = true
                      setQuery(e.target.value)
                      if (mapTarget === 'pickup') setPickupAddress(e.target.value)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (hits[0]) pickHit(hits[0])
                        else void handleSearchNow()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.searchBtn}
                    onClick={() => void handleSearchNow()}
                    disabled={searching}
                  >
                    {searching ? '…' : 'Найти'}
                  </button>
                </div>
                {hits.length > 0 ? (
                  <ul className={styles.hits}>
                    {hits.map((h) => (
                      <li key={`${h.lat}-${h.lng}-${h.label}`}>
                        <button type="button" className={styles.hit} onClick={() => pickHit(h)}>
                          {h.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className={styles.mapGrow}>
              <DeliveryPointMap
                fill
                lat={point?.lat ?? null}
                lng={point?.lng ?? null}
                accentLat={alreadyLoaded ? null : pickupLat}
                accentLng={alreadyLoaded ? null : pickupLng}
                editable={searchEnabled}
                draggable={searchEnabled && mapTarget === 'unload'}
                accentDraggable={searchEnabled && mapTarget === 'pickup' && !alreadyLoaded}
                ariaLabel={
                  mapTarget === 'pickup' ? 'Карта точки погрузки' : 'Карта точки разгрузки'
                }
                onPick={searchEnabled ? (lat, lng) => void handleMapPick(lat, lng) : undefined}
                onAccentPick={
                  searchEnabled && !alreadyLoaded
                    ? (lat, lng) => {
                        void (async () => {
                          placePickup(formatLatLng(lat, lng), lat, lng)
                          const found = (await reverseGeocodeRemote(lat, lng)) ?? ''
                          if (found.trim()) placePickup(found, lat, lng)
                        })()
                      }
                    : undefined
                }
              />
              {canAssignTrip ? (
                <div className={styles.mapLegend} aria-hidden>
                  <span className={styles.legendRed}>Куда везти</span>
                  <span className={styles.legendBlue}>Откуда грузить</span>
                </div>
              ) : null}
            </div>

            <div className={styles.mapFooter}>
              {mapTarget === 'pickup' && canAssignTrip ? (
                <span className={styles.captionAddr}>
                  {pickupAddress.trim() ||
                    'Синяя точка — откуда грузить. Ткните карту или перетащите.'}
                </span>
              ) : point ? (
                <>
                  <span className={styles.captionAddr}>{captionAddr ?? 'Точка на карте'}</span>
                  <span className={styles.captionMeta}>{formatLatLng(point.lat, point.lng)}</span>
                  {canAssignTrip ? (
                    <a className={styles.naviBtn} href={yandexNaviUrl(point)}>
                      Навигатор
                    </a>
                  ) : null}
                </>
              ) : (
                <span className={styles.captionAddr}>Точка ещё не выбрана</span>
              )}
              {searchEnabled ? (
                <div className={styles.mapActions}>
                  <button type="button" className={styles.ghostBtn} onClick={handleHere} disabled={busy}>
                    Я здесь
                  </button>
                  {mapTarget === 'unload' && point ? (
                    <button
                      type="button"
                      className={styles.ghostBtnDanger}
                      disabled={busy}
                      onClick={() => void commit(null)}
                    >
                      Снять
                    </button>
                  ) : null}
                  {mapTarget === 'pickup' && !alreadyLoaded && (pickupLat != null || pickupAddress.trim()) ? (
                    <button
                      type="button"
                      className={styles.ghostBtnDanger}
                      disabled={busy}
                      onClick={clearPickup}
                    >
                      Снять
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {geoError ? <p className={styles.error}>{geoError}</p> : null}
          </div>

          <div className={styles.formPane}>
            {canAssignTrip ? (
              <div className={styles.assign}>
                <p className={styles.assignLead}>
                  {point
                    ? serverBacked
                      ? 'Рейс уйдёт на сервер и появится в кабинете на любом устройстве.'
                      : 'Рейс появится в кабинете. Точка пока только на этом устройстве.'
                    : 'Сначала укажите точку «Куда везти» на карте.'}
                </p>

                <div className={styles.routeCard} aria-label="Маршрут рейса">
                  <div className={styles.routeRail} aria-hidden>
                    <span className={styles.routeDotFrom} />
                    <span className={styles.routeLine} />
                    <span className={styles.routeDotTo} />
                  </div>
                  <div className={styles.routeFields}>
                    <div className={styles.routeStop}>
                      <div className={styles.routeStopHead}>
                        <span className={styles.routeStopLabel}>Откуда</span>
                        <label className={styles.checkInline}>
                          <input
                            type="checkbox"
                            checked={alreadyLoaded}
                            onChange={(e) => {
                              const on = e.target.checked
                              setAlreadyLoaded(on)
                              if (on) {
                                setPickupLat(null)
                                setPickupLng(null)
                                if (mapTarget === 'pickup') switchMapTarget('unload')
                              }
                            }}
                          />
                          Уже в кузове
                        </label>
                      </div>
                      {alreadyLoaded ? (
                        <p className={styles.routeLoaded}>Погрузка не нужна — материал уже в кузове</p>
                      ) : (
                        <input
                          className={styles.routeInput}
                          value={pickupAddress}
                          placeholder="Адрес погрузки или точка на карте"
                          onChange={(e) => {
                            const v = e.target.value
                            setPickupAddress(v)
                            if (mapTarget === 'pickup') setQuery(v)
                            if (!v.trim()) {
                              setPickupLat(null)
                              setPickupLng(null)
                            }
                          }}
                          onFocus={() => {
                            if (mapTarget !== 'pickup') switchMapTarget('pickup')
                          }}
                        />
                      )}
                    </div>

                    <div className={styles.routeStop}>
                      <span className={styles.routeStopLabel}>Куда</span>
                      <p
                        className={`${styles.routeDest} ${point ? '' : styles.routeDestEmpty}`}
                        onClick={() => {
                          if (mapTarget !== 'unload') switchMapTarget('unload')
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (mapTarget !== 'unload') switchMapTarget('unload')
                          }
                        }}
                      >
                        {captionAddr ||
                          (point ? 'Точка на карте без адреса' : 'Ткните карту или найдите адрес')}
                      </p>
                    </div>
                  </div>
                </div>

                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Водитель</span>
                  <div className={styles.driverCombo}>
                    <input
                      className={styles.fieldInput}
                      value={driverName}
                      placeholder="ФИО из списка или вручную"
                      autoComplete="off"
                      onFocus={() => setDriverMenuOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setDriverMenuOpen(false), 150)
                      }}
                      onChange={(e) => {
                        setDriverName(e.target.value)
                        setDriverMenuOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setDriverMenuOpen(false)
                        if (e.key === 'Enter' && driverHits[0]) {
                          e.preventDefault()
                          setDriverName(driverHits[0])
                          setDriverMenuOpen(false)
                        }
                      }}
                    />
                    {driverMenuOpen ? (
                      <ul className={styles.driverHits} role="listbox" aria-label="Водители">
                        {driverHits.length > 0 ? (
                          driverHits.map((n) => (
                            <li key={n}>
                              <button
                                type="button"
                                className={styles.driverHit}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setDriverName(n)
                                  setDriverMenuOpen(false)
                                }}
                              >
                                {n}
                              </button>
                            </li>
                          ))
                        ) : (
                          <li className={styles.driverEmpty}>
                            Нет в списке — будет назначено введённое ФИО
                          </li>
                        )}
                      </ul>
                    ) : null}
                  </div>
                </label>

                <label className={styles.hintField}>
                  Комментарий
                  <textarea
                    className={styles.hint}
                    rows={3}
                    value={tripComment}
                    placeholder="Состав груза, ориентир на площадке, порядок подъезда"
                    onChange={(e) => setTripComment(e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className={`${styles.assignBtn} ${assignedOk !== 'off' ? styles.assignBtnOk : ''}`}
                  disabled={!point || !driverName.trim() || busy}
                  onClick={() => void handleAssign()}
                >
                  {assignedOk === 'off' ? 'Отправить рейс' : 'Отправлено'}
                </button>
              </div>
            ) : point ? (
              <label className={styles.hintField}>
                Как подъехать
                <textarea
                  className={styles.hint}
                  rows={4}
                  value={hint}
                  placeholder="Ворота с Вокзальной, штабель слева от бытовки."
                  onChange={(e) => setHint(e.target.value)}
                  onBlur={saveHint}
                />
              </label>
            ) : (
              <p className={styles.empty}>Найдите адрес или ткните карту.</p>
            )}
          </div>
        </div>

        {canAssignTrip ? (
          <div className={styles.shareBar}>
            <DriverMessengerShare
              compact
              text={shareText}
              mapsUrl={point ? yandexMapsRouteUrl(point) : ''}
              disabled={!point}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
