import { brigadierProblemKindLabel, type BrigadierStoredReport } from '../../domain/brigadierReport'
import { FieldReportCard } from './FieldReportCard'
import styles from './SiteBrigadierSubmittedSection.module.css'

type Props = {
  siteName: string
  reports: readonly BrigadierStoredReport[]
  serverBacked?: boolean
  onRemoveReport: (id: string) => void | Promise<void>
}

export function SiteBrigadierSubmittedReportsSection({
  siteName,
  reports,
  serverBacked = false,
  onRemoveReport,
}: Props) {
  return (
    <section className={styles.section} aria-labelledby="brigadier-submitted-heading">
      <div className={styles.head}>
        <h2 className={styles.title} id="brigadier-submitted-heading">
          Отчёты бригадира
        </h2>
        <p className={styles.lead}>
          {serverBacked ? (
            <>
              Фото, видео, комментарии и проблемы сохраняются на сервере; в браузере остаётся копия
              для просмотра без сети.
            </>
          ) : (
            <>
              Фото, видео, комментарии и проблемы сохраняются на этом устройстве (браузер). После
              подключения API записи синхронизируются между сотрудниками.
            </>
          )}
        </p>
      </div>

      {reports.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Пока нет отчётов</p>
          <p className={styles.emptyText}>
            На объекте «{siteName}» нажмите «Ввод отчёта» выше — можно отправить только текст и
            вложения, без таблицы работ.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {reports.map((r) => (
            <div key={r.id} className={styles.reportBlock}>
              <FieldReportCard
                accent="brigadier"
                badgeKicker="Отчёт"
                badge="Бригадир"
                dateTimeIso={r.reportedAtIso}
                lines={r.lines}
                narrativeComment={r.comment}
                chips={[{ id: 'p', text: `Ответственный: ${r.responsible}`, tone: 'muted' }]}
                problems={r.problems.map((p) => ({
                  kindLabel: brigadierProblemKindLabel(p.kindId),
                  details: p.details,
                }))}
                attachments={r.attachments}
              />
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => onRemoveReport(r.id)}
              >
                Удалить с этого устройства
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
