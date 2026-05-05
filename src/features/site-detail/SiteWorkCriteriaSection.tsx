import { useMemo } from 'react'
import { unitLabel } from '../../domain/brigadierReport'
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
} from '../../domain/objectStatus'
import type { SiteDetailCriterion } from '../../domain/siteDetailDashboard'
import {
  summarizeSectionSchedule,
  type SectionScheduleHealth,
  type SectionScheduleStatus,
  type WorkPlan,
} from '../../domain/workPlan'
import styles from './SiteWorkCriteriaSection.module.css'

type Props = {
  /**
   * Реальный план объекта. Если задан — критерии собираются из его
   * разделов: в каждой карточке план/факт суммируются по позициям,
   * а статус считается по отставанию от линейного графика.
   *
   * Если плана нет (старый объект без загруженной справки) — берём
   * `criteria` как fallback, чтобы секция не схлопывалась.
   */
  plan?: WorkPlan | null
  /**
   * Унаследованные «критерии-демо» для объектов без плана.
   * Цифры там — синтетика; не используем их, если есть `plan`.
   */
  criteria: readonly SiteDetailCriterion[]
}

function fmtInt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n))
}

function fmtSigned(n: number) {
  if (n === 0) return '0'
  if (n > 0) return `+${fmtInt(n)}`
  return `−${fmtInt(Math.abs(n))}`
}

const SCHEDULE_STATUS_LABEL: Record<SectionScheduleStatus, string> = {
  normal: 'В графике',
  attention: 'Внимание',
  critical: 'Отстаём',
  not_scheduled: 'Без графика',
}

const SCHEDULE_STATUS_TOKEN: Record<SectionScheduleStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  normal: 'success',
  attention: 'warning',
  critical: 'danger',
  not_scheduled: 'muted',
}

export function SiteWorkCriteriaSection({ plan, criteria }: Props) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const healthCards = useMemo<readonly SectionScheduleHealth[]>(() => {
    if (!plan || plan.sections.length === 0) return []
    return plan.sections.map((s) => summarizeSectionSchedule(s, todayIso))
  }, [plan, todayIso])

  // Для лида: какой раздел давит сильнее всего. Сначала берём
  // critical → attention; если все в норме — берём с минимальным %.
  const worstHealth = useMemo<SectionScheduleHealth | null>(() => {
    if (healthCards.length === 0) return null
    const order: Record<SectionScheduleStatus, number> = {
      critical: 0,
      attention: 1,
      not_scheduled: 2,
      normal: 3,
    }
    const sorted = [...healthCards].sort((a, b) => {
      const bySev = order[a.status] - order[b.status]
      if (bySev !== 0) return bySev
      return a.completionPercent - b.completionPercent
    })
    return sorted[0] ?? null
  }, [healthCards])

  if (healthCards.length > 0) {
    return (
      <section className={styles.section} aria-labelledby="criteria-heading">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="criteria-heading">
            Здоровье объекта по разделам
          </h2>
          <p className={styles.sectionLead}>
            Сводка по разделам производственного плана. Факт обновляется из
            отчётов бригадира автоматически. Сравнение идёт с дневным графиком —
            где отстаём, там «Отстаём».
            {worstHealth ? (
              <>
                {' '}Сейчас сильнее всего давит:{' '}
                <span className={styles.leadEm}>{worstHealth.sectionTitle}</span>{' '}
                — {SCHEDULE_STATUS_LABEL[worstHealth.status].toLowerCase()}.
              </>
            ) : null}
          </p>
        </div>

        <div className={styles.grid}>
          {healthCards.map((h) => {
            const token = SCHEDULE_STATUS_TOKEN[h.status]
            const dataStatus =
              h.status === 'normal'
                ? 'normal'
                : h.status === 'attention'
                  ? 'attention'
                  : h.status === 'critical'
                    ? 'critical'
                    : 'normal'
            const lag =
              h.expectedTodayUnits !== null
                ? Math.round(h.factUnits - h.expectedTodayUnits)
                : null
            const note =
              h.status === 'critical'
                ? 'Серьёзное отставание от дневного графика'
                : h.status === 'attention'
                  ? 'Лёгкое отставание от дневного графика'
                  : h.status === 'normal' && lag !== null && lag > 0
                    ? 'Опережаем график'
                    : h.status === 'not_scheduled'
                      ? 'У позиций раздела не утверждены сроки — график не считаем'
                      : null
            return (
              <article
                key={h.sectionNumber}
                className={styles.card}
                data-status={dataStatus}
              >
                <div className={styles.cardTop}>
                  <div className={styles.nameBlock}>
                    <h3 className={styles.name}>
                      <span className={styles.cardNumber}>{h.sectionNumber}</span>
                      {h.sectionTitle}
                    </h3>
                    <div className={styles.pillRow}>
                      <span className={styles.dot} data-status={token} aria-hidden />
                      <span className={styles.pill}>
                        {SCHEDULE_STATUS_LABEL[h.status]}
                      </span>
                    </div>
                  </div>
                  <div
                    className={styles.pctBlock}
                    aria-label={`Выполнено ${h.completionPercent} процентов`}
                  >
                    <span className={styles.pct}>
                      {h.completionPercent.toFixed(0)}
                    </span>
                    <span className={styles.pctSuffix}>%</span>
                  </div>
                </div>

                {h.unit !== null ? (
                  <div className={styles.stats}>
                    <div>
                      <p className={styles.statLabel}>Сделано</p>
                      <p className={styles.statVal}>
                        {fmtInt(h.factUnits)}{' '}
                        <span className={styles.statUnit}>{unitLabel(h.unit)}</span>
                      </p>
                    </div>
                    <div>
                      <p className={styles.statLabel}>План</p>
                      <p className={styles.statVal}>
                        {fmtInt(h.planUnits)}{' '}
                        <span className={styles.statUnit}>{unitLabel(h.unit)}</span>
                      </p>
                    </div>
                    <div>
                      <p className={styles.statLabel}>К графику</p>
                      <p
                        className={styles.statVal}
                        data-dev={lag === null ? 'zero' : lag < 0 ? 'neg' : lag > 0 ? 'pos' : 'zero'}
                      >
                        {lag === null ? '—' : fmtSigned(lag)}
                        {lag !== null ? (
                          <span className={styles.statUnit}>{unitLabel(h.unit)}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.statsMixed}>
                    <p className={styles.statsMixedNote}>
                      В разделе разные единицы — суммировать корректно нельзя,
                      сверяемся только по проценту выполнения.
                    </p>
                  </div>
                )}

                <div
                  className={styles.meter}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(h.completionPercent)}
                  aria-label={`Прогресс по «${h.sectionTitle}»: ${h.completionPercent.toFixed(0)} процентов`}
                >
                  <span
                    className={styles.meterFill}
                    data-status={token}
                    style={{ width: `${Math.min(100, h.completionPercent)}%` }}
                  />
                  {h.expectedTodayUnits !== null && h.planUnits > 0 ? (
                    // Маркер «где должно быть к сегодня по графику».
                    // Тонкая навигационная риска, чтобы прораб видел,
                    // насколько мы отстаём именно от дневного графика.
                    <span
                      className={styles.meterTarget}
                      style={{
                        left: `${Math.min(
                          100,
                          (h.expectedTodayUnits / h.planUnits) * 100,
                        )}%`,
                      }}
                      aria-hidden
                    />
                  ) : null}
                </div>

                <div className={styles.meterAxis}>
                  <span className={styles.meterAxisLabel}>0</span>
                  {h.expectedTodayUnits !== null && h.planUnits > 0 ? (
                    <span
                      className={styles.meterAxisToday}
                      style={{
                        left: `${Math.min(
                          100,
                          (h.expectedTodayUnits / h.planUnits) * 100,
                        )}%`,
                      }}
                    >
                      сегодня
                    </span>
                  ) : null}
                  <span className={styles.meterAxisLabel}>100%</span>
                </div>

                {note ? <p className={styles.note}>{note}</p> : null}
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  // Fallback: у объекта нет плана — рендерим старые мок-критерии,
  // чтобы секция не была пустой. Это поведение для legacy-объектов
  // и пока их планы ещё не загружены в систему.
  const order = { critical: 0, attention: 1, normal: 2 } as const
  const worst = [...criteria].sort((a, b) => {
    const bySev = order[a.status] - order[b.status]
    if (bySev !== 0) return bySev
    return a.completionPercent - b.completionPercent
  })[0]

  return (
    <section className={styles.section} aria-labelledby="criteria-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="criteria-heading">
          Критерии выполнения работ
        </h2>
        <p className={styles.sectionLead}>
          Демо-направления для объектов без загруженного плана. Когда офис
          добавит производственный план, эта секция перестроится автоматически
          из его разделов.
          {worst ? (
            <>
              {' '}Сейчас сильнее всего давит:{' '}
              <span className={styles.leadEm}>{worst.name}</span> —{' '}
              {SITE_STATUS_LABEL[worst.status].toLowerCase()}.
            </>
          ) : null}
        </p>
      </div>

      <div className={styles.grid}>
        {criteria.map((c) => {
          const token = SITE_STATUS_TOKEN[c.status]
          const dev = c.deviationUnits
          const devStr = dev === 0 ? '0' : dev > 0 ? `+${fmtInt(dev)}` : `${fmtInt(dev)}`

          return (
            <article key={c.id} className={styles.card} data-status={c.status}>
              <div className={styles.cardTop}>
                <div className={styles.nameBlock}>
                  <h3 className={styles.name}>{c.name}</h3>
                  <div className={styles.pillRow}>
                    <span className={styles.dot} data-status={token} aria-hidden />
                    <span className={styles.pill}>{SITE_STATUS_LABEL[c.status]}</span>
                  </div>
                </div>
                <div
                  className={styles.pctBlock}
                  aria-label={`Выполнение ${c.completionPercent} процентов`}
                >
                  <span className={styles.pct}>{c.completionPercent}</span>
                  <span className={styles.pctSuffix}>%</span>
                </div>
              </div>

              <div className={styles.stats}>
                <div>
                  <p className={styles.statLabel}>План</p>
                  <p className={styles.statVal}>{fmtInt(c.planUnits)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Факт</p>
                  <p className={styles.statVal}>{fmtInt(c.factUnits)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Отклонение</p>
                  <p
                    className={styles.statVal}
                    data-dev={dev === 0 ? 'zero' : dev < 0 ? 'neg' : 'pos'}
                  >
                    {devStr}
                  </p>
                </div>
              </div>

              <div
                className={styles.meter}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={c.completionPercent}
                aria-label={`Прогресс по ${c.name}: ${c.completionPercent}%`}
              >
                <span
                  className={styles.meterFill}
                  data-status={token}
                  style={{ width: `${Math.min(100, c.completionPercent)}%` }}
                />
              </div>

              {c.lagReason ? <p className={styles.note}>{c.lagReason}</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
