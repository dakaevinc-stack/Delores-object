import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './HubCard.module.css'

export type HubSignal = {
  label: string
  /** Живое значение (иначе — порядковый индекс 01…) */
  value?: string | number
  /** Подсветка «требует внимания» */
  hot?: boolean
}

type HubCardProps = {
  title: string
  icon: ReactNode
  ariaLabel: string
  lead?: string
  /** Короткие метки — превратятся в приборную шкалу */
  tags?: string[]
  /** Приборная шкала с опциональными цифрами (приоритетнее tags) */
  signals?: HubSignal[]
  cta?: string
  to?: string
  href?: string
  unavailableReason?: string
  tone?: 'fleet' | 'inspect' | 'sites' | 'tasks'
  expanded?: boolean
  onToggle?: () => void
  ariaControls?: string
  headingId?: string
  badge?: number
}

const TONE_KICKER: Record<NonNullable<HubCardProps['tone']>, string> = {
  fleet: 'Парк',
  inspect: 'Контроль',
  sites: 'Площадки',
  tasks: 'Исполнение',
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

function formatSignalValue(value: string | number): string {
  if (typeof value === 'number') return value > 99 ? '99+' : String(value).padStart(2, '0')
  return value.trim()
}

export function HubCard({
  title,
  lead,
  tags = [],
  signals,
  icon,
  cta = 'Открыть',
  ariaLabel,
  to,
  href,
  unavailableReason,
  tone = 'fleet',
  expanded = false,
  onToggle,
  ariaControls,
  headingId,
  badge,
}: HubCardProps) {
  const available = Boolean(to || href || onToggle)
  const toneClass =
    tone === 'inspect'
      ? styles.toneInspect
      : tone === 'sites'
        ? styles.toneSites
        : tone === 'tasks'
          ? styles.toneTasks
          : styles.toneFleet
  const ctaLabel = onToggle ? (expanded ? 'Свернуть' : cta) : cta
  const kicker = TONE_KICKER[tone]
  const items: HubSignal[] = (signals ?? tags.map((label) => ({ label }))).slice(0, 5)

  const ctaNode = onToggle ? (
    <button
      type="button"
      className={`${styles.cta} ${styles.ctaBtn}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-controls={ariaControls}
    >
      <span className={styles.ctaLabel}>{ctaLabel}</span>
      <span className={`${styles.ctaArrow} ${expanded ? styles.ctaArrowOpen : ''}`}>
        <ArrowRight />
      </span>
    </button>
  ) : (
    <span className={`${styles.cta} ${available ? '' : styles.ctaOff}`} aria-hidden>
      <span className={styles.ctaLabel}>{ctaLabel}</span>
      <span className={styles.ctaArrow}>
        <ArrowRight />
      </span>
    </span>
  )

  const body = (
    <>
      <span className={styles.edge} aria-hidden />
      <span className={styles.glow} aria-hidden />
      <span className={styles.grid} aria-hidden />
      <span className={styles.scan} aria-hidden />
      <span className={styles.sheen} aria-hidden />
      {typeof badge === 'number' && badge > 0 ? (
        <span className={styles.badge} aria-label={`Новых: ${badge}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}

      <div className={styles.shell}>
        <div className={styles.top}>
          <span className={styles.icon} aria-hidden>
            <span className={styles.iconCore}>{icon}</span>
          </span>
          <div className={styles.topCopy}>
            <p className={styles.kicker}>{kicker}</p>
            {onToggle ? (
              <h2 className={styles.title} id={headingId}>
                {title}
              </h2>
            ) : (
              <h3 className={styles.title}>{title}</h3>
            )}
          </div>
        </div>

        {lead ? <p className={styles.lead}>{lead}</p> : null}

        <div className={styles.foot}>
          {items.length > 0 ? (
            <div className={styles.hudWrap}>
              <span className={styles.hudFrame} aria-hidden />
              <span className={`${styles.hudCorner} ${styles.hudCornerTl}`} aria-hidden />
              <span className={`${styles.hudCorner} ${styles.hudCornerTr}`} aria-hidden />
              <span className={`${styles.hudCorner} ${styles.hudCornerBl}`} aria-hidden />
              <span className={`${styles.hudCorner} ${styles.hudCornerBr}`} aria-hidden />
              <ul
                className={styles.hud}
                data-count={items.length}
                aria-label={`Разделы: ${title}`}
              >
                {items.map((item) => {
                  const live = item.value !== undefined && item.value !== ''
                  return (
                    <li
                      key={item.label}
                      className={`${styles.hudCell} ${item.hot ? styles.hudHot : ''} ${live ? styles.hudLive : ''}`}
                    >
                      {live ? (
                        <span className={styles.hudValue}>
                          {formatSignalValue(item.value as string | number)}
                        </span>
                      ) : null}
                      <span className={styles.hudLabel}>{item.label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <span className={styles.tagsSpacer} aria-hidden />
          )}

          <div className={styles.footRow}>
            <span className={styles.footLine} aria-hidden />
            {ctaNode}
          </div>

          {!available && unavailableReason ? (
            <p className={styles.ctaNote}>{unavailableReason}</p>
          ) : null}
        </div>
      </div>
    </>
  )

  const className = `${styles.card} ${toneClass} ${
    onToggle ? styles.expandable : available ? styles.interactive : styles.static
  } ${typeof badge === 'number' && badge > 0 ? styles.hasBadge : ''}`

  if (onToggle) {
    return (
      <article
        className={className}
        aria-label={ariaLabel}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={ariaControls}
      >
        {body}
      </article>
    )
  }
  if (to) {
    return (
      <Link className={className} to={to} aria-label={ariaLabel}>
        {body}
      </Link>
    )
  }

  if (href) {
    return (
      <a
        className={className}
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
    <div className={className} role="note" aria-label={ariaLabel}>
      {body}
    </div>
  )
}
