import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './HubCard.module.css'

export type HubBadge =
  /** Живые цифры раздела: «63 единицы · 13 классов». */
  | { kind: 'stats'; items: Array<{ num: number; unit: string }> }
  /** Метка перехода за пределы приложения. */
  | { kind: 'external'; label: string }

type HubCardProps = {
  kicker: string
  title: string
  lead: string
  tags: string[]
  icon: ReactNode
  badge?: HubBadge
  cta: string
  ariaLabel: string
  /** Внутренний маршрут приложения. */
  to?: string
  /** Внешний адрес — открывается в новой вкладке. */
  href?: string
  /** Человекочитаемая причина, почему переход недоступен. */
  unavailableReason?: string
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden focusable="false">
      <path
        d="M4 10h11M10 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HubCardBadge({ badge }: { badge: HubBadge }) {
  if (badge.kind === 'external') {
    return (
      <span className={styles.badge} aria-label="Открывается в новой вкладке">
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden focusable="false">
          <path
            d="M4.5 2.5h5v5M9.5 2.5l-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {badge.label}
      </span>
    )
  }

  return (
    <span
      className={styles.badge}
      aria-label={badge.items.map((item) => `${item.num} ${item.unit}`).join(', ')}
    >
      {badge.items.map((item, index) => (
        <span key={item.unit} className={styles.badgeItem}>
          {index > 0 && <span className={styles.badgeSep} aria-hidden />}
          <span className={styles.badgeNum}>{item.num}</span>
          <span className={styles.badgeUnit}>{item.unit}</span>
        </span>
      ))}
    </span>
  )
}

export function HubCard({
  kicker,
  title,
  lead,
  tags,
  icon,
  badge,
  cta,
  ariaLabel,
  to,
  href,
  unavailableReason,
}: HubCardProps) {
  const available = Boolean(to || href)
  // Метку «внешняя панель» показываем только когда переход действительно доступен.
  const visibleBadge = badge?.kind === 'external' && !href ? undefined : badge

  const body = (
    <>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
        <span className={styles.headText}>
          <span className={styles.kicker}>
            <span className={styles.kickerBar} aria-hidden />
            {kicker}
          </span>
          <span className={styles.title}>{title}</span>
          <span className={styles.badgeRow}>
            {visibleBadge && <HubCardBadge badge={visibleBadge} />}
          </span>
        </span>
      </div>

      <span className={styles.lead}>{lead}</span>

      <ul className={styles.tags} aria-label={`Что внутри: ${title}`}>
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>

      {/* Кнопка — последний элемент карточки, поэтому её низ совпадает
          у соседних карточек независимо от пояснения выше. */}
      <div className={styles.foot}>
        {!available && unavailableReason && (
          <p className={styles.ctaNote}>{unavailableReason}</p>
        )}
        <span className={`${styles.cta} ${available ? '' : styles.ctaOff}`} aria-hidden>
          <span className={styles.ctaLabel}>{cta}</span>
          <span className={styles.ctaArrow}>
            <ArrowRight />
          </span>
        </span>
      </div>
    </>
  )

  if (to) {
    return (
      <Link className={`${styles.card} ${styles.interactive}`} to={to} aria-label={ariaLabel}>
        {body}
      </Link>
    )
  }

  if (href) {
    return (
      <a
        className={`${styles.card} ${styles.interactive}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
      >
        {body}
      </a>
    )
  }

  return (
    <div className={`${styles.card} ${styles.static}`} role="note" aria-label={ariaLabel}>
      {body}
    </div>
  )
}
