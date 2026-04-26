import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  costBreakdown,
  daysUntil,
  formatRub,
  insuranceUrgency,
  type FleetVehicle,
} from '../domain/fleet'
import { FleetCategoryIcon } from '../features/fleet/FleetCategoryIcon'
import { FleetAddVehicleModal } from '../features/fleet/FleetAddVehicleModal'
import { useFleetRegistry } from '../features/fleet/useFleetRegistry'
import styles from './FleetCategoryPage.module.css'

type StatusFilter = 'all' | 'open-repair' | 'maintenance-soon' | 'insurance-critical' | 'ok'
type SortKey = 'plate' | 'cost-desc' | 'cost-asc' | 'maintenance'

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'open-repair', label: 'Активные ремонты' },
  { id: 'maintenance-soon', label: 'ТО ≤ 14 дней' },
  { id: 'insurance-critical', label: 'Страховка истекает' },
  { id: 'ok', label: 'Всё в норме' },
]

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'plate', label: 'По госномеру' },
  { id: 'cost-desc', label: 'Расходы: больше → меньше' },
  { id: 'cost-asc', label: 'Расходы: меньше → больше' },
  { id: 'maintenance', label: 'Ближе к ТО' },
]

function normalize(q: string) {
  return q.trim().toLocaleLowerCase('ru-RU')
}

function vehicleMatchesQuery(v: FleetVehicle, q: string): boolean {
  if (!q) return true
  const nq = normalize(q)
  return (
    v.plate.toLocaleLowerCase('ru-RU').includes(nq) ||
    v.vinOrFrame.toLocaleLowerCase('ru-RU').includes(nq) ||
    v.model.toLocaleLowerCase('ru-RU').includes(nq)
  )
}

function vehiclePassesStatus(v: FleetVehicle, f: StatusFilter): boolean {
  if (f === 'all') return true
  const hasOpen = v.repairs.some((r) => r.open)
  const insU = insuranceUrgency(v.insurance.validUntilIso)
  const nextTO = v.maintenance.nextDueDateIso
    ? daysUntil(v.maintenance.nextDueDateIso)
    : Number.POSITIVE_INFINITY
  switch (f) {
    case 'open-repair':
      return hasOpen
    case 'maintenance-soon':
      return nextTO <= 14
    case 'insurance-critical':
      return insU === 'critical' || insU === 'expired'
    case 'ok':
      return !hasOpen && nextTO > 14 && insU !== 'critical' && insU !== 'expired'
  }
}

function sortVehicles(list: FleetVehicle[], key: SortKey): FleetVehicle[] {
  const copy = [...list]
  switch (key) {
    case 'cost-desc':
      return copy.sort((a, b) => costBreakdown(b).totalRub - costBreakdown(a).totalRub)
    case 'cost-asc':
      return copy.sort((a, b) => costBreakdown(a).totalRub - costBreakdown(b).totalRub)
    case 'maintenance':
      return copy.sort((a, b) => {
        const da = a.maintenance.nextDueDateIso
          ? daysUntil(a.maintenance.nextDueDateIso)
          : Number.POSITIVE_INFINITY
        const db = b.maintenance.nextDueDateIso
          ? daysUntil(b.maintenance.nextDueDateIso)
          : Number.POSITIVE_INFINITY
        return da - db
      })
    case 'plate':
    default:
      return copy.sort((a, b) => a.plate.localeCompare(b.plate, 'ru-RU'))
  }
}

export function FleetCategoryPage() {
  const { categoryId = '' } = useParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('plate')
  const [isAdding, setAdding] = useState(false)

  const {
    vehiclesByCategory,
    countByCategory,
    add,
    remove,
    getCategory,
    ensureCustomCategory,
    categories,
  } = useFleetRegistry()
  const cat = getCategory(categoryId)
  const isValid = !!cat
  const vehicles: FleetVehicle[] = useMemo(
    () => (isValid ? vehiclesByCategory(categoryId) : []),
    [isValid, categoryId, vehiclesByCategory],
  )

  const handleRemove = (v: FleetVehicle) => {
    const confirmMsg = `Удалить ${v.plate} (${v.model}) из парка?\n\nЭто действие можно обратить через «Сброс» в браузере.`
    if (window.confirm(confirmMsg)) {
      remove(v.id)
    }
  }

  const filtered = useMemo(() => {
    const withText = vehicles.filter((v) => vehicleMatchesQuery(v, query))
    const withStatus = withText.filter((v) => vehiclePassesStatus(v, status))
    return sortVehicles(withStatus, sort)
  }, [vehicles, query, status, sort])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, v) => {
        const b = costBreakdown(v)
        acc.total += b.totalRub
        acc.repairs += b.repairsTotalRub
        acc.to += b.maintenanceYtdRub
        acc.ins += b.insuranceAnnualRub
        return acc
      },
      { total: 0, repairs: 0, to: 0, ins: 0 },
    )
  }, [filtered])

  if (!isValid || !cat) {
    return <Navigate to="/spectehnika" replace />
  }

  const resetFilters = () => {
    setQuery('')
    setStatus('all')
    setSort('plate')
  }
  const hasFilters = query !== '' || status !== 'all' || sort !== 'plate'

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Навигация">
        <Link to="/">Главная</Link>
        <span>/</span>
        <Link to="/spectehnika">Спецтехника</Link>
        <span>/</span>
        <span>{cat.shortTitle}</span>
      </nav>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{cat.title}</h1>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setAdding(true)}
          aria-label="Добавить технику в этот класс"
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
          <span>Добавить</span>
        </button>
      </div>
      <p className={styles.lead}>
        {filtered.length === vehicles.length
          ? `Всего в классе: ${vehicles.length}. Выберите единицу для карточки, ТО, страховки и журнала ремонтов.`
          : `Показано ${filtered.length} из ${vehicles.length}. Снимите фильтры, чтобы увидеть весь класс.`}
      </p>

      {/* Переключатель видов техники: быстрый прыжок в соседнюю категорию */}
      <div className={styles.chips} role="tablist" aria-label="Виды техники">
        {categories.map((c) => {
          const active = c.id === categoryId
          return (
            <Link
              key={c.id}
              to={`/spectehnika/${c.id}`}
              className={`${styles.chip} ${active ? styles.chipActive : ''} ${c.custom ? styles.chipCustom : ''}`}
              aria-current={active ? 'page' : undefined}
              role="tab"
              aria-selected={active}
            >
              <span className={styles.chipIcon} aria-hidden>
                <FleetCategoryIcon id={c.id} size={16} />
              </span>
              <span className={styles.chipLabel}>{c.shortTitle}</span>
              <span className={styles.chipCount}>{countByCategory(c.id)}</span>
            </Link>
          )
        })}
      </div>

      {/* Панель фильтров: поиск, статус, сортировка */}
      <div className={styles.filters}>
        <label className={styles.search}>
          <span className={styles.searchIcon} aria-hidden>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path d="m14 14 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Госномер, модель или VIN"
            aria-label="Поиск по единицам"
          />
          {query ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
            >
              ×
            </button>
          ) : null}
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>Статус</span>
          <select
            className={styles.select}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>Сортировка</span>
          <select
            className={styles.select}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {hasFilters ? (
          <button type="button" className={styles.reset} onClick={resetFilters}>
            Сбросить фильтры
          </button>
        ) : null}
      </div>

      {/* Сводка расходов по выбранной выборке */}
      {filtered.length > 0 ? (
        <dl className={styles.totals}>
          <div className={styles.totalsItem}>
            <dt>Ремонты</dt>
            <dd>{formatRub(totals.repairs)}</dd>
          </div>
          <div className={styles.totalsItem}>
            <dt>ТО (YTD)</dt>
            <dd>{formatRub(totals.to)}</dd>
          </div>
          <div className={styles.totalsItem}>
            <dt>Страховка</dt>
            <dd>{formatRub(totals.ins)}</dd>
          </div>
          <div className={`${styles.totalsItem} ${styles.totalsItemSum}`}>
            <dt>Итого по выборке</dt>
            <dd>{formatRub(totals.total)}</dd>
          </div>
        </dl>
      ) : null}

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {vehicles.length === 0
              ? 'В этом классе пока нет техники.'
              : 'Под заданные фильтры ничего не подошло. Попробуйте сбросить или изменить условия.'}
          </p>
          {vehicles.length === 0 ? (
            <button type="button" className={styles.emptyCta} onClick={() => setAdding(true)}>
              <span className={styles.emptyCtaIcon} aria-hidden>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                  <path
                    d="M10 4v12M4 10h12"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              Добавить первую единицу
            </button>
          ) : null}
        </div>
      ) : (
        <ul className={styles.list}>
          {filtered.map((v) => {
            const b = costBreakdown(v)
            const hasOpen = v.repairs.some((r) => r.open)
            const insU = insuranceUrgency(v.insurance.validUntilIso)
            const nextTO = v.maintenance.nextDueDateIso
              ? daysUntil(v.maintenance.nextDueDateIso)
              : null
            return (
              <li key={v.id} className={styles.listItem}>
                <Link className={styles.row} to={`/spectehnika/unit/${v.id}`}>
                  <span className={styles.plate}>{v.plate}</span>
                  <span className={styles.vin}>{v.vinOrFrame}</span>
                  <span className={styles.model}>{v.model}</span>
                  <span className={styles.badges}>
                    {hasOpen ? <span className={`${styles.badge} ${styles.badgeWarn}`}>Ремонт</span> : null}
                    {nextTO != null && nextTO <= 14 ? (
                      <span className={`${styles.badge} ${styles.badgeAmber}`}>
                        ТО {nextTO < 0 ? 'просрочено' : `через ${nextTO} дн.`}
                      </span>
                    ) : null}
                    {insU === 'critical' || insU === 'expired' ? (
                      <span className={`${styles.badge} ${styles.badgeWarn}`}>
                        {insU === 'expired' ? 'Страховка просрочена' : 'Страховка истекает'}
                      </span>
                    ) : null}
                    {!hasOpen && insU !== 'critical' && insU !== 'expired' && (nextTO ?? 999) > 14 ? (
                      <span className={`${styles.badge} ${styles.badgeOk}`}>В норме</span>
                    ) : null}
                  </span>
                  <span className={styles.cost}>
                    <span className={styles.costValue}>{formatRub(b.totalRub)}</span>
                    <span className={styles.costMeta}>расход всего</span>
                  </span>
                </Link>
                <button
                  type="button"
                  className={styles.rowRemove}
                  onClick={() => handleRemove(v)}
                  aria-label={`Удалить ${v.plate} из парка`}
                  title="Удалить из парка"
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                    <path
                      d="M4 6h12M8 3h4a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1zm-2 3v9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {isValid && cat ? (
        <FleetAddVehicleModal
          open={isAdding}
          onClose={() => setAdding(false)}
          onCreate={(v, customTitle) => {
            if (customTitle) {
              const created = ensureCustomCategory(customTitle)
              add({ ...v, categoryId: created.id })
            } else {
              add(v)
            }
          }}
          lockedCategory={cat}
        />
      ) : null}
    </div>
  )
}
