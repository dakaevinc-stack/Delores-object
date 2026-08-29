import { Navigate } from 'react-router-dom'
import { HubCard } from '../features/home/HubCard'
import { MastheadSignIn } from '../features/home/MastheadSignIn'
import { useLocalSession } from '../lib/useLocalSession'
import { homeShowsHubs } from '../domain/sitePageZone'
import styles from './HomePage.module.css'

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1)
}

const FLEET_ICON = (
  <svg
    viewBox="0 0 48 32"
    width="36"
    height="24"
    fill="none"
    aria-hidden
    focusable="false"
  >
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
)

const INSPECTION_ICON = (
  <svg
    viewBox="0 0 32 32"
    width="30"
    height="30"
    fill="none"
    aria-hidden
    focusable="false"
  >
    <rect
      x="7"
      y="6"
      width="18"
      height="23"
      rx="3.5"
      fill="currentColor"
      fillOpacity="0.16"
    />
    <rect
      x="7"
      y="6"
      width="18"
      height="23"
      rx="3.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M13 6V5a3 3 0 0 1 6 0v1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M11.5 14.5l1.8 1.8 3.2-3.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.5 22l1.8 1.8 3.2-3.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 15h2.5M19 22.5h2.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const OBJECTS_ICON = (
  <svg
    viewBox="0 0 32 32"
    width="30"
    height="30"
    fill="none"
    aria-hidden
    focusable="false"
  >
    <path
      d="M6 26V12l10-6 10 6v14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M12 26v-8h8v8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M11 14h2M19 14h2M11 18h2M19 18h2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

const inspectionDashboardUrl = (
  import.meta.env.VITE_AMEDA_INSPECTION_DASHBOARD_URL as string | undefined
)?.trim()

if (import.meta.env.DEV && !inspectionDashboardUrl) {
  // Имя переменной — информация для разработчика, в интерфейсе её быть не должно.
  console.warn(
    '[HomePage] VITE_AMEDA_INSPECTION_DASHBOARD_URL не задан: карточка веб-панели показана без ссылки. Укажите URL запущенного `streamlit run admin_dashboard.py`.',
  )
}

export function HomePage() {
  const session = useLocalSession()

  const showHubs = session?.duty ? homeShowsHubs(session.duty) : false

  const todayDate = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
  const todayWeekday = capitalize(
    new Date().toLocaleDateString('ru-RU', { weekday: 'long' }),
  )

  if (session?.duty === 'driver') {
    return <Navigate to="/driver" replace />
  }

  return (
    <div className={[styles.page, session ? null : styles.pageGuest].filter(Boolean).join(' ')}>
      <h1 className={styles.srOnly}>
        {session ? 'Управленческий обзор' : 'Вход в систему'}
      </h1>

      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <span className={styles.mastheadStripe} aria-hidden />
          <span className={styles.mastheadSpecular} aria-hidden />
          <span className={styles.mastheadCaustic} aria-hidden />
          <span className={styles.mastheadCausticAlt} aria-hidden />

          <div className={styles.brandAuth}>
            <div className={styles.brandCell}>
              <img
                className={styles.brandLogo}
                src="/brand-logotype.png?v=4"
                alt="Деловые Решения. Когда бизнес — личное."
                width={681}
                height={376}
                decoding="async"
                fetchPriority="high"
              />
            </div>

            <div className={styles.mastheadToday} aria-label="Сегодняшняя дата">
              <span className={styles.todayRail} aria-hidden />
              <div className={styles.todayGlass}>
                <span className={styles.todayRim} aria-hidden />
                <span className={styles.todaySpecular} aria-hidden />
                <span className={styles.todayCaustic} aria-hidden />
                <div className={styles.todayCore}>
                  <span className={styles.todayLabel}>Сегодня</span>
                  <span className={styles.todayValue}>{todayDate}</span>
                  <span className={styles.todayMeta}>{todayWeekday}</span>
                </div>
              </div>
              <span className={styles.todayRail} aria-hidden />
            </div>

            <MastheadSignIn className={styles.signIn} />
          </div>
        </div>
      </header>

      {session ? (
        <div className={styles.hubRow} data-count={showHubs ? 3 : 1}>
          {showHubs ? (
            <>
              <HubCard
                to="/spectehnika"
                ariaLabel="Открыть парк техники"
                title="Спецтехника"
                lead="Карточки техники, сроки документов и ремонты."
                tone="fleet"
                icon={FLEET_ICON}
                tags={['ТО', 'Страховки', 'Пропуска', 'Ремонты', 'Расходы']}
                cta="Открыть"
              />

              <HubCard
                href={inspectionDashboardUrl || undefined}
                ariaLabel="Открыть панель приёмки техники в новой вкладке"
                title="Приёмка техники"
                lead="Приёмка, фиксация и контроль техники."
                tone="inspect"
                icon={INSPECTION_ICON}
                tags={['Чек-листы', 'Фото', 'История', 'Решения', 'Отчёты']}
                cta="Открыть"
                unavailableReason="Панель пока не подключена — обратитесь к администратору."
              />
            </>
          ) : null}

          <HubCard
            to="/objects"
            ariaLabel="Открыть список объектов"
            title="Объекты"
            lead="Сроки, материалы и ход работ по каждой площадке."
            tone="sites"
            icon={OBJECTS_ICON}
            tags={['Поиск', 'Статус', 'Прогресс', 'Сроки', 'План']}
            cta="Открыть"
          />
        </div>
      ) : null}
    </div>
  )
}
