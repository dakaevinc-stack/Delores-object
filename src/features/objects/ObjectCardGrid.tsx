import type { ConstructionSite } from '../../types/constructionSite'
import { AddObjectCard } from './AddObjectCard'
import { ObjectCard } from './ObjectCard'
import styles from './ObjectCardGrid.module.css'

type Props = {
  sites: readonly ConstructionSite[]
  /** true — фильтр/поиск отсекли всё; false — объектов ещё нет вообще */
  filteredEmpty?: boolean
}

export function ObjectCardGrid({ sites, filteredEmpty = false }: Props) {
  if (sites.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.empty} role="status">
          <div className={styles.emptyInner}>
            <p className={styles.emptyTitle}>
              {filteredEmpty ? 'Ничего не найдено' : 'Объектов пока нет'}
            </p>
            <p className={styles.emptyText}>
              {filteredEmpty
                ? 'Сбросьте поиск или фильтр статуса'
                : 'Нажмите +, чтобы создать объект'}
            </p>
          </div>
        </div>
        {!filteredEmpty ? (
          <ul className={styles.grid}>
            <li className={styles.item}>
              <AddObjectCard />
            </li>
          </ul>
        ) : null}
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
