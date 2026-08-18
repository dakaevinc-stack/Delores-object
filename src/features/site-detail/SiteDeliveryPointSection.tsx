import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  formatLatLng,
  renderDriverDirections,
  yandexMapsRouteUrl,
  yandexNaviUrl,
  type SiteDeliveryPoint,
} from '../../domain/siteDeliveryPoint'
import type { AddressHit } from '../../domain/addressSearch'
import {
  DRIVER_TRIP_ROLE_LABELS,
  type DriverTrip,
  type DriverTripAssignerRole,
} from '../../domain/driverTrip'
import { formatQty, unitLabel } from '../../domain/procurementRequest'
import type { MeasurementUnitId } from '../../domain/brigadierReport'
import { toDateKey } from '../../domain/workDayPlan'
import { reverseGeocodeRemote, searchAddressRemote } from '../../lib/siteFormsApi'
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
  onSave: (point: SiteDeliveryPoint | null) => void | Promise<void>
  onAssignTrip?: (
    trip: DriverTrip,
  ) => void | Promise<void | { telegramNotified?: boolean }>
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fallback */
    }
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
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
}: Props) {
  const titleId = useId()
  const { vehicles } = useFleetRegistry()
  const [query, setQuery] = useState(point?.address || address || '')
  const [hits, setHits] = useState<AddressHit[]>([])
  const [searching, setSearching] = useState(false)
  const [hint, setHint] = useState(point?.hint ?? '')
  const [copied, setCopied] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [driverName, setDriverName] = useState('')
  const [assignRole, setAssignRole] = useState<DriverTripAssignerRole>('brigadier')
  const [assignedOk, setAssignedOk] = useState<'off' | 'saved' | 'telegram'>('off')
  const [pickupAddress, setPickupAddress] = useState('')
  const [alreadyLoaded, setAlreadyLoaded] = useState(false)
  const [cargoNote, setCargoNote] = useState('')
  const [pickedCargo, setPickedCargo] = useState<string[]>([])
  const skipDebounce = useRef(false)

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
    if (point?.address) setQuery(point.address)
  }, [point?.hint, point?.lat, point?.lng, point?.address])

  useEffect(() => {
    const q = query.trim()
    if (skipDebounce.current) {
      skipDebounce.current = false
      return
    }
    if (q.length < 3 || q === (point?.address ?? '').trim()) {
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
  }, [query, point?.address])

  const commit = async (next: SiteDeliveryPoint | null) => {
    setBusy(true)
    try {
      await onSave(next)
    } finally {
      setBusy(false)
    }
  }

  const placeAt = (lat: number, lng: number, foundAddress: string, nextHint = hint) => {
    skipDebounce.current = true
    if (foundAddress) setQuery(foundAddress)
    setHits([])
    void commit({
      lat,
      lng,
      hint: nextHint.trim(),
      address: foundAddress.trim(),
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

  const handleShare = async () => {
    if (!point) return
    const text = renderDriverDirections(siteName, { ...point, hint: hint.trim() || point.hint })
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({
          title: `Куда везти — ${siteName}`,
          text,
          url: yandexMapsRouteUrl(point),
        })
        return
      }
    } catch {
      /* copy */
    }
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  const handleCopy = async () => {
    if (!point) return
    const ok = await copyText(renderDriverDirections(siteName, { ...point, hint: hint.trim() || point.hint }))
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
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
    const result = await onAssignTrip({
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
      assignedByRole: assignRole,
      createdAtIso: new Date().toISOString(),
      seenAtIso: null,
    })
    setAssignedOk(result && result.telegramNotified ? 'telegram' : 'saved')
    window.setTimeout(() => setAssignedOk('off'), 3200)
    setPickedCargo([])
    setCargoNote('')
  }

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <header className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            Для водителя
          </p>
          <h2 className={styles.title} id={titleId}>
            Куда везти материал
          </h2>
          <p className={styles.lead}>
            Введите адрес — карта сама найдёт место и поставит точку. Можно и ткнуть карту руками.
            {serverBacked ? ' Точка общая для всех устройств объекта.' : ''}
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <label className={styles.searchLabel} htmlFor="delivery-address">
          Адрес разгрузки
        </label>
        <div className={styles.searchRow}>
          <input
            id="delivery-address"
            className={styles.search}
            type="search"
            autoComplete="street-address"
            value={query}
            placeholder="Улица, дом, посёлок — как в навигаторе"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (hits[0]) pickHit(hits[0])
                else void handleSearchNow()
              }
            }}
          />
          <button type="button" className={styles.searchBtn} onClick={() => void handleSearchNow()} disabled={searching}>
            {searching ? 'Ищем…' : 'Найти'}
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

        <DeliveryPointMap
          lat={point?.lat ?? null}
          lng={point?.lng ?? null}
          onPick={(lat, lng) => void handleMapPick(lat, lng)}
        />

        <div className={styles.mapActions}>
          <button type="button" className={styles.ghostBtn} onClick={handleHere} disabled={busy}>
            Я стою на разгрузке
          </button>
          {point ? (
            <button
              type="button"
              className={styles.ghostBtnDanger}
              disabled={busy}
              onClick={() => void commit(null)}
            >
              Снять точку
            </button>
          ) : null}
        </div>

        {geoError ? <p className={styles.error}>{geoError}</p> : null}

        {point ? (
          <>
            <p className={styles.coords}>
              {point.address ? `${point.address} · ` : null}
              {formatLatLng(point.lat, point.lng)}
            </p>
            <label className={styles.hintField}>
              <span>Как подъехать и где разгружаться</span>
              <textarea
                className={styles.hint}
                rows={3}
                value={hint}
                placeholder="Например: ворота с Вокзальной, штабель щебня слева от бытовки. Во двор не заезжать."
                onChange={(e) => setHint(e.target.value)}
                onBlur={saveHint}
              />
            </label>

            <div className={styles.driverBtns}>
              <a className={styles.naviBtn} href={yandexNaviUrl(point)}>
                Яндекс.Навигатор
              </a>
              <a className={styles.mapsBtn} href={yandexMapsRouteUrl(point)} target="_blank" rel="noreferrer">
                Маршрут на Яндекс.Картах
              </a>
              <button type="button" className={styles.copyBtn} onClick={() => void handleShare()}>
                Отправить водителю
              </button>
              <button type="button" className={styles.copyBtn} onClick={() => void handleCopy()}>
                {copied ? 'Скопировано' : 'Скопировать точку'}
              </button>
            </div>

            {onAssignTrip ? (
              <div className={styles.assign}>
                <p className={styles.assignTitle}>Поставить рейс водителю</p>
                <p className={styles.assignLead}>
                  Он увидит шаги: что забрать и куда везти. Если кабинет открыт — маршрут всплывёт
                  сразу.
                </p>
                <div className={styles.assignRow}>
                  <input
                    className={styles.search}
                    list="delivery-drivers"
                    value={driverName}
                    placeholder="Кому — фамилия водителя"
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                  <datalist id="delivery-drivers">
                    {operators.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
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
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id],
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
                  className={styles.search}
                  value={cargoNote}
                  placeholder={cargoChoices.length ? 'Или напишите, что грузить' : 'Что грузить — своими словами'}
                  onChange={(e) => setCargoNote(e.target.value)}
                />
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={alreadyLoaded}
                    onChange={(e) => setAlreadyLoaded(e.target.checked)}
                  />
                  Уже в кузове — сразу на объект
                </label>
                {alreadyLoaded ? null : (
                  <input
                    className={styles.search}
                    value={pickupAddress}
                    placeholder="Откуда грузить — база, карьер, адрес"
                    onChange={(e) => setPickupAddress(e.target.value)}
                  />
                )}
                <div className={styles.roleRow}>
                  {(Object.keys(DRIVER_TRIP_ROLE_LABELS) as DriverTripAssignerRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      className={`${styles.roleBtn} ${assignRole === role ? styles.roleOn : ''}`}
                      onClick={() => setAssignRole(role)}
                    >
                      {DRIVER_TRIP_ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.assignBtn}
                  disabled={!driverName.trim() || busy}
                  onClick={() => void handleAssign()}
                >
                  {assignedOk === 'telegram'
                    ? 'Назначено · ушло в Telegram'
                    : assignedOk === 'saved'
                      ? 'Назначено'
                      : 'Отправить маршрут водителю'}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.empty}>
            Напишите адрес сверху и нажмите «Найти» — или ткните карту. Пока точки нет, водителю
            нечего открыть в навигаторе.
          </p>
        )}
      </div>
    </section>
  )
}
