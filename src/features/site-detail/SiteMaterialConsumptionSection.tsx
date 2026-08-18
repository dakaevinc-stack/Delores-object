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
  ok: 'В норме',
  low: 'Мало',
  over: 'В минус',
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

function ArticleRow({ fact }: { fact: MaterialArticleFact }) {
  const { article, consumed, remaining, percent, status } = fact
  const unit = unitLabel(article.unit)
  const remainAbs = Math.abs(remaining)
  return (
    <li className={`${styles.item} ${styles[`tone_${status}`]}`}>
      <div className={styles.itemHead}>
        <h4 className={styles.itemTitle}>{article.title}</h4>
        <span className={`${styles.itemStatus} ${styles[`status_${status}`]}`}>
          {status === 'ok' ? <CheckIcon /> : null}
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className={styles.itemHero}>
        <span className={styles.itemDone}>{formatQty(consumed)}</span>
        <span className={styles.itemSlash}>из</span>
        <span className={styles.itemTotal}>
          {formatQty(article.planned)} {unit}
        </span>
        <span className={styles.itemPercent}>{percent.toFixed(0)}%</span>
      </div>
      <div className={styles.itemBar} aria-hidden>
        <span
          className={styles.itemBarFill}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <p className={styles.itemFoot}>
        {remaining < 0 ? (
          <>
            Перерасход{' '}
            <strong>
              {formatQty(remainAbs)} {unit}
            </strong>
          </>
        ) : (
          <>
            Осталось{' '}
            <strong>
              {formatQty(remaining)} {unit}
            </strong>
          </>
        )}
      </p>
    </li>
  )
}

export function SiteMaterialConsumptionSection({ budget, requests }: Props) {
  const [expanded, setExpanded] = useState(true)
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
            <span>Смета объекта</span>
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
          <p className={styles.lead}>
            Инженер заложил объёмы. Когда бригадир принимает груз, объём сразу
            списывается. Если груз не приняли — смета не трогается. Если приняли
            больше сметы — статья уходит в минус.
          </p>
        </div>
      </div>

      {expanded ? (
        <div id="material-spend-body" className={styles.body}>
          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt>Статей</dt>
              <dd>{summary.facts.length}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>В норме</dt>
              <dd>{summary.okCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>Мало</dt>
              <dd>{summary.lowCount}</dd>
            </div>
            <div className={`${styles.summaryItem} ${summary.overCount ? styles.summaryOver : ''}`}>
              <dt>В минус</dt>
              <dd>{summary.overCount}</dd>
            </div>
          </dl>

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
              <h3 className={styles.groupTitle}>Принято вне сметы</h3>
              <p className={styles.unplannedLead}>
                Эти позиции приняли по заявке, но в смете объекта их нет — расход идёт сверх
                расчёта.
              </p>
              <ul className={styles.unplannedList}>
                {summary.unplanned.map((row) => (
                  <li key={`${row.presetId ?? row.title}-${row.unit}`}>
                    {row.title}: {formatQty(row.qty)} {unitLabel(row.unit)}
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
