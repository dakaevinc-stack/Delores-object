import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toDateKey } from '../../domain/workDayPlan'
import {
  collectOverdueDeliveries,
  collectTodayDeliveries,
  type TodayDeliveryCard,
} from '../../domain/todayDeliveries'
import {
  cargoReceiptPatch,
  formatReceiptStampRu,
  makeAcceptedReceipt,
  type CargoReceipt,
} from '../../domain/cargoReceipt'
import {
  renderDriverDirections,
  yandexMapsRouteUrl,
  type SiteDeliveryPoint,
} from '../../domain/siteDeliveryPoint'
import {
  formatQty,
  unitLabel,
  type ProcurementRequest,
} from '../../domain/procurementRequest'
import { CargoReceiptSheet } from './CargoReceiptSheet'
import styles from './TodayDeliveriesBoard.module.css'

type Props = {
  requests: readonly ProcurementRequest[]
  /** На главной показываем объект и ссылку. На объекте — принять / отказать. */
  variant: 'home' | 'site'
  onUpdateRequest?: (requestId: string, patch: Partial<ProcurementRequest>) => void
  deliveryPoints?: ReadonlyMap<string, SiteDeliveryPoint>
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
  return false
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

function ReceiptMedia({ receipt }: { receipt: CargoReceipt }) {
  if (receipt.media.length === 0) return null
  return (
    <ul className={styles.receiptMedia}>
      {receipt.media.map((m) => (
        <li key={m.id}>
          {m.kind === 'video' && m.previewUrl ? (
            <video src={m.previewUrl} muted playsInline controls />
          ) : m.previewUrl ? (
            <img src={m.previewUrl} alt="" />
          ) : (
            <span className={styles.mediaFallback}>{m.kind === 'video' ? 'Видео' : 'Фото'}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function DeliveryCard({
  card,
  showSite,
  point,
  onAccept,
  onRefuse,
}: {
  card: TodayDeliveryCard
  showSite: boolean
  point: SiteDeliveryPoint | null
  onAccept?: (requestId: string) => void
  onRefuse?: (requestId: string) => void
}) {
  const waiting = card.status === 'pending'
  const refused = card.status === 'refused'
  const receipt = card.receipt
  const [copied, setCopied] = useState(false)

  const sharePoint = async () => {
    if (!point) return
    const text = renderDriverDirections(card.siteName, point)
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({
          title: `Куда везти — ${card.siteName}`,
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

  return (
    <article
      className={`${styles.card} ${
        waiting ? styles.cardWait : refused ? styles.cardRefused : styles.cardDone
      }`}
    >
      <header className={styles.cardHead}>
        <p className={styles.cardKicker}>Заявка № {card.shortCode}</p>
        <span
          className={`${styles.badge} ${
            waiting ? styles.badgeWait : refused ? styles.badgeRefused : styles.badgeDone
          }`}
        >
          {waiting ? (
            'Ожидаем'
          ) : refused ? (
            'Отказ'
          ) : (
            <>
              <CheckIcon /> Принято
            </>
          )}
        </span>
      </header>
      {showSite ? <p className={styles.siteName}>{card.siteName}</p> : null}
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
      {receipt ? (
        <div className={refused ? styles.stampBad : styles.stampOk}>
          <p>
            {refused ? 'Отказано в приёмке' : 'Принято'} {formatReceiptStampRu(receipt.atIso)}
          </p>
          {receipt.reason ? <p className={styles.reasonText}>{receipt.reason}</p> : null}
        </div>
      ) : null}
      {receipt ? <ReceiptMedia receipt={receipt} /> : null}
      {point ? (
        <div className={styles.driverBox}>
          <p className={styles.driverLabel}>Куда ехать</p>
          {point.address ? <p className={styles.driverHint}>{point.address}</p> : null}
          {point.hint ? <p className={styles.driverHint}>{point.hint}</p> : null}
          <div className={styles.driverRow}>
            <a className={styles.driverLink} href={yandexMapsRouteUrl(point)} target="_blank" rel="noreferrer">
              Маршрут
            </a>
            <button type="button" className={styles.driverCopy} onClick={() => void sharePoint()}>
              {copied ? 'Скопировано' : 'Водителю'}
            </button>
          </div>
        </div>
      ) : !showSite ? (
        <p className={styles.noPoint}>Точки разгрузки ещё нет — поставьте её на карте ниже.</p>
      ) : null}
      {showSite ? (
        <Link className={styles.siteLink} to={`/objects/${card.siteId}`}>
          Открыть объект
        </Link>
      ) : null}
      {!showSite && waiting && onAccept && onRefuse ? (
        <div className={styles.decide}>
          <button type="button" className={styles.acceptBtn} onClick={() => onAccept(card.requestId)}>
            Принять материал
          </button>
          <button type="button" className={styles.refuseBtn} onClick={() => onRefuse(card.requestId)}>
            Отказать в приёмке
          </button>
        </div>
      ) : null}
    </article>
  )
}

export function TodayDeliveriesBoard({
  requests,
  variant,
  onUpdateRequest,
  deliveryPoints,
}: Props) {
  const todayKey = toDateKey(new Date())
  const today = collectTodayDeliveries(requests, todayKey)
  const overdue = collectOverdueDeliveries(requests, todayKey)
  const waitingCount = today.filter((c) => c.status === 'pending').length
  const refusedCount = today.filter((c) => c.status === 'refused').length
  const showSite = variant === 'home'
  const [refuseId, setRefuseId] = useState<string | null>(null)
  const refuseReq = refuseId ? requests.find((r) => r.id === refuseId) ?? null : null

  const lead =
    today.length === 0
      ? 'На сегодня поставок нет. Они появляются здесь, когда снабжение согласует заявку.'
      : waitingCount > 0
        ? `Сегодня ждать ${waitingCount} ${waitingCount === 1 ? 'поставку' : waitingCount < 5 ? 'поставки' : 'поставок'}. Если материал нельзя принять — оформите отказ: причина, пояснение и фото или видео.`
        : refusedCount > 0
          ? 'На сегодня поставки разобраны: часть принята, по части оформлен отказ в приёмке.'
          : 'На сегодня все поставки приняты.'

  const handleAccept = (requestId: string) => {
    if (!onUpdateRequest) return
    onUpdateRequest(requestId, cargoReceiptPatch(makeAcceptedReceipt(new Date().toISOString())))
  }

  const handleRefuseSubmit = async (receipt: CargoReceipt) => {
    if (!refuseId || !onUpdateRequest) return
    onUpdateRequest(refuseId, cargoReceiptPatch(receipt))
    setRefuseId(null)
  }

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
        <p className={styles.lead}>{lead}</p>
      </header>

      {today.length > 0 ? (
        <div className={styles.grid}>
          {today.map((card) => (
            <DeliveryCard
              key={card.requestId}
              card={card}
              showSite={showSite}
              point={deliveryPoints?.get(card.siteId) ?? null}
              onAccept={handleAccept}
              onRefuse={setRefuseId}
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
                point={deliveryPoints?.get(card.siteId) ?? null}
                onAccept={handleAccept}
                onRefuse={setRefuseId}
              />
            ))}
          </div>
        </div>
      ) : null}

      {refuseReq ? (
        <CargoReceiptSheet
          request={refuseReq}
          onClose={() => setRefuseId(null)}
          onSubmit={handleRefuseSubmit}
        />
      ) : null}
    </section>
  )
}
