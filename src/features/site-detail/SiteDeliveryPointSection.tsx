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
  type DriverTrip,
  type DriverTripAssignerRole,
  type DriverTripCargo,
} from '../../domain/driverTrip'
import { unitLabel } from '../../domain/procurementRequest'
import type { MeasurementUnitId } from '../../domain/brigadierReport'
import {
  findProcurementPreset,
  searchProcurementPresets,
} from '../../domain/procurementCatalog'
import { toDateKey } from '../../domain/workDayPlan'
import { getMaterialBudgetForSite } from '../../data/materialBudgets'
import { reverseGeocodeRemote, searchAddressRemote } from '../../lib/siteFormsApi'
import { DriverMessengerShare } from '../driver/DriverMessengerShare'
import { useFleetRegistry } from '../fleet/useFleetRegistry'
import { DeliveryPointMap } from './DeliveryPointMap'
import styles from './SiteDeliveryPointSection.module.css'

type MapTarget = 'unload' | 'pickup'

type MaterialChoice = {
  id: string
  title: string
  unitId: MeasurementUnitId
}

type PickedCargoRow = {
  id: string
  title: string
  quantity: string
  unitId: MeasurementUnitId
  custom: boolean
}

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

function parseQty(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
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
  const [lastTrip, setLastTrip] = useState<DriverTrip | null>(null)
  const [assignedOk, setAssignedOk] = useState<'off' | 'saved' | 'telegram'>('off')
  const [pickupAddress, setPickupAddress] = useState('')
  const [pickupLat, setPickupLat] = useState<number | null>(null)
  const [pickupLng, setPickupLng] = useState<number | null>(null)
  const [alreadyLoaded, setAlreadyLoaded] = useState(false)
  const [cargoNote, setCargoNote] = useState('')
  const [cargoSearch, setCargoSearch] = useState('')
  const [cargoPickerOpen, setCargoPickerOpen] = useState(false)
  const [pickedCargo, setPickedCargo] = useState<PickedCargoRow[]>([])
  const skipDebounce = useRef(false)
  const queryFocused = useRef(false)
  const strippedJunkAddress = useRef(false)

  const operators = useMemo(() => {
    const names = new Set<string>()
    for (const v of vehicles) {
      const n = v.specs?.responsibleOperator?.trim()
      if (n) names.add(n)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [vehicles])

  const driverHits = useMemo(() => {
    const q = driverName.trim()
    if (!q) return operators.slice(0, 12)
    return operators.filter((n) => driverNameMatchesQuery(n, q)).slice(0, 12)
  }, [operators, driverName])

  const siteMaterials = useMemo((): MaterialChoice[] => {
    const budget = getMaterialBudgetForSite(siteId)
    if (budget?.articles.length) {
      return budget.articles.map((a) => {
        const preset = findProcurementPreset(a.presetId)
        return {
          id: a.presetId || a.id,
          title: preset?.title ?? a.title,
          unitId: preset?.defaultUnit ?? a.unit,
        }
      })
    }
    return searchProcurementPresets('').map((p) => ({
      id: p.id,
      title: p.title,
      unitId: p.defaultUnit,
    }))
  }, [siteId])

  const cargoList = useMemo((): MaterialChoice[] => {
    const q = cargoSearch.trim()
    if (!q) return siteMaterials
    const fromCatalog = searchProcurementPresets(q).map((p) => ({
      id: p.id,
      title: p.title,
      unitId: p.defaultUnit,
    }))
    const fromSite = siteMaterials.filter((m) =>
      m.title.toLocaleLowerCase('ru-RU').includes(q.toLocaleLowerCase('ru-RU')),
    )
    const byId = new Map<string, MaterialChoice>()
    for (const m of [...fromSite, ...fromCatalog]) byId.set(m.id, m)
    return [...byId.values()]
  }, [cargoSearch, siteMaterials])

  const pickedIds = useMemo(() => new Set(pickedCargo.map((c) => c.id)), [pickedCargo])

  useEffect(() => {
    setHint(point?.hint ?? '')
  }, [point?.hint])

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

  const toggleMaterial = (m: MaterialChoice) => {
    setPickedCargo((prev) => {
      if (prev.some((r) => r.id === m.id)) return prev.filter((r) => r.id !== m.id)
      return [
        ...prev,
        {
          id: m.id,
          title: m.title,
          quantity: '',
          unitId: m.unitId,
          custom: false,
        },
      ]
    })
  }

  const openCargoPicker = () => {
    setCargoPickerOpen(true)
    setCargoSearch('')
  }

  const closeCargoPicker = () => {
    setCargoPickerOpen(false)
    setCargoSearch('')
  }

  const addCustomCargo = () => {
    setPickedCargo((prev) => [
      ...prev,
      {
        id: `custom-${newId()}`,
        title: '',
        quantity: '',
        unitId: 'm3',
        custom: true,
      },
    ])
  }

  const updateCargoRow = (id: string, patch: Partial<PickedCargoRow>) => {
    setPickedCargo((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeCargoRow = (id: string) => {
    setPickedCargo((prev) => prev.filter((r) => r.id !== id))
  }

  const handleAssign = async () => {
    if (!point || !onAssignTrip || !driverName.trim()) return
    const plate =
      vehicles.find((v) => v.specs?.responsibleOperator?.trim() === driverName.trim())?.plate ?? ''
    const cargo: DriverTripCargo[] = pickedCargo
      .map((c) => ({
        title: c.title.trim(),
        quantity: parseQty(c.quantity),
        unitLabel: unitLabel(c.unitId),
      }))
      .filter((c) => c.title)
    const trip: DriverTrip = {
      id: newId(),
      dateKey: toDateKey(new Date()),
      driverName: driverName.trim(),
      vehiclePlate: plate,
      siteId,
      siteName,
      point: { ...point, hint: hint.trim() || point.hint },
      pickup: alreadyLoaded
        ? { address: '', hint: '' }
        : { address: pickupAddress.trim(), hint: '' },
      cargo,
      cargoNote: cargoNote.trim(),
      assignedBy: '',
      assignedByRole: assignerRole,
      createdAtIso: new Date().toISOString(),
      seenAtIso: null,
    }
    const result = await onAssignTrip(trip)
    setLastTrip(trip)
    setAssignedOk(result && result.telegramNotified ? 'telegram' : 'saved')
    window.setTimeout(() => setAssignedOk('off'), 3200)
    setPickedCargo([])
    setCargoNote('')
    setCargoSearch('')
    setCargoPickerOpen(false)
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
      aria-label={canAssignTrip ? 'Рейс водителю' : 'Куда разгружать'}
    >
      <div className={styles.toolbar}>
        <span className={`${styles.syncBadge} ${serverBacked ? styles.syncOn : styles.syncOff}`}>
          {serverBacked ? 'На сервере' : 'Только здесь'}
        </span>
      </div>

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
                    : 'Сначала поставьте точку разгрузки на карте («Куда везти»).'}
                </p>

                <div className={`${styles.zone} ${styles.zoneRoute}`}>
                  <p className={styles.zoneLabel}>Куда везти</p>
                  <p className={styles.destValue}>
                    {captionAddr || (point ? 'Точка на карте без адреса' : 'Ещё не выбрано — ткните карту')}
                  </p>
                </div>

                <div className={`${styles.zone} ${styles.zoneDriver}`}>
                  <p className={styles.zoneLabel}>Водитель</p>
                  <div className={styles.driverCombo}>
                    <input
                      className={styles.fieldInput}
                      value={driverName}
                      placeholder="Начните фамилию — выберите из списка"
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
                      <ul className={styles.driverHits} role="listbox" aria-label="Водители из парка">
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
                            В парке не найден — можно оставить как напечатали
                          </li>
                        )}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className={`${styles.zone} ${styles.zoneCargo}`}>
                  <p className={styles.zoneLabel}>Груз</p>
                  <div className={styles.cargoActions}>
                    <button
                      type="button"
                      className={styles.pickCargoBtn}
                      aria-expanded={cargoPickerOpen}
                      onClick={() => (cargoPickerOpen ? closeCargoPicker() : openCargoPicker())}
                    >
                      {cargoPickerOpen ? 'Скрыть список' : 'Выбрать материал'}
                    </button>
                    <button type="button" className={styles.addOwnBtn} onClick={addCustomCargo}>
                      + Свой
                    </button>
                  </div>

                  {cargoPickerOpen ? (
                    <div className={styles.cargoPicker} role="listbox" aria-label="Список материалов">
                      <input
                        className={styles.fieldInput}
                        value={cargoSearch}
                        placeholder="Поиск в списке…"
                        onChange={(e) => setCargoSearch(e.target.value)}
                        aria-label="Поиск материала"
                        autoFocus
                      />
                      {cargoList.length > 0 ? (
                        <ul className={styles.cargoPickList}>
                          {cargoList.map((c) => {
                            const on = pickedIds.has(c.id)
                            return (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={on}
                                  className={`${styles.cargoPickRow} ${on ? styles.cargoPickOn : ''}`}
                                  onClick={() => toggleMaterial(c)}
                                >
                                  <span className={styles.cargoPickCheck} aria-hidden>
                                    {on ? '✓' : ''}
                                  </span>
                                  <span className={styles.cargoPickTitle}>{c.title}</span>
                                  <span className={styles.cargoPickUnit}>{unitLabel(c.unitId)}</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className={styles.cargoEmpty}>Ничего не найдено — добавьте свой груз.</p>
                      )}
                      <button type="button" className={styles.cargoPickerDone} onClick={closeCargoPicker}>
                        Готово
                        {pickedCargo.filter((r) => !r.custom).length
                          ? ` · ${pickedCargo.filter((r) => !r.custom).length}`
                          : ''}
                      </button>
                    </div>
                  ) : null}

                  {pickedCargo.length > 0 ? (
                    <ul className={styles.cargoList}>
                      {pickedCargo.map((row) => (
                        <li key={row.id} className={styles.cargoRow}>
                          {row.custom ? (
                            <input
                              className={styles.cargoTitle}
                              value={row.title}
                              placeholder="Название груза"
                              onChange={(e) => updateCargoRow(row.id, { title: e.target.value })}
                            />
                          ) : (
                            <span className={styles.cargoTitleText}>{row.title}</span>
                          )}
                          <input
                            className={styles.cargoQty}
                            inputMode="decimal"
                            value={row.quantity}
                            placeholder="Кол-во"
                            aria-label={`Количество: ${row.title || 'груз'}`}
                            onChange={(e) => updateCargoRow(row.id, { quantity: e.target.value })}
                          />
                          <span className={styles.cargoUnit}>{unitLabel(row.unitId)}</span>
                          <button
                            type="button"
                            className={styles.cargoRemove}
                            aria-label="Убрать"
                            onClick={() => removeCargoRow(row.id)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : cargoPickerOpen ? null : (
                    <p className={styles.cargoEmpty}>Нажмите «Выбрать материал» или добавьте свой.</p>
                  )}
                  <input
                    className={styles.fieldInput}
                    value={cargoNote}
                    placeholder="Комментарий к грузу (необязательно)"
                    onChange={(e) => setCargoNote(e.target.value)}
                  />
                </div>

                <div className={`${styles.zone} ${styles.zoneRoute}`}>
                  <p className={styles.zoneLabel}>Откуда грузить</p>
                  <label className={styles.check}>
                    Уже в кузове
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
                  </label>
                  {alreadyLoaded ? null : (
                    <input
                      className={styles.fieldInput}
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
                  {canEditPoint ? (
                    <textarea
                      className={styles.hint}
                      rows={2}
                      value={hint}
                      placeholder="Как подъехать"
                      onChange={(e) => setHint(e.target.value)}
                      onBlur={saveHint}
                    />
                  ) : point?.hint ? (
                    <p className={styles.hintNote}>{point.hint}</p>
                  ) : null}
                </div>

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
