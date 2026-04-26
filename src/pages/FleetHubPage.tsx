import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FleetCategoryIcon } from '../features/fleet/FleetCategoryIcon'
import { FleetAddVehicleModal } from '../features/fleet/FleetAddVehicleModal'
import { useFleetRegistry } from '../features/fleet/useFleetRegistry'
import styles from './FleetHubPage.module.css'

function pluralizeUnits(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'единица'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'единицы'
  return 'единиц'
}

export function FleetHubPage() {
  const { countByCategory, add, ensureCustomCategory, vehicles, categories } = useFleetRegistry()
  const [isAdding, setAdding] = useState(false)

  const totalVehicles = vehicles.length

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link className={styles.back} to="/">
          ← На главный обзор
        </Link>
      </div>

      <header className={styles.head}>
        <div className={styles.headTopRow}>
          <div className={styles.headText}>
            <p className={styles.kicker}>Парк техники</p>
            <h1 className={styles.title}>Спецтехника</h1>
          </div>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setAdding(true)}
            aria-label="Добавить технику в парк"
          >
            <span className={styles.addBtnIcon} aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                <path
                  d="M10 4v12M4 10h12"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className={styles.addBtnLabel}>Добавить технику</span>
          </button>
        </div>
        <p className={styles.lead}>
          Выберите класс техники, затем единицу парка: госномер, VIN, ТО, страховка, пропуска и
          журнал ремонтов. Схема подсвечивает узлы по активным неисправностям (демо).
        </p>
        <dl className={styles.summary}>
          <div className={styles.summaryItem}>
            <dt>Классов техники</dt>
            <dd>{categories.length}</dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Единиц в парке</dt>
            <dd>{totalVehicles}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.grid}>
        {categories.map((c) => {
          const n = countByCategory(c.id)
          const unitWord = pluralizeUnits(n)
          return (
            <Link
              key={c.id}
              className={`${styles.card} ${c.custom ? styles.cardCustom : ''}`}
              to={`/spectehnika/${c.id}`}
            >
              <span className={styles.cardIcon} aria-hidden>
                <FleetCategoryIcon id={c.id} size={28} />
              </span>
              <span className={styles.cardBody}>
                <span className={styles.cardTitle}>
                  {c.title}
                  {c.custom ? <span className={styles.cardCustomTag}>свой</span> : null}
                </span>
                <span className={styles.cardMeta}>
                  {n} {unitWord}
                </span>
              </span>
              <span className={styles.cardChevron} aria-hidden>
                →
              </span>
            </Link>
          )
        })}
      </div>

      <FleetAddVehicleModal
        open={isAdding}
        onClose={() => setAdding(false)}
        onCreate={(v, customTitle) => {
          if (customTitle) {
            const cat = ensureCustomCategory(customTitle)
            add({ ...v, categoryId: cat.id })
          } else {
            add(v)
          }
        }}
      />
    </div>
  )
}
