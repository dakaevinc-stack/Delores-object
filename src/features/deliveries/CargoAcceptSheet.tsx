import { useId, useMemo, useState } from 'react'
import {
  makePartialAcceptedReceipt,
  parseAcceptanceLines,
  remainingQtyForItem,
  type CargoReceipt,
} from '../../domain/cargoReceipt'
import { formatQty, unitLabel, type ProcurementRequest } from '../../domain/procurementRequest'
import { loadLocalSession } from '../../lib/localSession'
import styles from './CargoReceiptSheet.module.css'

type Props = {
  request: ProcurementRequest
  onClose: () => void
  onSubmit: (receipt: CargoReceipt) => void | Promise<void>
}

export function CargoAcceptSheet({ request, onClose, onSubmit }: Props) {
  const titleId = useId()
  const [qty, setQty] = useState(() => request.items.map(() => ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const receiver = loadLocalSession()?.fullName ?? ''

  const remainders = useMemo(
    () => request.items.map((_, index) => remainingQtyForItem(request, index)),
    [request],
  )

  const fillAll = () => {
    setQty(remainders.map((n) => (n > 0 ? String(n) : '')))
    setError(null)
  }

  const handleSubmit = async () => {
    const parsed = parseAcceptanceLines(request, qty)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(makePartialAcceptedReceipt(new Date().toISOString(), parsed.lines, receiver))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось сохранить. Попробуйте ещё раз.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.scrim} role="presentation" onClick={() => !busy && onClose()}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.sheetRail} aria-hidden />
        <header className={styles.head}>
          <div className={styles.headTop}>
            <p className={styles.kicker}>Приёмка на объекте</p>
            <button type="button" className={styles.closeBtn} disabled={busy} onClick={onClose}>
              Закрыть
            </button>
          </div>
          <h2 className={styles.title} id={titleId}>
            Сколько пришло
          </h2>
          <p className={styles.lead}>
            Заявка № {request.shortCode}
            {receiver ? ` · принимает ${receiver}` : ''}. Остаток можно закрыть сразу или частями.
          </p>
        </header>

        <div className={styles.body}>
          <ul className={styles.acceptList}>
            {request.items.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <div className={styles.acceptMeta}>
                  <span className={styles.itemTitle}>{item.title}</span>
                  <span className={styles.itemQty}>
                    осталось {formatQty(remainders[index] ?? 0)} {unitLabel(item.unitId)}
                  </span>
                </div>
                <label className={styles.acceptLabel}>
                  Пришло
                  <input
                    className={styles.acceptInput}
                    inputMode="decimal"
                    value={qty[index] ?? ''}
                    onChange={(e) => {
                      const next = [...qty]
                      next[index] = e.target.value
                      setQty(next)
                    }}
                    aria-label={`Пришло: ${item.title}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>

        <footer className={styles.footer}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className={styles.backBtn} disabled={busy} onClick={fillAll}>
            Весь остаток
          </button>
          <button
            type="button"
            className={styles.acceptConfirmBtn}
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            Принять
          </button>
        </footer>
      </div>
    </div>
  )
}
