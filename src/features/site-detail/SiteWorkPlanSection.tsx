import { useMemo, useState } from 'react'
import { unitLabel } from '../../domain/brigadierReport'
import {
  durationDays,
  formatPeriod,
  formatShortDate,
  formatVolume,
  isItemDeferred,
  isItemScheduled,
  summarizeWorkPlan,
  summarizeWorkPlanSection,
  workItemPercent,
  type WorkPlan,
  type WorkPlanSection,
} from '../../domain/workPlan'
import styles from './SiteWorkPlanSection.module.css'

type Props = {
  plan: WorkPlan
}

function pluralize(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = Math.abs(n) % 10
  const m100 = Math.abs(n) % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function SiteWorkPlanSection({ plan }: Props) {
  const summary = useMemo(() => summarizeWorkPlan(plan), [plan])
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())

  const toggleSection = (number: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }

  const earliest = formatShortDate(summary.earliestStartIso)
  const latest = formatShortDate(summary.latestEndIso)
  const period =
    earliest && latest ? (earliest === latest ? earliest : `${earliest} — ${latest}`) : null

  return (
    <section className={styles.section} aria-labelledby="work-plan-heading">
      <div className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden="true"
            />
            <span>Производственный план</span>
          </p>
          <div className={styles.titleRow}>
            <h2 className={styles.title} id="work-plan-heading">
              План работ по объекту
            </h2>
            <span className={styles.sourceBadge}>
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="4" y="3.5" width="14" height="17" rx="2" />
                <path d="M8 8h6M8 12h6M8 16h4" />
              </svg>
              Справка по объекту
            </span>
          </div>

          <p className={styles.lead}>
            Сводный график проектных работ по объекту «{plan.siteName}» —{' '}
            {summary.sectionsCount}{' '}
            {pluralize(summary.sectionsCount, ['раздел', 'раздела', 'разделов'])} и{' '}
            {summary.itemsCount}{' '}
            {pluralize(summary.itemsCount, ['позиция', 'позиции', 'позиций'])}.{' '}
            Раскройте раздел, чтобы увидеть строки с объёмами, остатками и сроками. Активные
            позиции — те, у которых есть план и/или утверждённые сроки; остальные ждут
            уточнения.
          </p>

          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Активных</dt>
              <dd className={styles.summaryValue}>
                {summary.scheduledCount}
                <span className={styles.summaryDelta}>
                  /{summary.itemsCount}
                </span>
              </dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Завершено</dt>
              <dd className={styles.summaryValue}>{summary.completedCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Без срока</dt>
              <dd className={styles.summaryValue}>{summary.deferredCount}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>Прогресс</dt>
              <dd className={styles.summaryValue}>
                {summary.averagePercent.toFixed(1).replace('.', ',')}%
              </dd>
            </div>
            {period ? (
              <div className={`${styles.summaryItem} ${styles.summaryItemWide}`}>
                <dt className={styles.summaryLabel}>Период</dt>
                <dd className={styles.summaryValue}>{period}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <ol className={styles.sections}>
        {plan.sections.map((section) => (
          <SectionCard
            key={section.number}
            section={section}
            open={openSections.has(section.number)}
            onToggle={() => toggleSection(section.number)}
          />
        ))}
      </ol>
    </section>
  )
}

function SectionCard({
  section,
  open,
  onToggle,
}: {
  section: WorkPlanSection
  open: boolean
  onToggle: () => void
}) {
  const summary = useMemo(() => summarizeWorkPlanSection(section), [section])
  const period = formatPeriod(summary.earliestStartIso, summary.latestEndIso)
  const headingId = `work-plan-section-${section.number}`

  return (
    <li className={`${styles.sectionCard} ${open ? styles.sectionCardOpen : ''}`}>
      <button
        type="button"
        className={styles.sectionHead}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${headingId}-body`}
      >
        <span className={styles.sectionNumber} aria-hidden>
          {section.number}
        </span>
        <span className={styles.sectionTitleWrap}>
          <span className={styles.sectionTitle} id={headingId}>
            {section.title}
          </span>
          <span className={styles.sectionMeta}>
            <span>
              {summary.itemsCount}{' '}
              {pluralize(summary.itemsCount, ['позиция', 'позиции', 'позиций'])}
            </span>
            <span aria-hidden>·</span>
            <span>{period}</span>
            {summary.deferredCount > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className={styles.deferredHint}>
                  {summary.deferredCount} без срока
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span className={styles.sectionPercent} aria-label={`выполнено ${summary.averagePercent}%`}>
          {summary.averagePercent.toFixed(0)}%
        </span>
        <span className={styles.sectionChevron} aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className={styles.sectionBody} id={`${headingId}-body`}>
          <ul className={styles.itemList}>
            {section.items.map((item) => {
              const percent = workItemPercent(item)
              const remainder = Math.max(0, item.total - item.done)
              const scheduled = isItemScheduled(item)
              const deferred = isItemDeferred(item)
              const days = durationDays(item.startIso, item.endIso)
              const period = formatPeriod(item.startIso, item.endIso)
              // Семантика тона:
              // done       — закрыто на 100%, зелёный
              // progress   — что-то сделано, фирменный navy→orange градиент
              // planned    — есть план/сроки, но факт = 0 (синий)
              // deferred   — без сроков и/или без объёма (янтарный/серый)
              const tone =
                percent >= 100
                  ? 'done'
                  : percent > 0
                    ? 'progress'
                    : scheduled
                      ? 'planned'
                      : 'deferred'
              // Текст статуса: бригадиру и прорабу должно быть понятно
              // без объяснения, что произошло с этой позицией.
              const statusLabel =
                tone === 'done'
                  ? 'Готово'
                  : tone === 'progress'
                    ? 'В работе'
                    : tone === 'planned'
                      ? 'Не начато'
                      : item.total === 0
                        ? 'В реестре'
                        : 'Без срока'
              const percentText = percent.toFixed(1).replace('.', ',')
              return (
                <li key={item.number} className={`${styles.itemRow} ${styles[`tone_${tone}`]}`}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemNumber} aria-hidden>
                      {item.number}
                    </span>
                    <h4 className={styles.itemTitle}>{item.title}</h4>
                    <span className={`${styles.itemStatus} ${styles[`status_${tone}`]}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className={styles.itemHero}>
                    <div className={styles.itemHeroFigures}>
                      <span className={styles.itemDone}>{formatVolume(item.done)}</span>
                      <span className={styles.itemSlash}>из</span>
                      <span className={styles.itemTotal}>
                        {formatVolume(item.total)} {unitLabel(item.unit)}
                      </span>
                    </div>
                    <span className={styles.itemPercent} aria-label={`выполнено ${percentText} процентов`}>
                      {percentText}
                      <span className={styles.itemPercentSign}>%</span>
                    </span>
                  </div>

                  <div className={styles.itemBar} aria-hidden>
                    <span
                      className={styles.itemBarFill}
                      style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                    />
                  </div>

                  <div className={styles.itemFoot}>
                    <span className={styles.itemFootDate}>
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="3.5" y="5" width="17" height="15" rx="2" />
                        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
                      </svg>
                      <span>{period}</span>
                      {days != null ? (
                        <span className={styles.itemFootDuration}>
                          · {days} {pluralize(days, ['день', 'дня', 'дней'])}
                        </span>
                      ) : null}
                    </span>
                    {item.total > 0 && remainder > 0 ? (
                      <span className={styles.itemFootRemainder}>
                        Осталось{' '}
                        <strong>
                          {formatVolume(remainder)} {unitLabel(item.unit)}
                        </strong>
                      </span>
                    ) : item.total === 0 ? (
                      <span className={styles.itemFootRemainder}>
                        Объём ещё не определён
                      </span>
                    ) : null}
                  </div>

                  {deferred ? (
                    <div className={styles.itemNote}>
                      {item.total === 0
                        ? 'Позиция в реестре — объём и сроки появятся после уточнения.'
                        : 'Сроки не утверждены — попадёт в график после согласования.'}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </li>
  )
}
