import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAllSites } from '../lib/useAllSites'
import { completionPercent, countSitesByStatus } from '../domain/executiveDashboard'
import { ExecutiveAnalyticsSection } from '../features/dashboard/ExecutiveAnalyticsSection'
import { ExecutiveKpiStrip } from '../features/dashboard/ExecutiveKpiStrip'
import { ObjectCardGrid } from '../features/objects/ObjectCardGrid'
import { ObjectSearch } from '../features/objects/ObjectSearch'
import {
  ObjectStatusFilter,
  type StatusFilterValue,
} from '../features/objects/ObjectStatusFilter'
import { resolveSiteStatus } from '../domain/objectStatus'
import { useFleetRegistry } from '../features/fleet/useFleetRegistry'
import styles from './HomePage.module.css'

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

function normalizeQuery(q: string) {
  return q.trim().toLocaleLowerCase('ru-RU')
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1)
}

function InspectionAdminCardBody({ interactive }: { interactive: boolean }) {
  return (
    <>
      <span className={styles.inspectionAdminGlow} aria-hidden />
      <span className={styles.inspectionAdminIcon} aria-hidden>
        <span className={styles.inspectionAdminIconHalo} aria-hidden />
        <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
          <path
            d="M10 6h12v22H10V6z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.15"
          />
          <path d="M12 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" />
          <path d="M10 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M13 17h2M13 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className={styles.inspectionAdminText}>
        <span className={styles.inspectionAdminKicker}>
          <span className={styles.inspectionAdminKickerBar} aria-hidden />
          Веб-панель
        </span>
        <span className={styles.inspectionAdminTitle}>Приём и учёт спецтехники</span>
        <span className={styles.inspectionAdminLead}>
          Поиск и просмотр актов приёмки: фото, чек-листы, история и решения механиков. Отдельная панель
          Streamlit (репозиторий приёмки через Telegram).
        </span>
        <ul className={styles.inspectionAdminTags} aria-label="Разделы панели">
          <li>
            <span className={styles.inspectionAdminTagDot} aria-hidden />
            Отчёты
          </li>
          <li>
            <span className={styles.inspectionAdminTagDot} aria-hidden />
            Фото
          </li>
          <li>
            <span className={styles.inspectionAdminTagDot} aria-hidden />
            Аналитика
          </li>
        </ul>
      </span>
      {interactive ? (
        <span className={styles.inspectionAdminCta} aria-hidden>
          <span className={styles.inspectionAdminCtaLabel}>Открыть панель</span>
          <span className={styles.inspectionAdminCtaArrow}>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
              <path
                d="M4 10h11M10 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      ) : (
        <p className={styles.inspectionAdminFoot}>
          {import.meta.env.DEV
            ? 'Укажите VITE_AMEDA_INSPECTION_DASHBOARD_URL (URL запущенного streamlit run admin_dashboard.py).'
            : 'Ссылка на панель задаётся при сборке или на сервере. Обратитесь к администратору.'}
        </p>
      )}
    </>
  )
}

const inspectionDashboardUrl = (
  import.meta.env.VITE_AMEDA_INSPECTION_DASHBOARD_URL as string | undefined
)?.trim()

export function HomePage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilterValue>('all')
  const sites = useAllSites()
  const { vehicles: fleetVehicles, categories: fleetCategories } = useFleetRegistry()
  const fleetUnits = fleetVehicles.length
  const fleetClasses = fleetCategories.length

  const portfolioCounts = useMemo(() => countSitesByStatus(sites), [sites])

  const averageCompletion = useMemo(() => {
    if (sites.length === 0) return 0
    const sum = sites.reduce((acc, site) => acc + completionPercent(site), 0)
    return Math.round(sum / sites.length)
  }, [sites])

  const filtered = useMemo(() => {
    const nq = normalizeQuery(query)
    return sites.filter((site) => {
      if (status !== 'all' && resolveSiteStatus(site) !== status) return false
      if (!nq) return true
      return site.name.toLocaleLowerCase('ru-RU').includes(nq)
    })
  }, [query, status, sites])

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <span className={styles.mastheadStripe} aria-hidden />

          <div className={styles.brandCell}>
            <img
              className={styles.brandLogo}
              src="/delovye-resheniya-logo.png"
              alt="Деловые Решения. Когда бизнес — личное."
              width={1024}
              height={1024}
              decoding="async"
              fetchPriority="high"
            />
          </div>

          <div className={styles.intro}>
            <p className={styles.kicker}>
              <img
                className={styles.kickerMark}
                src="/brand-chevron.svg"
                alt=""
                aria-hidden="true"
              />
              <span>Управленческий обзор</span>
            </p>
            <h1 className={styles.title}>Деловые Решения</h1>
            <p className={styles.lead}>
              Видеть всё. Понимать сразу. Решать на фактах.
            </p>

            <dl className={styles.metaStrip}>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <svg
                    className={styles.metaIcon}
                    viewBox="0 0 20 20"
                    aria-hidden
                    focusable="false"
                  >
                    <rect
                      x="3.5"
                      y="5"
                      width="13"
                      height="11"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M3.5 8.5h13M7 3.5v3M13 3.5v3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Сегодня</span>
                </dt>
                <dd className={styles.metaValue}>
                  {new Date().toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: 'long',
                  })}
                </dd>
                <div className={styles.metaMeta}>
                  <span className={styles.metaMetaText}>
                    {capitalize(
                      new Date().toLocaleDateString('ru-RU', { weekday: 'long' }),
                    )}
                    <span className={styles.metaMetaDot} aria-hidden>·</span>
                    {new Date().getFullYear()}
                  </span>
                </div>
              </div>

              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <svg
                    className={styles.metaIcon}
                    viewBox="0 0 20 20"
                    aria-hidden
                    focusable="false"
                  >
                    <path
                      d="M4 17V7.5L10 4l6 3.5V17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 17h12M8 17v-5h4v5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Объектов в работе</span>
                </dt>
                <dd className={styles.metaValue}>{portfolioCounts.all}</dd>
                <div className={styles.metaMeta}>
                  <span className={styles.metaMetaText}>
                    активные стройплощадки
                  </span>
                </div>
              </div>

              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <svg
                    className={styles.metaIcon}
                    viewBox="0 0 20 20"
                    aria-hidden
                    focusable="false"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="7"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.3"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M10 3a7 7 0 0 1 0 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Среднее выполнение</span>
                </dt>
                <dd className={styles.metaValue}>
                  {averageCompletion}
                  <span className={styles.metaValueUnit}>%</span>
                </dd>
                <div
                  className={styles.metaMeta}
                  role="img"
                  aria-label={`Прогресс портфеля: ${averageCompletion} процентов`}
                >
                  <span className={styles.metaProgress} aria-hidden>
                    <span
                      className={styles.metaProgressFill}
                      style={{
                        width: `${Math.max(0, Math.min(100, averageCompletion))}%`,
                      }}
                    />
                  </span>
                </div>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <div className={styles.fleetHubRow}>
        <div className={styles.fleetHubMain}>
          <div className={styles.fleetEntry}>
            <Link className={styles.fleetEntryLink} to="/spectehnika" aria-label="Открыть парк техники">
              <span className={styles.fleetEntryGlow} aria-hidden />
              <span className={styles.fleetEntryIcon} aria-hidden>
                <span className={styles.fleetEntryIconHalo} aria-hidden />
                {/* Силуэт фронтального погрузчика — читается как «строительная техника» без подписи */}
                <svg viewBox="0 0 48 32" width="46" height="30" fill="none">
                  <path
                    d="M6 22h32a3 3 0 0 0 3-3v-2h-9l-2-4h-9a5 5 0 0 0-5 5v4z"
                    fill="currentColor"
                    opacity="0.95"
                  />
                  <path
                    d="M30 13l-13-5-2 4"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.95"
                  />
                  <path
                    d="M14 10l-4 2"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    opacity="0.78"
                  />
                  <circle cx="13" cy="25" r="4" fill="currentColor" />
                  <circle cx="33" cy="25" r="4" fill="currentColor" />
                  <circle cx="13" cy="25" r="1.4" fill="#0b1a33" />
                  <circle cx="33" cy="25" r="1.4" fill="#0b1a33" />
                </svg>
              </span>
              <span className={styles.fleetEntryText}>
                <span className={styles.fleetEntryKicker}>
                  <span className={styles.fleetEntryKickerBar} aria-hidden />
                  Парк техники
                </span>
                <span className={styles.fleetEntryTitleRow}>
                  <span className={styles.fleetEntryTitle}>Спецтехника</span>
                  <span
                    className={styles.fleetEntryStat}
                    aria-label={`${fleetUnits} ${pluralizeUnits(fleetUnits)}, ${fleetClasses} ${pluralizeClasses(fleetClasses)}`}
                  >
                    <span className={styles.fleetEntryStatNum}>{fleetUnits}</span>
                    <span className={styles.fleetEntryStatLabel}>{pluralizeUnits(fleetUnits)}</span>
                    <span className={styles.fleetEntryStatSep} aria-hidden>
                      ·
                    </span>
                    <span className={styles.fleetEntryStatNum}>{fleetClasses}</span>
                    <span className={styles.fleetEntryStatLabel}>{pluralizeClasses(fleetClasses)}</span>
                  </span>
                </span>
                <span className={styles.fleetEntryLead}>
                  Каждая единица техники — под рукой. Один клик до ТО, страховки и журнала ремонтов.
                </span>
                <ul className={styles.fleetEntryFeatures} aria-label="Что внутри раздела">
                  <li>
                    <span className={styles.fleetEntryFeatureDot} aria-hidden />
                    ТО
                  </li>
                  <li>
                    <span className={styles.fleetEntryFeatureDot} aria-hidden />
                    Страховки
                  </li>
                  <li>
                    <span className={styles.fleetEntryFeatureDot} aria-hidden />
                    Пропуска
                  </li>
                  <li>
                    <span className={styles.fleetEntryFeatureDot} aria-hidden />
                    Ремонты
                  </li>
                  <li>
                    <span className={styles.fleetEntryFeatureDot} aria-hidden />
                    Расходы
                  </li>
                </ul>
              </span>
              <span className={styles.fleetEntryCta} aria-hidden>
                <span className={styles.fleetEntryCtaLabel}>Открыть</span>
                <span className={styles.fleetEntryCtaArrow}>
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                    <path
                      d="M4 10h11M10 5l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </span>
            </Link>
          </div>
        </div>

        <aside className={styles.fleetHubAside} aria-label="Приём и учёт спецтехники">
          {inspectionDashboardUrl ? (
            <a
              className={styles.inspectionAdminLink}
              href={inspectionDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Открыть панель приёма и учёта спецтехники в новой вкладке"
            >
              <InspectionAdminCardBody interactive />
            </a>
          ) : (
            <div
              className={`${styles.inspectionAdminLink} ${styles.inspectionAdminLink_static}`}
              role="note"
            >
              <InspectionAdminCardBody interactive={false} />
            </div>
          )}
        </aside>
      </div>

      <ExecutiveKpiStrip counts={portfolioCounts} />

      <section className={styles.objectsSection} aria-labelledby="objects-heading">
        <div className={styles.objectsHead}>
          <h2 className={styles.objectsTitle} id="objects-heading">
            Действующие объекты
          </h2>
        </div>

        <div className={styles.toolbar} aria-label="Поиск и фильтры по списку">
          <ObjectSearch value={query} onChange={setQuery} />
          <ObjectStatusFilter value={status} onChange={setStatus} />
        </div>

        <ObjectCardGrid sites={filtered} />
      </section>

      <ExecutiveAnalyticsSection sites={sites} counts={portfolioCounts} />
    </div>
  )
}
