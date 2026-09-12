import { useMemo, useState, type ReactNode } from 'react'
import type { ProcurementRequest } from '../../domain/procurementRequest'
import {
  budgetHasPlan,
  contractorsFromBudget,
  groupMaterialFacts,
  summarizeMaterialBudget,
  viewBudgetForContractor,
  type MaterialArticleFact,
  type MaterialArticleStatus,
  type MaterialBudget,
} from '../../domain/materialBudget'
import { formatQty, unitLabel } from '../../domain/procurementRequest'
import { CollapseToggle } from './CollapseToggle'
import { useAnchoredExpand } from './useAnchoredExpand'
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

function ArticleRow({
  fact,
  crewLabel,
}: {
  fact: MaterialArticleFact
  crewLabel: string | null
}) {
  const { article, consumed, remaining, percent, status } = fact
  const unit = unitLabel(article.unit)
  const planned = article.planned
  const noPlan = planned == null

  return (
    <li className={`${styles.row} ${styles[`tone_${noPlan ? 'fact' : status}`]}`}>
      <span className={styles.rowDot} aria-hidden />
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <div className={styles.rowIdentity}>
            <span className={styles.rowTitle}>{article.title}</span>
            <span className={styles.rowStatus}>
              {crewLabel
                ? `Факт ${crewLabel}`
                : noPlan
                  ? 'Факт всех бригад'
                  : STATUS_LABEL[status]}
            </span>
          </div>
          <div className={styles.rowFigures}>
            <p className={styles.rowQty}>
              <span className={styles.rowDone}>{formatQty(consumed)}</span>
              {noPlan ? (
                <span className={styles.rowPlan}>{unit}</span>
              ) : (
                <>
                  <span className={styles.rowOf}>из</span>
                  <span className={styles.rowPlan}>
                    {formatQty(planned)} {unit}
                  </span>
                </>
              )}
            </p>
            {noPlan || remaining == null ? (
              <p className={styles.rowRemain}>
                {crewLabel ? 'Только эта бригада на объекте' : 'План в таблице не задан'}
              </p>
            ) : remaining < 0 ? (
              <p className={styles.rowRemain}>
                Перерасход{' '}
                <strong>
                  {formatQty(Math.abs(remaining))} {unit}
                </strong>
              </p>
            ) : (
              <p className={styles.rowRemain}>
                Осталось{' '}
                <strong>
                  {formatQty(remaining)} {unit}
                </strong>
              </p>
            )}
          </div>
        </div>
        {noPlan || percent == null ? null : (
          <div className={styles.rowTrack}>
            <div className={styles.rowBar} aria-hidden>
              <span
                className={styles.rowBarFill}
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
              />
            </div>
            <span className={styles.rowPercent}>{percent.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </li>
  )
}

function MaterialGroup({
  id,
  title,
  defaultOpen = false,
  children,
  className,
}: {
  id: string
  title: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `material-group-${id}`

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
  const { expanded, toggle, anchorRef } = useAnchoredExpand(false)
  const [crewId, setCrewId] = useState<string | null>(null)
  const crews = useMemo(() => contractorsFromBudget(budget), [budget])
  const hasPlan = useMemo(() => budgetHasPlan(budget), [budget])
  const scoped = useMemo(() => viewBudgetForContractor(budget, crewId), [budget, crewId])
  const crewLabel = crews.find((c) => c.contractorId === crewId)?.contractorName ?? null
  const summary = useMemo(
    () => summarizeMaterialBudget(scoped, crewId ? [] : requests),
    [scoped, requests, crewId],
  )
  const groups = useMemo(() => groupMaterialFacts(summary.facts), [summary.facts])

  const selectCrew = (id: string | null) => {
    setCrewId((prev) => (prev === id ? null : id))
  }

  return (
    <section
      ref={anchorRef}
      className={styles.section}
      aria-labelledby="material-spend-heading"
    >
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            Ведомость расхода
          </p>
          <h2 className={styles.title} id="material-spend-heading">
            Расход материала
          </h2>
          <p className={styles.lead}>
            {crewLabel ? `Только ${crewLabel} на этом объекте.` : 'Расход по бригадам объекта.'}
          </p>
        </div>

        <CollapseToggle
          expanded={expanded}
          onToggle={toggle}
          ariaControls="material-spend-body"
          className={styles.headToggle}
        />
      </header>

      {expanded ? (
        <div id="material-spend-body" className={styles.body}>
          <div className={styles.metrics} role="group" aria-label="Сводка по расходу">
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Статей</span>
              <span className={styles.metricValue}>{summary.facts.length}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Бригад</span>
              <span className={styles.metricValue}>{crews.length}</span>
            </div>
            <div className={`${styles.metric} ${hasPlan && summary.overCount ? styles.metricBad : ''}`}>
              <span className={styles.metricLabel}>{hasPlan ? 'Минус' : 'План'}</span>
              <span className={styles.metricValue}>{hasPlan ? summary.overCount : '—'}</span>
            </div>
          </div>

          {crews.length > 0 ? (
            <div className={styles.crewBlock}>
              <p className={styles.crewHint}>
                {crewLabel
                  ? 'Ещё раз по бригаде или «Все» — вернётся сумма по объекту.'
                  : 'Нажмите бригаду — в пунктах ниже останется только её расход.'}
              </p>
              <div className={styles.crewStrip} role="group" aria-label="Бригады на объекте">
                <button
                  type="button"
                  className={styles.crewChip}
                  data-active={crewId == null ? 'true' : 'false'}
                  aria-pressed={crewId == null}
                  onClick={() => setCrewId(null)}
                >
                  Все
                </button>
                {crews.map((crew) => (
                  <button
                    key={crew.contractorId}
                    type="button"
                    className={styles.crewChip}
                    data-active={crewId === crew.contractorId ? 'true' : 'false'}
                    aria-pressed={crewId === crew.contractorId}
                    onClick={() => selectCrew(crew.contractorId)}
                  >
                    {crew.contractorName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {groups.length === 0 ? (
            <p className={styles.emptyCrew}>У этой бригады на объекте нет расхода в ведомости.</p>
          ) : (
            groups.map((g) => (
              <MaterialGroup
                key={`${g.group}-${crewId ?? 'all'}`}
                id={`${g.group}-${crewId ?? 'all'}`}
                title={g.group}
                defaultOpen={crewId != null}
              >
                <ul className={styles.list}>
                  {g.facts.map((fact) => (
                    <ArticleRow key={fact.article.id} fact={fact} crewLabel={crewLabel} />
                  ))}
                </ul>
              </MaterialGroup>
            ))
          )}

          {!crewId && summary.unplanned.length > 0 ? (
            <MaterialGroup id="unplanned" title="Вне сметы" className={styles.unplanned}>
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
