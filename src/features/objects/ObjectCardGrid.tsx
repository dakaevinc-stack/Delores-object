import type { ConstructionSite } from '../../types/constructionSite'
import { AddObjectCard } from './AddObjectCard'
import { ObjectCard } from './ObjectCard'
import styles from './ObjectCardGrid.module.css'

type Props = {
  sites: readonly ConstructionSite[]
}

export function ObjectCardGrid({ sites }: Props) {
  if (sites.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <p className={styles.emptyTitle}>Объекты не найдены</p>
        <p className={styles.emptyText}>
          Измените поиск или фильтр по статусу.
        </p>
      </div>
    )
  }

  return (
    <ul className={styles.grid}>
      {sites.map((site) => (
        <li key={site.id} className={styles.item}>
          <ObjectCard site={site} />
        </li>
      ))}
      <li className={styles.item}>
        <AddObjectCard />
      </li>
    </ul>
  )
}
