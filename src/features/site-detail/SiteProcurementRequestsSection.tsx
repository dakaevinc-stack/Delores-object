import { useMemo, useState } from 'react'
import {
  cargoReceiptPatch,
  formatReceiptStampRu,
  makeAcceptedReceipt,
  type CargoReceipt,
} from '../../domain/cargoReceipt'
import { summarizeProcurementAccounting } from '../../domain/procurementAccounting'
import {
  buildProcurementFileBase,
  canReceiveOnSite,
  canSupplyApprove,
  canSupplyCancel,
  canSupplyEdit,
  downloadTextFile,
  formatQty,
  PROCUREMENT_STATUS_LABELS,
  renderProcurementRequestCsv,
  renderProcurementRequestPlainText,
  unitLabel,
  type ProcurementRequest,
} from '../../domain/procurementRequest'
import type { SiteDeliveryPoint } from '../../domain/siteDeliveryPoint'
import { CargoReceiptSheet } from '../deliveries/CargoReceiptSheet'
import styles from './SiteProcurementRequestsSection.module.css'

type Props = {
  requests: readonly ProcurementRequest[]
  selectedAuthor: string | null
  onSelectAuthor: (name: string | null) => void
  deliveryPoint?: SiteDeliveryPoint | null
  showCreateButton?: boolean
  onCreate: () => void
  onEdit: (req: ProcurementRequest) => void
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

function deliveryPct(requestedQty: number, acceptedQty: number): number {
  if (requestedQty <= 0) return acceptedQty > 0 ? 100 : 0
  return Math.min(100, Math.round((acceptedQty / requestedQty) * 100))
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
  selectedAuthor,
  onSelectAuthor,
  deliveryPoint = null,
  showCreateButton = true,
  onCreate,
  onEdit,
  onRemove,
  onUpdateRequest,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)
  const [refuseId, setRefuseId] = useState<string | null>(null)
  const [showMaterials, setShowMaterials] = useState(false)

  const summary = useMemo(() => summarizeProcurementAccounting(requests), [requests])
  const visible = useMemo(() => {
    if (!selectedAuthor) return requests
    return requests.filter((r) => (r.createdBy.trim() || 'Не указан') === selectedAuthor)
  }, [requests, selectedAuthor])

  const waiting =
    summary.byStatus.pending + summary.byStatus.approved + summary.byStatus.refused
  const refuseReq = refuseId ? requests.find((r) => r.id === refuseId) ?? null : null

  const handleDownloadTxt = (req: ProcurementRequest) => {
    const base = buildProcurementFileBase(req)
    downloadTextFile(
      `${base}.txt`,
      'text/plain;charset=utf-8',
      renderProcurementRequestPlainText(req, deliveryPoint),
    )
  }

  const handleDownloadCsv = (req: ProcurementRequest) => {
    const base = buildProcurementFileBase(req)
    downloadTextFile(
      `${base}.csv`,
      'text/csv;charset=utf-8',
      renderProcurementRequestCsv(req, deliveryPoint),
    )
  }

  const handleCopy = async (req: ProcurementRequest) => {
    const ok = await copyToClipboard(renderProcurementRequestPlainText(req, deliveryPoint))
    if (ok) {
      setCopiedId(req.id)
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === req.id ? null : curr))
      }, 1800)
    }
  }

  const handleShare = async (req: ProcurementRequest) => {
    const text = renderProcurementRequestPlainText(req, deliveryPoint)
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
        <div className={styles.headCopy}>
          <p className={styles.kicker}>
            <span className={styles.kickerMark} aria-hidden />
            Снабжение
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="procurement-heading">
              Заявки
            </h2>
            {showCreateButton ? (
              <button type="button" className={styles.createBtn} onClick={onCreate}>
                Создать
              </button>
            ) : null}
          </div>
        </div>

        {requests.length > 0 ? (
          <dl className={styles.previewStats} aria-label="Сводка по заявкам">
            <div>
              <dt>Всего</dt>
              <dd>{summary.totalRequests}</dd>
            </div>
            <div className={styles.statWait}>
              <dt>Ждут</dt>
              <dd>{waiting}</dd>
            </div>
            <div className={styles.statOk}>
              <dt>На объекте</dt>
              <dd>{summary.byStatus.accepted}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      {requests.length > 0 && (summary.authors.length > 1 || selectedAuthor) ? (
        <div className={styles.filters} role="group" aria-label="Фильтр по заявителю">
          <button
            type="button"
            className={`${styles.chip} ${!selectedAuthor ? styles.chipOn : ''}`}
            aria-pressed={!selectedAuthor}
            onClick={() => onSelectAuthor(null)}
          >
            Все
          </button>
          {summary.authors.map((author) => {
            const on = selectedAuthor === author.name
            return (
              <button
                key={author.name}
                type="button"
                className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                aria-pressed={on}
                onClick={() => onSelectAuthor(on ? null : author.name)}
              >
                {author.name}
                <span className={styles.chipCount}>{author.requestCount}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {requests.length === 0
              ? 'Заявок ещё нет'
              : `Нет заявок от «${selectedAuthor}»`}
          </p>
          {requests.length === 0 ? (
            <p className={styles.emptyText}>Создайте заявку со списком материалов и количеством.</p>
          ) : (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => onSelectAuthor(null)}
            >
              Показать всех
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.list}>
          {visible.map((req) => (
            <li
              key={req.id}
              className={`${styles.card} ${req.urgent ? styles.cardUrgent : ''}`}
            >
              <header className={styles.cardHead}>
                <div className={styles.cardHeadText}>
                  <p className={styles.cardCode}>
                    <span className={styles.cardCodeMark}>№</span>
                    {req.shortCode}
                    {req.urgent ? (
                      <span className={styles.urgentBadge} title="Срочная заявка">
                        Срочно
                      </span>
                    ) : null}
                  </p>
                  <p className={styles.cardMeta}>
                    <time dateTime={req.createdAtIso}>{formatDateTime(req.createdAtIso)}</time>
                    <span className={styles.metaDot} aria-hidden>
                      ·
                    </span>
                    <span className={styles.cardAuthor}>{req.createdBy}</span>
                    {req.neededByIso ? (
                      <>
                        <span className={styles.metaDot} aria-hidden>
                          ·
                        </span>
                        <span>к {formatDateTime(req.neededByIso)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className={`${styles.statusBadge} ${styles[`status_${req.status}`]}`}>
                  {PROCUREMENT_STATUS_LABELS[req.status]}
                </span>
              </header>

              {(canSupplyApprove(req) || canSupplyEdit(req) || canSupplyCancel(req)) && (
                <div className={styles.supplyBar}>
                  {canSupplyApprove(req) ? (
                    <button
                      type="button"
                      className={styles.approveBtn}
                      onClick={() => onUpdateRequest(req.id, { status: 'approved' })}
                    >
                      Согласовать
                    </button>
                  ) : null}
                  {canSupplyEdit(req) ? (
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => onEdit(req)}
                    >
                      Изменить
                    </button>
                  ) : null}
                  {canSupplyCancel(req) ? (
                    <button
                      type="button"
                      className={styles.cancelSupplyBtn}
                      onClick={() =>
                        onUpdateRequest(req.id, { status: 'cancelled', receipt: null })
                      }
                    >
                      Снять
                    </button>
                  ) : null}
                </div>
              )}

              <ul className={styles.lines} aria-label="Позиции заявки">
                {req.items.map((it, i) => (
                  <li key={`${i}-${it.title}`} className={styles.line}>
                    <span className={styles.lineIndex} aria-hidden>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={styles.lineTitle}>{it.title}</span>
                    <span className={styles.lineQty}>
                      {formatQty(it.quantity)}
                      <span className={styles.lineUnit}>{unitLabel(it.unitId)}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {req.note ? (
                <p className={styles.cardNote}>
                  <span className={styles.cardNoteLabel}>Комментарий</span>
                  {req.note}
                </p>
              ) : null}

              {req.unloadPoint ? (
                <p className={styles.cardNote}>
                  <span className={styles.cardNoteLabel}>Разгрузка</span>
                  {req.unloadPoint.address ||
                    `${req.unloadPoint.lat.toFixed(5)}, ${req.unloadPoint.lng.toFixed(5)}`}
                  {req.unloadPoint.hint ? ` · ${req.unloadPoint.hint}` : ''}
                </p>
              ) : null}

              {req.status === 'accepted' ? (
                <div className={styles.receiptBlock}>
                  <p className={styles.acceptedMark}>
                    <span className={styles.acceptedIcon} aria-hidden>
                      ✓
                    </span>
                    Принято
                    {req.receipt
                      ? ` ${formatReceiptStampRu(req.receipt.atIso)}`
                      : ' — объём списан в расход материалов'}
                  </p>
                  {req.receipt?.media && req.receipt.media.length > 0 ? (
                    <ul className={styles.receiptMedia}>
                      {req.receipt.media.map((m) => (
                        <li key={m.id}>
                          {m.kind === 'video' && m.previewUrl ? (
                            <video src={m.previewUrl} muted playsInline controls />
                          ) : m.previewUrl ? (
                            <img src={m.previewUrl} alt="" />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : req.status === 'refused' ? (
                <div className={styles.receiptBlock}>
                  <p className={styles.refusedMark}>
                    Отказано в приёмке
                    {req.receipt ? ` ${formatReceiptStampRu(req.receipt.atIso)}` : ''}
                    {req.receipt?.reason ? `. ${req.receipt.reason}` : ''}
                  </p>
                  {req.receipt?.media && req.receipt.media.length > 0 ? (
                    <ul className={styles.receiptMedia}>
                      {req.receipt.media.map((m) => (
                        <li key={m.id}>
                          {m.kind === 'video' && m.previewUrl ? (
                            <video src={m.previewUrl} muted playsInline controls />
                          ) : m.previewUrl ? (
                            <img src={m.previewUrl} alt="" />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : canReceiveOnSite(req) ? (
                <div className={styles.decide}>
                  <button
                    type="button"
                    className={styles.acceptBtn}
                    onClick={() =>
                      onUpdateRequest(
                        req.id,
                        cargoReceiptPatch(makeAcceptedReceipt(new Date().toISOString())),
                      )
                    }
                  >
                    Принять материал
                  </button>
                  <button
                    type="button"
                    className={styles.refuseBtn}
                    onClick={() => setRefuseId(req.id)}
                  >
                    Отказать в приёмке
                  </button>
                </div>
              ) : null}

              <footer className={styles.cardFooter}>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => handleDownloadTxt(req)}
                  >
                    TXT
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => handleDownloadCsv(req)}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => handleCopy(req)}
                    aria-live="polite"
                  >
                    {copiedId === req.id ? 'Скопировано' : 'Копировать'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => handleShare(req)}
                    aria-live="polite"
                  >
                    {sharedId === req.id ? 'Отправлено' : 'Поделиться'}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => onRemove(req.id)}
                  aria-label={`Удалить заявку № ${req.shortCode}`}
                >
                  Удалить
                </button>
              </footer>
            </li>
          ))}
        </ul>
      )}

      {summary.materials.length > 0 ? (
        <div className={styles.materialsBlock}>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setShowMaterials((v) => !v)}
            aria-expanded={showMaterials}
          >
            {showMaterials ? 'Скрыть сводку материалов' : 'Сводка материалов'}
          </button>
          {showMaterials ? (
            <ul className={styles.materials}>
              {summary.materials.map((m) => {
                const who = [...new Set(m.refs.map((r) => r.createdBy))]
                const pct = deliveryPct(m.requestedQty, m.acceptedQty)
                return (
                  <li key={`${m.title}-${m.unitId}`} className={styles.material}>
                    <div className={styles.materialHead}>
                      <span className={styles.materialName}>{m.title}</span>
                      {m.acceptedQty > 0 ? (
                        <span className={styles.materialPct}>{pct}%</span>
                      ) : null}
                    </div>
                    {m.acceptedQty > 0 ? (
                      <div className={styles.progressTrack} aria-hidden>
                        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                    <p className={styles.materialQty}>
                      {formatQty(m.requestedQty)} {unitLabel(m.unitId)}
                      {m.acceptedQty > 0
                        ? ` · привезли ${formatQty(m.acceptedQty)} ${unitLabel(m.unitId)}`
                        : ''}
                    </p>
                    <p className={styles.materialWho}>{who.join(', ')}</p>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {refuseReq ? (
        <CargoReceiptSheet
          request={refuseReq}
          onClose={() => setRefuseId(null)}
          onSubmit={(receipt: CargoReceipt) => {
            void onUpdateRequest(refuseReq.id, cargoReceiptPatch(receipt))
            setRefuseId(null)
          }}
        />
      ) : null}
    </section>
  )
}
