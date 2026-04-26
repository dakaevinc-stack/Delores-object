import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
} from '../../domain/objectStatus'
import type { SiteDetailKpis } from '../../domain/siteDetailDashboard'
import styles from './SiteDetailKpiGrid.module.css'

type Props = {
  kpis: SiteDetailKpis
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function SiteDetailKpiGrid({ kpis }: Props) {
  const dev = kpis.deviationPoints
  const devLabel =
    dev > 0 ? `−${dev} п.п.` : dev === 0 ? '0 п.п.' : `+${-dev} п.п.`
  const devTone = dev >= 5 ? 'bad' : dev >= 2 ? 'warn' : 'ok'
  const token = SITE_STATUS_TOKEN[kpis.deadlineStatus]

  return (
    <section className={styles.section} aria-labelledby="site-kpi-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="site-kpi-heading">
          Ключевые показатели
        </h2>
        <p className={styles.sectionLead}>
          План и факт на текущую дату, сроки и концентрация внимания.
        </p>
      </div>
      <div className={styles.grid}>
        <article className={styles.card} data-accent="strong">
          <p className={styles.label}>Выполнение</p>
          <p className={styles.value}>{kpis.completionPercent}%</p>
          <p className={styles.hint}>факт по объекту</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>План на дату</p>
          <p className={styles.value}>{kpis.planToDatePercent}%</p>
          <p className={styles.hint}>целевой прогресс</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>Факт на дату</p>
          <p className={styles.value}>{kpis.factToDatePercent}%</p>
          <p className={styles.hint}>фактический прогресс</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>Отклонение</p>
          <p className={styles.value} data-tone={devTone}>
            {devLabel}
          </p>
          <p className={styles.hint}>план минус факт</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>Старт работ</p>
          <p className={styles.valueSm}>{fmtDate(kpis.startDateIso)}</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>Завершение</p>
          <p className={styles.valueSm}>{fmtDate(kpis.endDateIso)}</p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>До завершения</p>
          <p className={styles.value}>
            {kpis.daysToCompletion}{' '}
            <span className={styles.unit}>
              {kpis.daysToCompletion === 1
                ? 'день'
                : kpis.daysToCompletion < 5
                  ? 'дня'
                  : 'дней'}
            </span>
          </p>
        </article>
        <article className={styles.card}>
          <p className={styles.label}>Замечаний / рисков</p>
          <p className={styles.value}>{kpis.openIssuesCount}</p>
          <p className={styles.hint}>в работе у руководства</p>
        </article>
        <article className={styles.card} data-accent="deadline">
          <p className={styles.label}>Сроки</p>
          <div className={styles.deadlineRow}>
            <span className={styles.dot} data-status={token} aria-hidden />
            <p className={styles.valueSm}>{kpis.deadlineLabel}</p>
          </div>
          <p className={styles.hint}>{SITE_STATUS_LABEL[kpis.deadlineStatus]}</p>
        </article>
      </div>
    </section>
  )
}
