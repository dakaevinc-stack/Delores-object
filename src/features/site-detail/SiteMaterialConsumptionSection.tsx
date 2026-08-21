import { useMemo, useState } from 'react'
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
  ok: 'Норма',
  low: 'Мало',
  over: 'Минус',
}

function ArticleRow({ fact }: { fact: MaterialArticleFact }) {
  const { article, consumed, remaining, percent, status } = fact
  const unit = unitLabel(article.unit)
  const remainAbs = Math.abs(remaining)
  const barPct = Math.max(0, Math.min(100, percent))

  return (
    <li className={`${styles.row} ${styles[`tone_${status}`]}`}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{article.title}</span>
        <span className={`${styles.rowStatus} ${styles[`status_${status}`]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className={styles.rowQty} aria-label={`${formatQty(consumed)} из ${formatQty(article.planned)} ${unit}`}>
        <strong>{formatQty(consumed)}</strong>
        <span className={styles.rowSlash}>/</span>
        <span>
          {formatQty(article.planned)} {unit}
        </span>
      </div>
      <div className={styles.rowBar} aria-hidden>
        <span className={styles.rowBarFill} style={{ width: `${barPct}%` }} />
      </div>
      <div className={styles.rowMeta}>
        <span className={styles.rowPercent}>{percent.toFixed(0)}%</span>
        <span className={styles.rowRemain}>
          {remaining < 0 ? (
            <>
              −{formatQty(remainAbs)} {unit}
            </>
          ) : (
            <>
              ост. {formatQty(remaining)} {unit}
            </>
          )}
        </span>
      </div>
    </li>
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
      <div className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            <span>Смета</span>
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
          <p className={styles.lead}>Списание при приёмке. Перерасход — в минус.</p>
        </div>
      </div>

      {expanded ? (
        <div id="material-spend-body" className={styles.body}>
          <div className={styles.summary} role="group" aria-label="Сводка по смете">
            <span className={styles.summaryChip}>
              Статей <strong>{summary.facts.length}</strong>
            </span>
            <span className={styles.summaryChip}>
              Норма <strong>{summary.okCount}</strong>
            </span>
            <span className={`${styles.summaryChip} ${summary.lowCount ? styles.summaryWarn : ''}`}>
              Мало <strong>{summary.lowCount}</strong>
            </span>
            <span className={`${styles.summaryChip} ${summary.overCount ? styles.summaryBad : ''}`}>
              Минус <strong>{summary.overCount}</strong>
            </span>
          </div>

          {groups.map((g) => (
            <div key={g.group} className={styles.group}>
              <h3 className={styles.groupTitle}>{g.group}</h3>
              <ul className={styles.list}>
                {g.facts.map((fact) => (
                  <ArticleRow key={fact.article.id} fact={fact} />
                ))}
              </ul>
            </div>
          ))}

          {summary.unplanned.length > 0 ? (
            <div className={styles.unplanned}>
              <h3 className={styles.groupTitle}>Вне сметы</h3>
              <ul className={styles.unplannedList}>
                {summary.unplanned.map((row) => (
                  <li key={`${row.presetId ?? row.title}-${row.unit}`}>
                    {row.title}
                    <span>
                      {formatQty(row.qty)} {unitLabel(row.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
