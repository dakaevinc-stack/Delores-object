import type { SiteDetailReporting } from '../../domain/siteDetailDashboard'
import styles from './SiteReportingSection.module.css'

type Props = {
  reporting: SiteDetailReporting
}

function Row({
  label,
  ok,
  okLabel = 'Готово',
  badLabel = 'Нет',
}: {
  label: string
  ok: boolean
  okLabel?: string
  badLabel?: string
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.badge} data-state={ok ? 'ok' : 'bad'}>
        {ok ? okLabel : badLabel}
      </span>
    </div>
  )
}

export function SiteReportingSection({ reporting }: Props) {
  return (
    <section className={styles.section} aria-labelledby="reporting-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="reporting-heading">
          Отчётность
        </h2>
        <p className={styles.sectionLead}>
          Контроль сдачи суточных материалов и пометок с участка.
        </p>
      </div>

      <div className={styles.panel}>
        <Row
          label="Ежедневный отчёт за сегодня"
          ok={reporting.dailyReportSubmitted}
          okLabel="Сдан"
          badLabel="Не сдан"
        />
        <Row label="Фотоотчёт" ok={reporting.photoReportUploaded} okLabel="Загружен" />
        <Row label="Видеоотчёт" ok={reporting.videoReportUploaded} okLabel="Загружен" />
        <Row
          label="Комментарий прораба"
          ok={reporting.foremanCommentPresent}
          okLabel="Есть"
          badLabel="Нет"
        />
        <div className={styles.row}>
          <span className={styles.rowLabel}>Проблемные отметки</span>
          <span className={styles.badge} data-state={reporting.problemFlagsCount === 0 ? 'ok' : 'warn'}>
            {reporting.problemFlagsCount === 0
              ? 'Нет'
              : `${reporting.problemFlagsCount} шт.`}
          </span>
        </div>
      </div>
    </section>
  )
}
