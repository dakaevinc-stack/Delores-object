import {
  DRIVER_TRIP_ROLE_LABELS,
  formatTripAssignedTime,
  tripCargoLines,
  type DriverTrip,
} from '../../domain/driverTrip'
import { yandexMapsRouteUrl, yandexNaviUrl } from '../../domain/siteDeliveryPoint'
import styles from './DriverTripSheet.module.css'

type Props = {
  trip: DriverTrip
  onClose: () => void
}

export function DriverTripSheet({ trip, onClose }: Props) {
  const cargo = tripCargoLines(trip)
  const pickupAddress = trip.pickup.address.trim()
  const pickupHint = trip.pickup.hint.trim()
  const hasPickup = Boolean(pickupAddress || pickupHint)
  const unloadAddress = trip.point.address.trim()
  const unloadHint = trip.point.hint.trim()
  const time = formatTripAssignedTime(trip.createdAtIso)

  return (
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-labelledby="driver-trip-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.headRow}>
          <p className={styles.kicker}>Маршрут</p>
          {time ? <p className={styles.time}>назначен в {time}</p> : null}
        </div>
        <h2 className={styles.title} id="driver-trip-title">
          {unloadAddress || trip.siteName}
        </h2>
        {unloadAddress && trip.siteName ? (
          <p className={styles.meta}>Объект: {trip.siteName}</p>
        ) : null}
        {trip.vehiclePlate ? <p className={styles.meta}>{trip.vehiclePlate}</p> : null}

        <ol className={styles.steps}>
          <li className={`${styles.step} ${styles.stepPickup}`}>
            <span className={styles.num} aria-hidden>
              1
            </span>
            <div>
              <h3 className={styles.stepTitle}>Откуда забрать</h3>
              {hasPickup ? (
                <>
                  {pickupAddress ? <p className={styles.strong}>{pickupAddress}</p> : null}
                  {pickupHint ? <p className={styles.hint}>{pickupHint}</p> : null}
                </>
              ) : (
                <p className={styles.strong}>Уже в кузове / скажет диспетчер</p>
              )}
              {cargo.length > 0 ? (
                <ul className={styles.cargo}>
                  {cargo.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint}>Что грузить — уточните у диспетчера.</p>
              )}
            </div>
          </li>

          <li className={`${styles.step} ${styles.stepUnload}`}>
            <span className={`${styles.num} ${styles.numUnload}`} aria-hidden>
              2
            </span>
            <div>
              <h3 className={styles.stepTitle}>Куда везти</h3>
              {unloadAddress ? (
                <p className={styles.strong}>{unloadAddress}</p>
              ) : (
                <p className={styles.strong}>{trip.siteName}</p>
              )}
              {unloadHint ? <p className={styles.hint}>{unloadHint}</p> : null}
              <div className={styles.btns}>
                <a className={styles.navi} href={yandexNaviUrl(trip.point)}>
                  Навигатор
                </a>
                <a
                  className={styles.maps}
                  href={yandexMapsRouteUrl(trip.point)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Яндекс.Карты
                </a>
              </div>
            </div>
          </li>
        </ol>

        <p className={styles.who}>
          Назначил {DRIVER_TRIP_ROLE_LABELS[trip.assignedByRole].toLocaleLowerCase('ru-RU')}
        </p>

        <button type="button" className={styles.close} onClick={onClose}>
          Понятно
        </button>
      </div>
    </div>
  )
}
