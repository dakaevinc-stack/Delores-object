import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { resolveSiteStatus } from '../domain/objectStatus'
import { ObjectCardGrid } from '../features/objects/ObjectCardGrid'
import { ObjectSearch } from '../features/objects/ObjectSearch'
import {
  ObjectStatusFilter,
  type StatusFilterValue,
} from '../features/objects/ObjectStatusFilter'
import { useAllSites } from '../lib/useAllSites'
import styles from './ObjectsHubPage.module.css'

function pluralizeObjects(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'объект'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'объекта'
  return 'объектов'
}

function normalizeQuery(q: string) {
  return q.trim().toLocaleLowerCase('ru-RU')
}

export function ObjectsHubPage() {
  const sites = useAllSites()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilterValue>('all')

  const filtered = useMemo(() => {
    const nq = normalizeQuery(query)
    return sites.filter((site) => {
      if (status !== 'all' && resolveSiteStatus(site) !== status) return false
      if (!nq) return true
      return site.name.toLocaleLowerCase('ru-RU').includes(nq)
    })
  }, [query, status, sites])

  const counts = useMemo(() => {
    let normal = 0
    let watch = 0
    for (const site of sites) {
      const s = resolveSiteStatus(site)
      if (s === 'normal') normal += 1
      else watch += 1
    }
    return { total: sites.length, normal, watch }
  }, [sites])

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
            На главную
          </Link>
        </div>

        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Строительные объекты</p>
            <h1 className={styles.title}>Объекты</h1>
            <p className={styles.lead}>
              Сроки, материалы и ход работ по каждой площадке.
            </p>

            <div className={styles.heroStats} aria-label="Сводка по объектам">
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.total}</span>
                <span className={styles.statLabel}>{pluralizeObjects(counts.total)}</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.normal}</span>
                <span className={styles.statLabel}>в норме</span>
              </div>
              <span className={styles.statDivider} aria-hidden />
              <div className={styles.stat}>
                <span className={styles.statValue}>{counts.watch}</span>
                <span className={styles.statLabel}>на контроле</span>
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

      <section className={styles.panel} aria-label="Список объектов">
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <p className={styles.panelKicker}>Каталог</p>
            <h2 className={styles.panelTitle}>Список объектов</h2>
          </div>
          <div className={styles.panelBadge} aria-hidden>
            <span className={styles.panelBadgeNum}>{filtered.length}</span>
            <span className={styles.panelBadgeLabel}>
              {pluralizeObjects(filtered.length)}
            </span>
          </div>
        </div>

        <div className={styles.toolbar} aria-label="Поиск и фильтры по списку">
          <ObjectSearch value={query} onChange={setQuery} />
          <ObjectStatusFilter value={status} onChange={setStatus} />
        </div>

        <ObjectCardGrid
          sites={filtered}
          filteredEmpty={sites.length > 0 && filtered.length === 0}
        />
      </section>
    </div>
  )
}
