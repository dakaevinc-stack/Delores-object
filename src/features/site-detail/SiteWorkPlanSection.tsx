import { useMemo, useState } from 'react'
import { unitLabel } from '../../domain/brigadierReport'
import {
  durationDays,
  formatPeriod,
  formatVolume,
  isItemDeferred,
  isItemScheduled,
  summarizeSectionSchedule,
  summarizeWorkPlan,
  summarizeWorkPlanSection,
  workItemPercent,
  type SectionScheduleHealth,
  type SectionScheduleStatus,
  type WorkPlan,
  type WorkPlanSection,
} from '../../domain/workPlan'
import { CollapseToggle } from './CollapseToggle'
import styles from './SiteWorkPlanSection.module.css'

type Props = {
  plan: WorkPlan
  windowStartIso?: string
  windowEndIso?: string
}

function pluralize(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = Math.abs(n) % 10
  const m100 = Math.abs(n) % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const STATUS_LABEL: Record<SectionScheduleStatus, string> = {
  normal: 'В графике',
  attention: 'Внимание',
  critical: 'Отстаём',
  not_scheduled: 'Без графика',
}

const NUM_FMT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

// Форматтеры дат для «Периода» в шапке плана. Бизнес-формат, в отличие
// от компактного `formatShortDate`, который мы используем в позициях.
const LONG_DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const DAY_MONTH_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
})

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

function fmtLongDate(iso: string | null | undefined): string | null {
  const d = parseIso(iso)
  return d ? LONG_DATE_FMT.format(d) : null
}

/**
 * «17 апреля — 31 августа 2026 г.» — если обе даты в одном году,
 * год выносим в конец. Иначе показываем оба года.
 */
function formatPeriodHumanRu(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string | null {
  const start = parseIso(startIso)
  const end = parseIso(endIso)
  if (!start || !end) {
    return fmtLongDate(startIso) ?? fmtLongDate(endIso)
  }
  if (start.getTime() === end.getTime()) return LONG_DATE_FMT.format(start)
  if (start.getFullYear() === end.getFullYear()) {
    return `${DAY_MONTH_FMT.format(start)} — ${LONG_DATE_FMT.format(end)}`
  }
  return `${LONG_DATE_FMT.format(start)} — ${LONG_DATE_FMT.format(end)}`
}

function fmtSigned(n: number): string {
  if (n === 0) return '0'
  if (n > 0) return `+${NUM_FMT.format(n)}`
  return `−${NUM_FMT.format(Math.abs(n))}`
}

export function SiteWorkPlanSection({
  plan,
  windowStartIso,
  windowEndIso,
}: Props) {
  const summary = useMemo(() => summarizeWorkPlan(plan), [plan])
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Здоровье каждого раздела относительно дневного графика.
  // Сюда складываем общую логику бывшей `SiteWorkCriteriaSection` —
  // теперь она не отдельная секция, а часть шапки раздела плана.
  const healthByNumber = useMemo(() => {
    const map = new Map<string, SectionScheduleHealth>()
    for (const s of plan.sections) {
      map.set(s.number, summarizeSectionSchedule(s, todayIso))
    }
    return map
  }, [plan, todayIso])

  // Распределение разделов по статусам — для пилюль в шапке.
  const healthBuckets = useMemo(() => {
    const buckets: Record<SectionScheduleStatus, number> = {
      normal: 0,
      attention: 0,
      critical: 0,
      not_scheduled: 0,
    }
    for (const h of healthByNumber.values()) buckets[h.status] += 1
    return buckets
  }, [healthByNumber])

  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())
  // Развёрнуто по умолчанию: сводка + задачи + справка план/факт в одном блоке.
  const [expanded, setExpanded] = useState(false)

  const toggleSection = (number: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }

  // Источник правды для «Периода» — официальные сроки объекта
  // (start/end из карточки), а не агрегат самых ранних/поздних дат
  // отдельных позиций. Если сроки не пришли — деградируем к плану.
  const periodStartIso = windowStartIso ?? summary.earliestStartIso
  const periodEndIso = windowEndIso ?? summary.latestEndIso
  const period = formatPeriodHumanRu(periodStartIso, periodEndIso)

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
              План работ
            </h2>
            <CollapseToggle
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              ariaControls="work-plan-body"
              expandedLabel="Свернуть план"
              collapsedLabel="Открыть план"
              className={styles.headToggle}
            />
          </div>

          {!expanded ? (
            <p className={styles.lead}>
              {summary.itemsCount}{' '}
              {pluralize(summary.itemsCount, ['позиция', 'позиции', 'позиций'])}, прогресс{' '}
              {summary.averagePercent.toFixed(1).replace('.', ',')}%. Откройте — сводка и
              справка план/факт.
            </p>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div id="work-plan-body" className={styles.expandedBody}>
          <div className={styles.summaryPanel}>
            <p className={styles.lead}>
              План, факт и отставание по строкам. Задания дня — у бригадира.
            </p>

            <dl className={styles.summary}>
              <div className={styles.summaryItem}>
                <dt className={styles.summaryLabel}>Активных</dt>
                <dd className={styles.summaryValue}>
                  {summary.scheduledCount}
                  <span className={styles.summaryDelta}>/{summary.itemsCount}</span>
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

            <div className={styles.healthRow}>
              {healthBuckets.critical > 0 ? (
                <span className={`${styles.healthPill} ${styles.healthPillCritical}`}>
                  <span className={styles.healthPillDot} aria-hidden />
                  <span className={styles.healthPillCount}>{healthBuckets.critical}</span>
                  <span className={styles.healthPillLabel}>отстают</span>
                </span>
              ) : null}
              {healthBuckets.attention > 0 ? (
                <span className={`${styles.healthPill} ${styles.healthPillAttention}`}>
                  <span className={styles.healthPillDot} aria-hidden />
                  <span className={styles.healthPillCount}>{healthBuckets.attention}</span>
                  <span className={styles.healthPillLabel}>под вниманием</span>
                </span>
              ) : null}
              {healthBuckets.normal > 0 ? (
                <span className={`${styles.healthPill} ${styles.healthPillNormal}`}>
                  <span className={styles.healthPillDot} aria-hidden />
                  <span className={styles.healthPillCount}>{healthBuckets.normal}</span>
                  <span className={styles.healthPillLabel}>в графике</span>
                </span>
              ) : null}
              {healthBuckets.not_scheduled > 0 ? (
                <span className={`${styles.healthPill} ${styles.healthPillMuted}`}>
                  <span className={styles.healthPillDot} aria-hidden />
                  <span className={styles.healthPillCount}>{healthBuckets.not_scheduled}</span>
                  <span className={styles.healthPillLabel}>без графика</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className={styles.registryBlock}>
            <div className={styles.blockLabelRow}>
              <h3 className={styles.blockLabel}>Справка — план и факт</h3>
              <p className={styles.blockHint}>
                Факт — из заданий дня и журнала бригадира
              </p>
            </div>
            <ol className={styles.sections} id="work-plan-sections">
              {plan.sections.map((section) => (
                <SectionCard
                  key={section.number}
                  section={section}
                  health={healthByNumber.get(section.number)}
                  open={openSections.has(section.number)}
                  onToggle={() => toggleSection(section.number)}
                />
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SectionCard({
  section,
  health,
  open,
  onToggle,
}: {
  section: WorkPlanSection
  health: SectionScheduleHealth | undefined
  open: boolean
  onToggle: () => void
}) {
  const summary = useMemo(() => summarizeWorkPlanSection(section), [section])
  const period = formatPeriod(summary.earliestStartIso, summary.latestEndIso)
  const headingId = `work-plan-section-${section.number}`

  // Тон карточки и шкалы — по статусу здоровья.
  // Если health не пришёл (что не должно случаться, но на всякий
  // случай) — деградируем в нейтральный normal.
  const statusKey: SectionScheduleStatus = health?.status ?? 'not_scheduled'
  const tone =
    statusKey === 'normal'
      ? 'normal'
      : statusKey === 'attention'
        ? 'attention'
        : statusKey === 'critical'
          ? 'critical'
          : 'muted'

  // Маркер «где должно быть к сегодня по графику» на шкале раздела —
  // главный визуальный сигнал. Считаем относительно `planUnits`,
  // потому что заливка тоже считается от него (factUnits/planUnits).
  const todayMarkerPercent =
    health && health.planUnits > 0 && health.expectedTodayUnits !== null
      ? Math.max(0, Math.min(100, (health.expectedTodayUnits / health.planUnits) * 100))
      : null

  // Лаг от графика в абсолютных числах для подсказки в шапке.
  const lag =
    health && health.expectedTodayUnits !== null
      ? Math.round(health.factUnits - health.expectedTodayUnits)
      : null

  return (
    <li
      className={`${styles.sectionCard} ${open ? styles.sectionCardOpen : ''} ${styles[`sectionTone_${tone}`]}`}
    >
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
            <span className={`${styles.sectionStatusPill} ${styles[`sectionStatusPill_${tone}`]}`}>
              <span className={styles.sectionStatusDot} aria-hidden />
              {STATUS_LABEL[statusKey]}
            </span>
            <span aria-hidden className={styles.sectionMetaDivider}>
              ·
            </span>
            <span>
              {summary.itemsCount}{' '}
              {pluralize(summary.itemsCount, ['позиция', 'позиции', 'позиций'])}
            </span>
            <span aria-hidden className={styles.sectionMetaDivider}>
              ·
            </span>
            <span>{period}</span>
            {health && lag !== null && lag < 0 && health.unit ? (
              <>
                <span aria-hidden className={styles.sectionMetaDivider}>
                  ·
                </span>
                <span className={styles.sectionMetaLag}>
                  {fmtSigned(lag)} {unitLabel(health.unit)} к графику
                </span>
              </>
            ) : null}
            {summary.deferredCount > 0 ? (
              <>
                <span aria-hidden className={styles.sectionMetaDivider}>
                  ·
                </span>
                <span className={styles.deferredHint}>
                  {summary.deferredCount} без срока
                </span>
              </>
            ) : null}
          </span>

          {/*
           * Тонкая шкала прогресса прямо в шапке раздела с маркером
           * «сегодня» на ней. Это позволяет прорабу видеть здоровье
           * раздела без раскрытия аккордеона.
           */}
          <span className={styles.sectionBar} aria-hidden>
            <span
              className={styles.sectionBarFill}
              style={{ width: `${Math.max(0, Math.min(100, summary.averagePercent))}%` }}
            />
            {todayMarkerPercent !== null ? (
              <span
                className={styles.sectionBarToday}
                style={{ left: `${todayMarkerPercent}%` }}
              />
            ) : null}
          </span>
        </span>
        <span
          className={styles.sectionPercent}
          aria-label={`выполнено ${summary.averagePercent} процентов`}
        >
          {summary.averagePercent.toFixed(0)}
          <span className={styles.sectionPercentSign}>%</span>
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
