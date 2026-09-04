import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  collectTodayTripsForDriver,
  collectUnreadTrips,
  DRIVER_TRIP_STATUS_LABELS,
  formatTripAssignedTime,
  isTripUnread,
  resolveTripStatus,
  tripCargoPreview,
  tripPickupLabel,
  tripUnloadLabel,
  type DriverTrip,
} from '../domain/driverTrip'
import { DriverTripSheet } from '../features/driver/DriverTripSheet'
import {
  loadDriverTrips,
  markDriverTripDone,
  markDriverTripSeen,
  mergeDriverTrips,
  saveDriverTrips,
} from '../lib/driverTripsRepository'
import {
  fetchDriverNotifyConfig,
  fetchDriverNotifyStatus,
  fetchDriverTripsRemote,
  markDriverTripDoneRemote,
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
  const [syncOk, setSyncOk] = useState<boolean | null>(null)
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
    if (!remote) {
      setSyncOk(false)
      return
    }
    setSyncOk(true)
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

  const completeOpenTrip = async (id: string) => {
    setTrips(markDriverTripDone(id))
    await markDriverTripDoneRemote(id)
    closeTrip()
  }

  const botHref = botUsername ? `https://t.me/${botUsername}` : ''
  const todayLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
    timeZone: 'Europe/Moscow',
  }).format(new Date())

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Навигация">
        <Link className={styles.crumb} to="/">
          На главную
        </Link>
        {syncOk === true ? (
          <span className={styles.syncOn}>С сервера</span>
        ) : syncOk === false ? (
          <span className={styles.syncOff}>Только здесь</span>
        ) : null}
      </nav>

      <header className={styles.head}>
        <p className={styles.kicker}>
          <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
          Кабинет водителя
        </p>
        <h1 className={styles.title}>Рейсы на сегодня</h1>
        <p className={styles.lead}>
          Укажите ФИО как у диспетчера. Каждый рейс — отдельно: откуда забрать и куда везти.
        </p>
        <p className={styles.dateLine}>{todayLabel}</p>
        <p className={styles.tasksLinkWrap}>
          <Link className={styles.tasksLink} to="/tasks">
            Мои задачи →
          </Link>
        </p>
      </header>

      <label className={styles.field}>
        <span>Я водитель</span>
        <input
          className={styles.input}
          value={name}
          placeholder="Фамилия и имя — как в рейсе"
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
            <p className={styles.notifyLead}>Один раз откройте бота и напишите ту же фамилию.</p>
          )}
          {botHref ? (
            <a className={styles.notifyBtn} href={botHref} target="_blank" rel="noreferrer">
              Открыть бота в Telegram
            </a>
          ) : null}
        </section>
      ) : null}

      {!name.trim() ? (
        <p className={styles.empty}>Сначала укажите ФИО — покажем ваши рейсы на сегодня.</p>
      ) : today.length === 0 ? (
        <div className={styles.emptyBox}>
          <p className={styles.empty}>На сегодня рейсов нет.</p>
          <p className={styles.emptyHint}>
            Когда диспетчер отправит рейс на это ФИО, он появится здесь. Проверьте написание — должно
            совпадать с рейсом.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.summary} aria-live="polite">
            <span className={styles.summaryCount}>
              {today.length}{' '}
              {today.length === 1 ? 'рейс' : today.length < 5 ? 'рейса' : 'рейсов'}
            </span>
            {unread.length > 0 ? (
              <span className={styles.summaryNew}>{unread.length} новых</span>
            ) : (
              <span className={styles.summaryOk}>Новых нет</span>
            )}
          </div>

          {newestUnread && newestUnread.id !== openId ? (
            <button
              type="button"
              className={styles.banner}
              onClick={() => openTripById(newestUnread.id)}
            >
              <span className={styles.bannerKicker}>
                {unread.length > 1 ? 'Есть новые рейсы' : 'Новый рейс'}
              </span>
              <span className={styles.bannerTitle}>
                {tripCargoPreview(newestUnread) || newestUnread.siteName}
              </span>
              <span className={styles.bannerRoute}>
                {tripPickupLabel(newestUnread)} → {tripUnloadLabel(newestUnread)}
              </span>
              <span className={styles.bannerGo}>Открыть</span>
            </button>
          ) : null}

          <ol className={styles.list}>
            {today.map((trip, i) => {
              const preview = tripCargoPreview(trip)
              const status = resolveTripStatus(trip)
              const unreadTrip = status === 'waiting'
              const time = formatTripAssignedTime(trip.createdAtIso)
              const from = tripPickupLabel(trip)
              const to = tripUnloadLabel(trip)
              return (
                <li key={trip.id}>
                  <button
                    type="button"
                    className={`${styles.card} ${unreadTrip ? styles.cardNew : ''} ${status === 'done' ? styles.cardDone : ''}`}
                    onClick={() => openTripById(trip.id)}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.cardNum}>Рейс {i + 1}</span>
                      <span className={styles.cardTopRight}>
                        <span className={styles.badgeStatus} data-tone={status}>
                          {DRIVER_TRIP_STATUS_LABELS[status]}
                        </span>
                        {time ? <span className={styles.cardTime}>{time}</span> : null}
                      </span>
                    </div>

                    {preview ? <p className={styles.cardCargo}>{preview}</p> : null}

                    <div className={styles.route}>
                      <div className={`${styles.routeBlock} ${styles.routeFrom}`}>
                        <span className={styles.routeLabel}>Откуда</span>
                        <span className={styles.routeValue}>{from}</span>
                      </div>
                      <span className={styles.routeArrow} aria-hidden>
                        →
                      </span>
                      <div className={`${styles.routeBlock} ${styles.routeTo}`}>
                        <span className={styles.routeLabel}>Куда</span>
                        <span className={styles.routeValue}>{to}</span>
                      </div>
                    </div>

                    <p className={styles.cardSite}>{trip.siteName}</p>
                    {trip.vehiclePlate ? (
                      <p className={styles.cardPlate}>{trip.vehiclePlate}</p>
                    ) : null}

                    <span className={styles.cardOpen}>
                      {status === 'done' ? 'Смотреть' : 'Открыть маршрут'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {openTrip ? (
        <DriverTripSheet
          trip={openTrip}
          onClose={closeTrip}
          onComplete={completeOpenTrip}
        />
      ) : null}
    </div>
  )
}
