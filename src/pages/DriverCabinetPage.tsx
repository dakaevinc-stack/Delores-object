import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  collectTodayTripsForDriver,
  collectUnreadTrips,
  isTripUnread,
  tripCargoPreview,
  type DriverTrip,
} from '../domain/driverTrip'
import { DriverTripSheet } from '../features/driver/DriverTripSheet'
import {
  loadDriverTrips,
  markDriverTripSeen,
  mergeDriverTrips,
  saveDriverTrips,
} from '../lib/driverTripsRepository'
import {
  fetchDriverNotifyConfig,
  fetchDriverNotifyStatus,
  fetchDriverTripsRemote,
  markDriverTripSeenRemote,
} from '../lib/siteFormsApi'
import styles from './DriverCabinetPage.module.css'

const NAME_KEY = 'deloresh-driver-cabinet-name:v1'
const POLL_MS = 12_000

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function DriverCabinetPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [name, setName] = useState(readName)
  const [trips, setTrips] = useState<DriverTrip[]>(() => loadDriverTrips())
  const [botUsername, setBotUsername] = useState('')
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramBound, setTelegramBound] = useState(false)
  const knownUnread = useRef<Set<string> | null>(null)
  const tripParam = searchParams.get('trip')

  const today = useMemo(
    () => collectTodayTripsForDriver(trips, name),
    [trips, name],
  )
  const unread = useMemo(() => collectUnreadTrips(today), [today])
  const openId = tripParam && today.some((t) => t.id === tripParam) ? tripParam : null
  const openTrip = today.find((t) => t.id === openId) ?? null
  const newestUnread = unread[unread.length - 1] ?? unread[0] ?? null

  const refresh = useCallback(async () => {
    const remote = await fetchDriverTripsRemote()
    if (!remote) return
    const merged = mergeDriverTrips(loadDriverTrips(), remote)
    saveDriverTrips(merged)
    setTrips(merged)
  }, [])

  useEffect(() => {
    try {
      if (name.trim()) localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      /* ignore */
    }
  }, [name])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(t)
  }, [refresh])

  useEffect(() => {
    void (async () => {
      const cfg = await fetchDriverNotifyConfig()
      if (!cfg) return
      setTelegramEnabled(cfg.telegramEnabled)
      setBotUsername(cfg.botUsername)
    })()
  }, [])

  useEffect(() => {
    const q = name.trim()
    if (!q) {
      setTelegramBound(false)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        const bound = await fetchDriverNotifyStatus(q)
        if (!cancelled && bound !== null) setTelegramBound(bound)
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [name])

  useEffect(() => {
    const ids = new Set(unread.map((t) => t.id))
    if (knownUnread.current) {
      for (const id of ids) {
        if (!knownUnread.current.has(id)) {
          try {
            navigator.vibrate?.(180)
          } catch {
            /* ignore */
          }
          const trip = today.find((t) => t.id === id)
          if (trip && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification('Новый маршрут', {
                body: tripCargoPreview(trip) || trip.siteName,
                tag: trip.id,
              })
            } catch {
              /* ignore */
            }
          }
          break
        }
      }
    }
    knownUnread.current = ids
  }, [unread, today])

  const openTripById = (id: string) => {
    setSearchParams({ trip: id }, { replace: true })
  }

  const closeTrip = () => {
    setSearchParams({}, { replace: true })
  }

  useEffect(() => {
    if (!openTrip) return
    if (!isTripUnread(openTrip)) return
    const at = new Date().toISOString()
    setTrips(markDriverTripSeen(openTrip.id, at))
    void markDriverTripSeenRemote(openTrip.id)
  }, [openTrip])

  const botHref = botUsername ? `https://t.me/${botUsername}` : ''

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Навигация">
        <Link className={styles.crumb} to="/">
          На главную
        </Link>
      </nav>

      <header className={styles.head}>
        <p className={styles.kicker}>
          <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
          Кабинет водителя
        </p>
        <h1 className={styles.title}>Куда ехать сегодня</h1>
        <p className={styles.lead}>
          Напишите фамилию. Новый маршрут всплывёт здесь — нажмите и увидите, что грузить и куда
          везти.
        </p>
      </header>

      <label className={styles.field}>
        <span>Я водитель</span>
        <input
          className={styles.input}
          value={name}
          placeholder="Фамилия и имя"
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {telegramEnabled ? (
        <section className={styles.notify} aria-label="Оповещения на телефон">
          <p className={styles.notifyTitle}>Если кабинет закрыт</p>
          {telegramBound ? (
            <p className={styles.notifyOk}>Telegram подключён — рейс придёт и туда.</p>
          ) : (
            <p className={styles.notifyLead}>
              Один раз откройте бота и напишите ту же фамилию.
            </p>
          )}
          {botHref ? (
            <a className={styles.notifyBtn} href={botHref} target="_blank" rel="noreferrer">
              Открыть бота в Telegram
            </a>
          ) : null}
        </section>
      ) : null}

      {!name.trim() ? (
        <p className={styles.empty}>Сначала напишите, кто вы — тогда покажем рейсы.</p>
      ) : today.length === 0 ? (
        <p className={styles.empty}>На сегодня рейсов нет. Когда диспетчер поставит маршрут — он появится здесь.</p>
      ) : (
        <>
          {newestUnread && newestUnread.id !== openId ? (
            <button
              type="button"
              className={styles.banner}
              onClick={() => openTripById(newestUnread.id)}
            >
              <span className={styles.bannerKicker}>
                {unread.length > 1 ? 'Новые маршруты' : 'Новый маршрут'}
              </span>
              <span className={styles.bannerTitle}>
                {tripCargoPreview(newestUnread) || newestUnread.siteName}
              </span>
              <span className={styles.bannerGo}>Открыть</span>
            </button>
          ) : null}

          <ul className={styles.list}>
            {today.map((trip, i) => {
              const preview = tripCargoPreview(trip)
              const unreadTrip = isTripUnread(trip)
              return (
                <li key={trip.id}>
                  <button
                    type="button"
                    className={`${styles.card} ${unreadTrip ? styles.cardNew : ''}`}
                    onClick={() => openTripById(trip.id)}
                  >
                    <p className={styles.cardKicker}>
                      {unreadTrip ? 'Новый · ' : ''}
                      Рейс {i + 1}
                      {trip.vehiclePlate ? ` · ${trip.vehiclePlate}` : ''}
                    </p>
                    <h2 className={styles.cardTitle}>{trip.siteName}</h2>
                    {preview ? <p className={styles.cardAddress}>{preview}</p> : null}
                    {trip.pickup.address ? (
                      <p className={styles.cardHint}>Забрать: {trip.pickup.address}</p>
                    ) : null}
                    {trip.point.address ? (
                      <p className={styles.cardHint}>Везти: {trip.point.address}</p>
                    ) : (
                      <p className={styles.cardHint}>Везти на объект</p>
                    )}
                    <span className={styles.cardOpen}>Открыть маршрут</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {openTrip ? <DriverTripSheet trip={openTrip} onClose={closeTrip} /> : null}
    </div>
  )
}
