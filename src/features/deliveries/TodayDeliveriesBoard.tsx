import { Link } from 'react-router-dom'
import { toDateKey } from '../../domain/workDayPlan'
import {
  collectOverdueDeliveries,
  collectTodayDeliveries,
  type TodayDeliveryCard,
} from '../../domain/todayDeliveries'
import {
  formatQty,
  unitLabel,
  type ProcurementRequest,
} from '../../domain/procurementRequest'
import styles from './TodayDeliveriesBoard.module.css'

type Props = {
  requests: readonly ProcurementRequest[]
  /** На главной показываем объект и ссылку. На объекте — кнопку «Принял». */
  variant: 'home' | 'site'
  onAccept?: (requestId: string) => void
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 7.2 5.8 10 11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeliveryCard({
  card,
  showSite,
  onAccept,
}: {
  card: TodayDeliveryCard
  showSite: boolean
  onAccept?: (requestId: string) => void
}) {
  const waiting = card.status === 'pending'
  return (
    <article
      className={`${styles.card} ${waiting ? styles.cardWait : styles.cardDone}`}
    >
      <header className={styles.cardHead}>
        <p className={styles.cardKicker}>Заявка № {card.shortCode}</p>
        <span className={`${styles.badge} ${waiting ? styles.badgeWait : styles.badgeDone}`}>
          {waiting ? 'Ждём сегодня' : (
            <>
              <CheckIcon /> Уже приняли
            </>
          )}
        </span>
      </header>
      {showSite ? (
        <p className={styles.siteName}>{card.siteName}</p>
      ) : null}
      {card.urgent ? <p className={styles.urgent}>Срочно</p> : null}
      <ul className={styles.items}>
        {card.items.map((it, i) => (
          <li key={`${card.requestId}-${i}`}>
            <span className={styles.itemTitle}>{it.title}</span>
            <span className={styles.itemQty}>
              {formatQty(it.quantity)} {unitLabel(it.unitId)}
            </span>
          </li>
        ))}
      </ul>
      {showSite ? (
        <Link className={styles.siteLink} to={`/objects/${card.siteId}`}>
          Открыть объект
        </Link>
      ) : null}
      {!showSite && waiting && onAccept ? (
        <button
          type="button"
          className={styles.acceptBtn}
          onClick={() => onAccept(card.requestId)}
        >
          Принял груз
        </button>
      ) : null}
    </article>
  )
}

export function TodayDeliveriesBoard({ requests, variant, onAccept }: Props) {
  const todayKey = toDateKey(new Date())
  const today = collectTodayDeliveries(requests, todayKey)
  const overdue = collectOverdueDeliveries(requests, todayKey)
  const waitingCount = today.filter((c) => c.status === 'pending').length
  const showSite = variant === 'home'

  return (
    <section className={styles.section} aria-labelledby="today-deliveries-heading">
      <header className={styles.head}>
        <p className={styles.kicker}>
          <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
          Для бригадира
        </p>
        <h2 className={styles.title} id="today-deliveries-heading">
          Сегодня ждать
        </h2>
        <p className={styles.lead}>
          {today.length === 0
            ? 'На сегодня поставок нет. Если машина едет — её не видно, пока снабжение не создаст заявку.'
            : waitingCount > 0
              ? `Сегодня ждать ${waitingCount} ${waitingCount === 1 ? 'поставку' : waitingCount < 5 ? 'поставки' : 'поставок'}: щебень, песок и остальное из заявок.`
              : 'На сегодня всё уже принято.'}
        </p>
      </header>

      {today.length > 0 ? (
        <div className={styles.grid}>
          {today.map((card) => (
            <DeliveryCard
              key={card.requestId}
              card={card}
              showSite={showSite}
              onAccept={onAccept}
            />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Поставок на сегодня нет.</p>
      )}

      {overdue.length > 0 ? (
        <div className={styles.overdue}>
          <h3 className={styles.overdueTitle}>Ещё не приехало с прошлых дней</h3>
          <div className={styles.grid}>
            {overdue.map((card) => (
              <DeliveryCard
                key={card.requestId}
                card={card}
                showSite={showSite}
                onAccept={onAccept}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
