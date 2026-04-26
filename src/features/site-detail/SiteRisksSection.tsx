import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TOKEN,
} from '../../domain/objectStatus'
import type { SiteRiskCategory, SiteRiskRow } from '../../domain/siteDetailDashboard'
import styles from './SiteRisksSection.module.css'

type Props = {
  risks: readonly SiteRiskRow[]
}

const CATEGORY_LABEL: Record<SiteRiskCategory, string> = {
  critical_notice: 'Критика',
  equipment: 'Техника',
  materials: 'Материалы',
  idle: 'Простой',
  weather: 'Погода',
  breakdown_org: 'Орг. / поломки',
}

export function SiteRisksSection({ risks }: Props) {
  const activeCount = risks.filter((r) => r.active).length

  return (
    <section className={styles.section} aria-labelledby="risks-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="risks-heading">
          Риски и проблемы
        </h2>
        <p className={styles.sectionLead}>
          Активных сигналов: <strong>{activeCount}</strong> из {risks.length}. Пустые
          позиции — зона подключения данных из реестра рисков и технадзора.
        </p>
      </div>

      <ul className={styles.list}>
        {risks.map((r) => {
          const token = SITE_STATUS_TOKEN[r.severity]
          return (
            <li
              key={r.id}
              className={styles.item}
              data-active={r.active ? 'true' : 'false'}
            >
              <div className={styles.itemLeft}>
                <span className={styles.cat}>{CATEGORY_LABEL[r.category]}</span>
                <span className={styles.dot} data-status={token} aria-hidden />
              </div>
              <p className={styles.title}>{r.title}</p>
              <div className={styles.itemRight}>
                <span className={styles.state}>{r.active ? 'Активно' : 'Нет'}</span>
                <span className={styles.sev}>{SITE_STATUS_LABEL[r.severity]}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
