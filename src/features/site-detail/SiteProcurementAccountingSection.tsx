import { useMemo, useState } from 'react'
import { formatQty, unitLabel, type ProcurementRequest } from '../../domain/procurementRequest'
import { summarizeProcurementAccounting } from '../../domain/procurementAccounting'
import styles from './SiteProcurementAccountingSection.module.css'

type Props = {
  requests: readonly ProcurementRequest[]
  selectedAuthor: string | null
  onSelectAuthor: (name: string | null) => void
}

const STATUS_SIMPLE: Record<string, string> = {
  pending: 'ждёт',
  approved: 'едет',
  accepted: 'привезли',
  rejected: 'не согласовали',
  refused: 'не приняли',
  cancelled: 'сняли',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function deliveryPct(requestedQty: number, acceptedQty: number): number {
  if (requestedQty <= 0) return acceptedQty > 0 ? 100 : 0
  return Math.min(100, Math.round((acceptedQty / requestedQty) * 100))
}

function requestWord(count: number): string {
  if (count === 1) return 'заявка'
  if (count >= 2 && count <= 4) return 'заявки'
  return 'заявок'
}

const GLYPH = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function StatTotalIcon() {
  return (
    <svg {...GLYPH}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </svg>
  )
}

function StatWaitingIcon() {
  return (
    <svg {...GLYPH}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75V12l2.75 2.75" />
    </svg>
  )
}

function StatDoneIcon() {
  return (
    <svg {...GLYPH}>
      <path d="M4 8.5 12 4l8 4.5v8L12 21 4 16.5v-8Z" />
      <path d="M12 4v17" />
      <path d="M4 8.5 12 13l8-4.5" />
      <path d="M9.25 12.5 10.75 14 14.25 10" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M5.25 3.5 9.25 7l-4 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckBadgeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.25 7.1 5.8 9.6 10.75 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SiteProcurementAccountingSection({
  requests,
  selectedAuthor,
  onSelectAuthor,
}: Props) {
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  const summary = useMemo(() => summarizeProcurementAccounting(requests), [requests])

  if (requests.length === 0) return null

  const waiting =
    summary.byStatus.pending + summary.byStatus.approved + summary.byStatus.refused

  return (
    <section className={styles.section} aria-labelledby="procurement-accounting-heading">
      <header className={styles.head}>
        <p className={styles.kicker}>
          <span className={styles.kickerMark} aria-hidden />
          Учёт заявок
        </p>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title} id="procurement-accounting-heading">
              Кто что заказал
            </h2>
            <p className={styles.lead}>
              Нажмите на имя — ниже останутся только его заявки.
            </p>
          </div>
          {selectedAuthor ? (
            <button type="button" className={styles.clearBtn} onClick={() => onSelectAuthor(null)}>
              Показать всех
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.stats}>
        <div className={`${styles.stat} ${styles.stat_total}`}>
          <span className={`${styles.statIcon} ${styles.statIcon_total}`}>
            <StatTotalIcon />
          </span>
          <span className={styles.statLabel}>Всего</span>
          <span className={styles.statValue}>{summary.totalRequests}</span>
        </div>
        <div className={`${styles.stat} ${styles.stat_waiting}`}>
          <span className={`${styles.statIcon} ${styles.statIcon_waiting}`}>
            <StatWaitingIcon />
          </span>
          <span className={styles.statLabel}>Ждут</span>
          <span className={styles.statValue}>{waiting}</span>
        </div>
        <div className={`${styles.stat} ${styles.stat_done}`}>
          <span className={`${styles.statIcon} ${styles.statIcon_done}`}>
            <StatDoneIcon />
          </span>
          <span className={styles.statLabel}>На объекте</span>
          <span className={styles.statValue}>{summary.byStatus.accepted}</span>
        </div>
      </div>

      <p className={styles.peopleLabel}>По людям</p>
      <ul className={styles.people}>
        {summary.authors.map((author) => {
          const on = selectedAuthor === author.name
          return (
            <li key={author.name}>
              <button
                type="button"
                className={`${styles.person} ${on ? styles.personOn : ''}`}
                onClick={() => onSelectAuthor(on ? null : author.name)}
                aria-pressed={on}
              >
                <div className={styles.personTop}>
                  <span className={styles.avatar} aria-hidden>
                    {initials(author.name)}
                  </span>
                  <div className={styles.personInfo}>
                    <span className={styles.personName}>{author.name}</span>
                    <span className={styles.personMeta}>
                      {author.requestCount} {requestWord(author.requestCount)}
                    </span>
                  </div>
                  <span className={styles.personBadge} aria-hidden>
                    {on ? <CheckBadgeIcon /> : <ChevronRightIcon />}
                  </span>
                </div>
                <ul className={styles.items}>
                  {author.materials.map((m) => {
                    const pct = deliveryPct(m.requestedQty, m.acceptedQty)
                    return (
                      <li key={`${m.title}-${m.unitId}`} className={styles.item}>
                        <div className={styles.itemHead}>
                          <span className={styles.itemName}>{m.title}</span>
                          {m.acceptedQty > 0 ? (
                            <span
                              className={`${styles.itemPct} ${pct >= 100 ? styles.itemPctDone : ''}`}
                            >
                              {pct}%
                            </span>
                          ) : null}
                        </div>
                        {m.acceptedQty > 0 ? (
                          <div className={styles.progressTrack} aria-hidden>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : (
                          <div className={styles.progressTrack} aria-hidden>
                            <div className={`${styles.progressFill} ${styles.progressFillNone}`} />
                          </div>
                        )}
                        <div className={styles.itemQty}>
                          <span className={styles.qtyChip}>
                            заказал {formatQty(m.requestedQty)} {unitLabel(m.unitId)}
                          </span>
                          {m.acceptedQty > 0 ? (
                            <span className={`${styles.qtyChip} ${styles.qtyChipOk}`}>
                              привезли {formatQty(m.acceptedQty)} {unitLabel(m.unitId)}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </button>
            </li>
          )
        })}
      </ul>

      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => setShowAllMaterials((v) => !v)}
          aria-expanded={showAllMaterials}
        >
          {showAllMaterials ? 'Скрыть общий список' : 'Показать всё, что заказали на объекте'}
        </button>

        {showAllMaterials ? (
          <ul className={styles.materials}>
            {summary.materials.map((m) => {
              const who = [...new Set(m.refs.map((r) => r.createdBy))]
              const pct = deliveryPct(m.requestedQty, m.acceptedQty)
              return (
                <li key={`${m.title}-${m.unitId}`} className={styles.material}>
                  <p className={styles.materialName}>{m.title}</p>
                  {m.acceptedQty > 0 ? (
                    <div className={styles.progressTrack} aria-hidden>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <p className={styles.materialQty}>
                    Заказали: {formatQty(m.requestedQty)} {unitLabel(m.unitId)}
                    {m.acceptedQty > 0 ? (
                      <>
                        {' '}
                        · Привезли: {formatQty(m.acceptedQty)} {unitLabel(m.unitId)}
                      </>
                    ) : null}
                  </p>
                  <p className={styles.materialWho}>Кто: {who.join(', ')}</p>
                </li>
              )
            })}
          </ul>
        ) : null}

        <details className={styles.history}>
          <summary>
            Все заявки по порядку ({summary.totalRequests})
            <span className={styles.historyChevron} aria-hidden>
              <ChevronDownIcon />
            </span>
          </summary>
          <ul className={styles.historyList}>
            {[...requests]
              .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
              .map((req) => (
                <li key={req.id} className={styles.historyRow}>
                  <span className={styles.historyCode}>№{req.shortCode}</span>
                  <span className={styles.historyWho}>{req.createdBy}</span>
                  <span className={`${styles.historyStatus} ${styles[`historyStatus_${req.status}`] ?? ''}`}>
                    {STATUS_SIMPLE[req.status] ?? req.status}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      </div>
    </section>
  )
}
