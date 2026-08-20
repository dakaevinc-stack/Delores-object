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
import { type DriverTrip, type DriverTripAssignerRole } from '../../domain/driverTrip'
import { formatQty, unitLabel } from '../../domain/procurementRequest'
import type { MeasurementUnitId } from '../../domain/brigadierReport'
import { toDateKey } from '../../domain/workDayPlan'
import { reverseGeocodeRemote, searchAddressRemote } from '../../lib/siteFormsApi'
import { DriverMessengerShare } from '../driver/DriverMessengerShare'
import { useFleetRegistry } from '../fleet/useFleetRegistry'
import { DeliveryPointMap } from './DeliveryPointMap'
import styles from './SiteDeliveryPointSection.module.css'

type DriverTripCargoChoice = {
  id: string
  title: string
  quantity: number
  unitId: MeasurementUnitId
}

type Props = {
  siteName: string
  siteId: string
  address?: string
  point: SiteDeliveryPoint | null
  serverBacked?: boolean
  cargoChoices?: readonly DriverTripCargoChoice[]
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

export function SiteDeliveryPointSection({
  siteName,
  siteId,
  address,
  point,
  serverBacked = false,
  cargoChoices = [],
  onSave,
  onAssignTrip,
  assignerRole = 'dispatcher',
}: Props) {
  const titleId = useId()
  const fieldId = useId()
  const canEditPoint = Boolean(onSave)
  const canAssignTrip = Boolean(onAssignTrip)
  const { vehicles } = useFleetRegistry()
  const [query, setQuery] = useState(() => displayDeliveryAddress(point?.address ?? ''))
  const [hits, setHits] = useState<AddressHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hint, setHint] = useState(point?.hint ?? '')
  const [geoError, setGeoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [driverName, setDriverName] = useState('')
  const [lastTrip, setLastTrip] = useState<DriverTrip | null>(null)
  const [assignedOk, setAssignedOk] = useState<'off' | 'saved' | 'telegram'>('off')
  const [pickupAddress, setPickupAddress] = useState('')
  const [alreadyLoaded, setAlreadyLoaded] = useState(false)
  const [cargoNote, setCargoNote] = useState('')
  const [pickedCargo, setPickedCargo] = useState<string[]>([])
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

  useEffect(() => {
    setHint(point?.hint ?? '')
  }, [point?.hint])

  useEffect(() => {
    if (queryFocused.current) return
    setQuery(displayDeliveryAddress(point?.address ?? ''))
  }, [point?.lat, point?.lng, point?.address])

  useEffect(() => {
    if (strippedJunkAddress.current || !onSave || !point) return
    const shown = displayDeliveryAddress(point.address)
    if (shown === (point.address ?? '').trim()) return
    strippedJunkAddress.current = true
    void onSave({ ...point, address: shown })
  }, [onSave, point])

  useEffect(() => {
    if (!canEditPoint) {
      setHits([])
      return
    }
    const q = query.trim()
    if (skipDebounce.current) {
      skipDebounce.current = false
      return
    }
    if (q.length < 3 || q === displayDeliveryAddress(point?.address ?? '')) {
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
          if (found.length === 0) setGeoError('Адрес не нашёлся. Проверьте написание или поставьте точку на карте.')
        } catch {
          setGeoError('Поиск адреса сейчас недоступен. Поставьте точку на карте.')
        } finally {
          setSearching(false)
        }
      })()
    }, 400)
    return () => window.clearTimeout(t)
  }, [canEditPoint, query, point?.address])

  const commit = async (next: SiteDeliveryPoint | null) => {
    if (!onSave) return
    setBusy(true)
    try {
      await onSave(next)
    } finally {
      setBusy(false)
    }
  }

  const placeAt = (lat: number, lng: number, foundAddress: string, nextHint = hint) => {
    skipDebounce.current = true
    queryFocused.current = false
    const label = displayDeliveryAddress(foundAddress)
    if (label) setQuery(label)
    setHits([])
    void commit({
      lat,
      lng,
      hint: nextHint.trim(),
      address: label,
      updatedAtIso: new Date().toISOString(),
    })
  }

  const pickHit = (hit: AddressHit) => {
    setGeoError(null)
    placeAt(hit.lat, hit.lng, hit.label)
  }

  const handleSearchNow = async () => {
    const q = query.trim() || siteName
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
    const found = (await reverseGeocodeRemote(lat, lng)) ?? ''
    placeAt(lat, lng, found)
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

  const handleAssign = async () => {
    if (!point || !onAssignTrip || !driverName.trim()) return
    const plate =
      vehicles.find((v) => v.specs?.responsibleOperator?.trim() === driverName.trim())?.plate ?? ''
    const cargo = cargoChoices
      .filter((c) => pickedCargo.includes(c.id))
      .map((c) => ({
        title: c.title,
        quantity: c.quantity,
        unitLabel: unitLabel(c.unitId),
      }))
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
  }

  const sharePoint = point ? { ...point, hint: hint.trim() || point.hint } : null
  const cabinetUrl =
    typeof window !== 'undefined' ? driverCabinetUrl(window.location.origin) : '/driver'
  const shareText = sharePoint
    ? renderDriverShareText(siteName, sharePoint, lastTrip, cabinetUrl)
    : ''
  const captionAddr = displayDeliveryAddress(point?.address ?? '') || null

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <header className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <span className={styles.kickerMark} aria-hidden />
            Диспетчер
          </p>
          <h2 className={styles.title} id={titleId}>
            {canAssignTrip ? 'Рейс водителю' : 'Куда разгружать'}
          </h2>
          <p className={styles.lead}>
            {canAssignTrip
              ? 'Точка на карте, груз и отправка в кабинет.'
              : 'Адрес или точка на карте.'}
          </p>
        </div>
        <span className={`${styles.syncBadge} ${serverBacked ? styles.syncOn : styles.syncOff}`}>
          {serverBacked ? 'На сервере' : 'Только здесь'}
        </span>
      </header>

      <div className={styles.sheet}>
        <div className={styles.split}>
          <div className={styles.mapPane}>
            {canEditPoint ? (
              <div className={styles.searchOverlay}>
                <label className={styles.searchLabel} htmlFor={`${fieldId}-address`}>
                  Адрес разгрузки
                </label>
                <div className={styles.searchRow}>
                  <input
                    id={`${fieldId}-address`}
                    className={styles.search}
                    type="text"
                    autoComplete="street-address"
                    value={query}
                    placeholder={address?.trim() || 'Улица, дом, посёлок'}
                    onFocus={() => {
                      queryFocused.current = true
                    }}
                    onBlur={() => {
                      queryFocused.current = false
                    }}
                    onChange={(e) => {
                      queryFocused.current = true
                      setQuery(e.target.value)
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
                compact
                lat={point?.lat ?? null}
                lng={point?.lng ?? null}
                editable={canEditPoint}
                onPick={canEditPoint ? (lat, lng) => void handleMapPick(lat, lng) : undefined}
              />
            </div>

            <div className={styles.mapFooter}>
              {point ? (
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
              {canEditPoint ? (
                <div className={styles.mapActions}>
                  <button type="button" className={styles.ghostBtn} onClick={handleHere} disabled={busy}>
                    Я здесь
                  </button>
                  {point ? (
                    <button
                      type="button"
                      className={styles.ghostBtnDanger}
                      disabled={busy}
                      onClick={() => void commit(null)}
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
                    : 'Сначала поставьте точку на карте.'}
                </p>

                <div className={`${styles.zone} ${styles.zoneDriver}`}>
                  <p className={styles.zoneLabel}>Водитель</p>
                  <input
                    className={styles.fieldInput}
                    list={`${fieldId}-drivers`}
                    value={driverName}
                    placeholder="ФИО водителя"
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                  <datalist id={`${fieldId}-drivers`}>
                    {operators.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>

                <div className={`${styles.zone} ${styles.zoneCargo}`}>
                  <p className={styles.zoneLabel}>Груз</p>
                  {cargoChoices.length > 0 ? (
                    <div className={styles.cargoChips} role="group" aria-label="Что грузить">
                      {cargoChoices.map((c) => {
                        const on = pickedCargo.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`${styles.roleBtn} ${on ? styles.roleOn : ''}`}
                            onClick={() =>
                              setPickedCargo((prev) =>
                                prev.includes(c.id)
                                  ? prev.filter((id) => id !== c.id)
                                  : [...prev, c.id],
                              )
                            }
                          >
                            {c.title} · {formatQty(c.quantity)} {unitLabel(c.unitId)}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  <input
                    className={styles.fieldInput}
                    value={cargoNote}
                    placeholder={cargoChoices.length ? 'Или свой груз' : 'Что грузить'}
                    onChange={(e) => setCargoNote(e.target.value)}
                  />
                </div>

                <div className={`${styles.zone} ${styles.zoneRoute}`}>
                  <p className={styles.zoneLabel}>Маршрут</p>
                  <label className={styles.check}>
                    Уже в кузове
                    <input
                      type="checkbox"
                      checked={alreadyLoaded}
                      onChange={(e) => setAlreadyLoaded(e.target.checked)}
                    />
                  </label>
                  {alreadyLoaded ? null : (
                    <input
                      className={styles.fieldInput}
                      value={pickupAddress}
                      placeholder="Откуда грузить"
                      onChange={(e) => setPickupAddress(e.target.value)}
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
