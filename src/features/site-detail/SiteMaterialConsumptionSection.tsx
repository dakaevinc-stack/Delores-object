import { useMemo, useState, type ReactNode } from 'react'
import type { ProcurementRequest } from '../../domain/procurementRequest'
import {
  groupMaterialFacts,
  summarizeMaterialBudget,
  type MaterialArticleFact,
  type MaterialArticleStatus,
  type MaterialBudget,
} from '../../domain/materialBudget'
import { formatQty, unitLabel } from '../../domain/procurementRequest'
import { CollapseToggle } from './CollapseToggle'
import styles from './SiteMaterialConsumptionSection.module.css'

type Props = {
  budget: MaterialBudget
  requests: readonly ProcurementRequest[]
}

const STATUS_LABEL: Record<MaterialArticleStatus, string> = {
  ok: 'В норме',
  low: 'Мало',
  over: 'В минус',
}

function ArticleRow({ fact }: { fact: MaterialArticleFact }) {
  const { article, consumed, remaining, percent, status } = fact
  const unit = unitLabel(article.unit)
  const remainAbs = Math.abs(remaining)
  const barPct = Math.max(0, Math.min(100, percent))

  return (
    <li className={`${styles.row} ${styles[`tone_${status}`]}`}>
      <span className={styles.rowDot} aria-hidden />
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <div className={styles.rowIdentity}>
            <span className={styles.rowTitle}>{article.title}</span>
            <span className={styles.rowStatus}>{STATUS_LABEL[status]}</span>
          </div>
          <div className={styles.rowFigures}>
            <p className={styles.rowQty}>
              <span className={styles.rowDone}>{formatQty(consumed)}</span>
              <span className={styles.rowOf}>из</span>
              <span className={styles.rowPlan}>
                {formatQty(article.planned)} {unit}
              </span>
            </p>
            <p className={styles.rowRemain}>
              {remaining < 0 ? (
                <>
                  Перерасход <strong>{formatQty(remainAbs)} {unit}</strong>
                </>
              ) : (
                <>
                  Осталось <strong>{formatQty(remaining)} {unit}</strong>
                </>
              )}
            </p>
          </div>
        </div>
        <div className={styles.rowTrack}>
          <div className={styles.rowBar} aria-hidden>
            <span className={styles.rowBarFill} style={{ width: `${barPct}%` }} />
          </div>
          <span className={styles.rowPercent}>{percent.toFixed(0)}%</span>
        </div>
      </div>
    </li>
  )
}

function MaterialGroup({
  id,
  title,
  count,
  defaultOpen = false,
  children,
  className,
}: {
  id: string
  title: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `material-group-${id}`
  const countLabel = count === 1 ? '1 позиция' : `${count} позиций`

  return (
    <div className={className ?? styles.group}>
      <button
        type="button"
        className={`${styles.groupHead} ${open ? styles.groupHeadOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <h3 className={styles.groupTitle}>{title}</h3>
        <span className={styles.groupCount} title={countLabel}>
          {count}
        </span>
        <span className={styles.groupRail} aria-hidden />
        <span className={styles.groupChevron} aria-hidden>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={panelId} className={styles.groupPanel}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function SiteMaterialConsumptionSection({ budget, requests }: Props) {
  const [expanded, setExpanded] = useState(false)
  const summary = useMemo(
    () => summarizeMaterialBudget(budget, requests),
    [budget, requests],
  )
  const groups = useMemo(() => groupMaterialFacts(summary.facts), [summary.facts])

  return (
    <section className={styles.section} aria-labelledby="material-spend-heading">
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            Смета объекта
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="material-spend-heading">
              Расход материала
            </h2>
            <CollapseToggle
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              ariaControls="material-spend-body"
              expandedLabel="Свернуть расход"
              collapsedLabel="Открыть расход"
              className={styles.headToggle}
            />
          </div>
          <p className={styles.lead}>Списание при приёмке. Перерасход уходит в минус.</p>
        </div>

        {!expanded ? (
          <dl className={styles.previewStats} aria-hidden>
            <div>
              <dt>Статей</dt>
              <dd>{summary.facts.length}</dd>
            </div>
            <div>
              <dt>Норма</dt>
              <dd>{summary.okCount}</dd>
            </div>
            <div className={summary.overCount ? styles.statBad : undefined}>
              <dt>Минус</dt>
              <dd>{summary.overCount}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      {expanded ? (
        <div id="material-spend-body" className={styles.body}>
          <div className={styles.metrics} role="group" aria-label="Сводка по смете">
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Статей</span>
              <span className={styles.metricValue}>{summary.facts.length}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>В норме</span>
              <span className={styles.metricValue}>{summary.okCount}</span>
            </div>
            <div className={`${styles.metric} ${summary.lowCount ? styles.metricWarn : ''}`}>
              <span className={styles.metricLabel}>Мало</span>
              <span className={styles.metricValue}>{summary.lowCount}</span>
            </div>
            <div className={`${styles.metric} ${summary.overCount ? styles.metricBad : ''}`}>
              <span className={styles.metricLabel}>В минус</span>
              <span className={styles.metricValue}>{summary.overCount}</span>
            </div>
          </div>

          {groups.map((g) => (
            <MaterialGroup
              key={g.group}
              id={g.group}
              title={g.group}
              count={g.facts.length}
            >
              <ul className={styles.list}>
                {g.facts.map((fact) => (
                  <ArticleRow key={fact.article.id} fact={fact} />
                ))}
              </ul>
            </MaterialGroup>
          ))}

          {summary.unplanned.length > 0 ? (
            <MaterialGroup
              id="unplanned"
              title="Вне сметы"
              count={summary.unplanned.length}
              className={styles.unplanned}
            >
              <ul className={styles.unplannedList}>
                {summary.unplanned.map((row) => (
                  <li key={`${row.presetId ?? row.title}-${row.unit}`}>
                    <span>{row.title}</span>
                    <strong>
                      {formatQty(row.qty)} {unitLabel(row.unit)}
                    </strong>
                  </li>
                ))}
              </ul>
            </MaterialGroup>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
