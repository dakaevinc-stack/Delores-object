import { useState } from 'react'
import {
  buildProcurementFileBase,
  downloadTextFile,
  formatQty,
  PROCUREMENT_STATUS_LABELS,
  renderProcurementRequestCsv,
  renderProcurementRequestPlainText,
  unitLabel,
  type ProcurementRequest,
  type ProcurementRequestStatus,
} from '../../domain/procurementRequest'
import styles from './SiteProcurementRequestsSection.module.css'

type Props = {
  requests: readonly ProcurementRequest[]
  /** Если true — данные синхронизируются с сервером (текст подсказки). */
  serverBacked?: boolean
  onCreate: () => void
  onRemove: (id: string) => void | Promise<void>
  onUpdateRequest: (id: string, patch: Partial<ProcurementRequest>) => void | Promise<void>
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fallback ниже */
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

export function SiteProcurementRequestsSection({
  requests,
  serverBacked = false,
  onCreate,
  onRemove,
  onUpdateRequest,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)

  const handleDownloadTxt = (req: ProcurementRequest) => {
    const base = buildProcurementFileBase(req)
    const text = renderProcurementRequestPlainText(req)
    downloadTextFile(`${base}.txt`, 'text/plain;charset=utf-8', text)
  }

  const handleDownloadCsv = (req: ProcurementRequest) => {
    const base = buildProcurementFileBase(req)
    const text = renderProcurementRequestCsv(req)
    downloadTextFile(`${base}.csv`, 'text/csv;charset=utf-8', text)
  }

  const handleCopy = async (req: ProcurementRequest) => {
    const ok = await copyToClipboard(renderProcurementRequestPlainText(req))
    if (ok) {
      setCopiedId(req.id)
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === req.id ? null : curr))
      }, 1800)
    }
  }

  const handleShare = async (req: ProcurementRequest) => {
    const text = renderProcurementRequestPlainText(req)
    const title = `Заявка № ${req.shortCode} — ${req.siteName}`
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text })
        setSharedId(req.id)
        window.setTimeout(() => {
          setSharedId((curr) => (curr === req.id ? null : curr))
        }, 1800)
        return
      }
    } catch {
      /* fallback ниже */
    }
    const ok = await copyToClipboard(text)
    if (ok) {
      setSharedId(req.id)
      window.setTimeout(() => {
        setSharedId((curr) => (curr === req.id ? null : curr))
      }, 1800)
    }
  }

  return (
    <section
      className={styles.section}
      id="site-procurement-requests"
      aria-labelledby="procurement-heading"
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title} id="procurement-heading">
            Заявки снабженцу
          </h2>
          <p className={styles.lead}>
            {serverBacked
              ? 'Заявки сохраняются на сервере (копия дублируется в этом браузере). '
              : 'Заявки сохраняются на этом устройстве. '}
            Статус (в обработке / принято / отказано) отмечает снабжение. Готовый текст — в TXT, CSV
            или «Поделиться».
          </p>
        </div>
        <button type="button" className={styles.createBtn} onClick={onCreate}>
          Создать заявку
        </button>
      </header>

      {requests.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Заявок ещё нет</p>
          <p className={styles.emptyText}>
            Нажмите «Создать заявку», чтобы перечислить материалы и их количество:
            бортовой камень, трубы, песок, асфальт, щебень — или добавить свою позицию.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {requests.map((req) => (
            <li key={req.id} className={styles.card}>
              <header className={styles.cardHead}>
                <div className={styles.cardHeadText}>
                  <p className={styles.cardKicker}>Заявка № {req.shortCode}</p>
                  <p className={styles.cardMeta}>
                    {formatDateTime(req.createdAtIso)} · создал {req.createdBy}
                  </p>
                  <div className={styles.statusRow}>
                    <span
                      className={`${styles.statusBadge} ${styles[`status_${req.status}`]}`}
                      aria-hidden
                    >
                      {PROCUREMENT_STATUS_LABELS[req.status]}
                    </span>
                    {req.urgent ? (
                      <span className={styles.urgentBadge} title="Срочная заявка">
                        Срочно
                      </span>
                    ) : null}
                  </div>
                  <label className={styles.statusLabel} htmlFor={`proc-status-${req.id}`}>
                    Статус для снабжения
                  </label>
                  <select
                    id={`proc-status-${req.id}`}
                    className={styles.statusSelect}
                    value={req.status}
                    onChange={(e) =>
                      onUpdateRequest(req.id, {
                        status: e.target.value as ProcurementRequestStatus,
                      })
                    }
                  >
                    {(Object.keys(PROCUREMENT_STATUS_LABELS) as ProcurementRequestStatus[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {PROCUREMENT_STATUS_LABELS[s]}
                        </option>
                      ),
                    )}
                  </select>
                  {req.neededByIso ? (
                    <p className={styles.needBy}>
                      <span className={styles.needByLabel}>Нужно к: </span>
                      {formatDateTime(req.neededByIso)}
                    </p>
                  ) : null}
                </div>
                <div className={styles.cardCount}>
                  <span className={styles.cardCountLabel}>Позиций</span>
                  <span className={styles.cardCountValue}>{req.items.length}</span>
                </div>
              </header>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.colN}>№</th>
                      <th className={styles.colTitle}>Материал</th>
                      <th className={styles.colQty}>Кол-во</th>
                      <th className={styles.colUnit}>Ед.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.items.map((it, i) => (
                      <tr key={`${i}-${it.title}`}>
                        <td className={styles.colN}>{i + 1}</td>
                        <td className={styles.colTitle}>{it.title}</td>
                        <td className={styles.colQty}>{formatQty(it.quantity)}</td>
                        <td className={styles.colUnit}>{unitLabel(it.unitId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {req.note ? (
                <p className={styles.cardNote}>
                  <span className={styles.cardNoteLabel}>Комментарий: </span>
                  {req.note}
                </p>
              ) : null}

              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleDownloadTxt(req)}
                >
                  Скачать TXT
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleDownloadCsv(req)}
                >
                  Скачать CSV
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleCopy(req)}
                  aria-live="polite"
                >
                  {copiedId === req.id ? 'Скопировано ✓' : 'Скопировать текст'}
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleShare(req)}
                  aria-live="polite"
                >
                  {sharedId === req.id ? 'Отправлено ✓' : 'Поделиться'}
                </button>
                <button
                  type="button"
                  className={styles.actionBtnDanger}
                  onClick={() => onRemove(req.id)}
                  aria-label={`Удалить заявку № ${req.shortCode}`}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
