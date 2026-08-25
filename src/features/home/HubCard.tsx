import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './HubCard.module.css'

export type HubBadge = {
  /** Живые цифры раздела: «63 единицы · 12 на контроле». */
  kind: 'stats'
  items: Array<{ num: number; unit: string }>
}

type HubCardProps = {
  title: string
  icon: ReactNode
  ariaLabel: string
  badge?: HubBadge
  /** Кикер над меню справа, напр. «В разделе». */
  asideKicker?: string
  /** Короткие метки раздела (ТО, страховки…). */
  tags?: string[]
  cta?: string
  to?: string
  href?: string
  unavailableReason?: string
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden focusable="false">
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
  return (
    <div
      className={styles.stats}
      aria-label={badge.items.map((item) => `${item.num} ${item.unit}`).join(', ')}
    >
      {badge.items.map((item, index) => (
        <div key={item.unit} className={styles.stat}>
          {index > 0 ? <span className={styles.statRail} aria-hidden /> : null}
          <span className={styles.statNum}>{item.num}</span>
          <span className={styles.statUnit}>{item.unit}</span>
        </div>
      ))}
    </div>
  )
}

export function HubCard({
  title,
  tags = [],
  icon,
  badge,
  asideKicker = 'В разделе',
  cta = 'Открыть',
  ariaLabel,
  to,
  href,
  unavailableReason,
}: HubCardProps) {
  const available = Boolean(to || href)

  const body = (
    <>
      <span className={styles.stripe} aria-hidden />
      <span className={styles.glow} aria-hidden />

      <div className={styles.shell}>
        <div className={styles.primary}>
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden>
              {icon}
            </span>
            <span className={styles.title}>{title}</span>
          </div>
          {badge ? <HubCardBadge badge={badge} /> : null}
        </div>

        <span className={styles.vDivider} aria-hidden />

        <div className={styles.aside}>
          {tags.length > 0 ? (
            <div className={styles.asideBlock}>
              <p className={styles.asideKicker}>{asideKicker}</p>
              <ul className={styles.menu} aria-label={`${asideKicker}: ${title}`}>
                {tags.map((tag) => (
                  <li key={tag}>
                    <span className={styles.menuDot} aria-hidden />
                    <span className={styles.menuLabel}>{tag}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={styles.foot}>
            {!available && unavailableReason ? (
              <p className={styles.ctaNote}>{unavailableReason}</p>
            ) : null}
            <span className={`${styles.cta} ${available ? '' : styles.ctaOff}`} aria-hidden>
              <span className={styles.ctaLabel}>{cta}</span>
              <span className={styles.ctaArrow}>
                <ArrowRight />
              </span>
            </span>
          </div>
        </div>
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
