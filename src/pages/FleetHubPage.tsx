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

function pluralizeClasses(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'класс'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'класса'
  return 'классов'
}

export function FleetHubPage() {
  const { countByCategory, add, ensureCustomCategory, vehicles, categories } =
    useFleetRegistry()
  const [isAdding, setAdding] = useState(false)

  const totalVehicles = vehicles.length
  const totalClasses = categories.length

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.heroGlow} aria-hidden />
        <span className={styles.heroGrid} aria-hidden />
        <span className={styles.heroStripe} aria-hidden />

        <div className={styles.heroTop}>
          <Link className={styles.back} to="/">
            <span className={styles.backArrow} aria-hidden>
              ←
            </span>
            На главный обзор
          </Link>
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

        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Парк техники</p>
            <h1 className={styles.title}>Спецтехника</h1>
            <p className={styles.lead}>
              Выберите класс — откроется парк с госномерами, ТО, страховками и журналом
              ремонтов.
            </p>

            <div className={styles.heroStats} aria-label="Сводка парка">
              <div className={styles.stat}>
                <span className={styles.statValue}>{totalVehicles}</span>
                <span className={styles.statLabel}>{pluralizeUnits(totalVehicles)}</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{totalClasses}</span>
                <span className={styles.statLabel}>{pluralizeClasses(totalClasses)}</span>
              </div>
            </div>
          </div>

          <div className={styles.logoFrame}>
            <span className={styles.logoFrameGlow} aria-hidden />
            <span className={styles.logoFrameRail} aria-hidden />
            <div className={styles.logoPlaque}>
              <img
                className={styles.logoImg}
                src="/brand-logotype.png?v=4"
                alt="Деловые Решения. Когда бизнес — личное."
                width={681}
                height={376}
                decoding="async"
              />
            </div>
          </div>
        </div>
      </header>

      <section className={styles.catalog} aria-labelledby="fleet-classes-heading">
        <div className={styles.catalogHead}>
          <span className={styles.catalogAccent} aria-hidden />
          <div className={styles.catalogHeadText}>
            <p className={styles.catalogKicker}>Каталог</p>
            <h2 className={styles.catalogTitle} id="fleet-classes-heading">
              Классы техники
            </h2>
            <p className={styles.catalogLead}>
              Выберите класс — ниже откроется перечень единиц парка
            </p>
          </div>
          <div className={styles.catalogBadge} aria-label={`${totalClasses} ${pluralizeClasses(totalClasses)}`}>
            <span className={styles.catalogBadgeNum}>{totalClasses}</span>
            <span className={styles.catalogBadgeLabel}>{pluralizeClasses(totalClasses)}</span>
          </div>
        </div>

        <div className={styles.grid}>
          {categories.map((c, index) => {
            const n = countByCategory(c.id)
            const unitWord = pluralizeUnits(n)
            return (
              <Link
                key={c.id}
                className={`${styles.card} ${c.custom ? styles.cardCustom : ''}`}
                to={`/spectehnika/${c.id}`}
                style={{ ['--card-i' as string]: String(index) }}
              >
                <span className={styles.cardIcon} aria-hidden>
                  <FleetCategoryIcon id={c.id} size={30} />
                </span>
                <span className={styles.cardBody}>
                  <span className={styles.cardTitle}>
                    {c.title}
                    {c.custom ? (
                      <span className={styles.cardCustomTag}>свой</span>
                    ) : null}
                  </span>
                  <span className={styles.cardMeta}>
                    <span className={styles.cardCount}>{n}</span>
                    {unitWord}
                  </span>
                </span>
                <span className={styles.cardChevron} aria-hidden>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                    <path
                      d="M7 4l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

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
