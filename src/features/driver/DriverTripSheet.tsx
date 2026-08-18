import { DRIVER_TRIP_ROLE_LABELS, tripCargoLines, type DriverTrip } from '../../domain/driverTrip'
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

  return (
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-labelledby="driver-trip-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.kicker}>Маршрут</p>
        <h2 className={styles.title} id="driver-trip-title">
          {trip.siteName}
        </h2>
        {trip.vehiclePlate ? <p className={styles.meta}>{trip.vehiclePlate}</p> : null}

        <ol className={styles.steps}>
          {hasPickup ? (
            <li className={styles.step}>
              <span className={styles.num} aria-hidden>
                1
              </span>
              <div>
                <h3 className={styles.stepTitle}>Забрать</h3>
                {pickupAddress ? <p className={styles.strong}>{pickupAddress}</p> : null}
                {pickupHint ? <p className={styles.hint}>{pickupHint}</p> : null}
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
          ) : (
            <li className={styles.step}>
              <span className={styles.num} aria-hidden>
                1
              </span>
              <div>
                <h3 className={styles.stepTitle}>Что везти</h3>
                {cargo.length > 0 ? (
                  <ul className={styles.cargo}>
                    {cargo.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.hint}>Уже в кузове или скажет диспетчер.</p>
                )}
              </div>
            </li>
          )}

          <li className={styles.step}>
            <span className={styles.num} aria-hidden>
              2
            </span>
            <div>
              <h3 className={styles.stepTitle}>Везти на объект</h3>
              <p className={styles.strong}>{trip.siteName}</p>
              {trip.point.address ? <p className={styles.strong}>{trip.point.address}</p> : null}
              {trip.point.hint ? <p className={styles.hint}>{trip.point.hint}</p> : null}
              <div className={styles.btns}>
                <a className={styles.navi} href={yandexNaviUrl(trip.point)}>
                  Навигатор
                </a>
                <a className={styles.maps} href={yandexMapsRouteUrl(trip.point)} target="_blank" rel="noreferrer">
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
