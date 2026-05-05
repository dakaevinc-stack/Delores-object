import { useId, type ReactNode } from 'react'
import styles from './DashboardCard.module.css'

type Props = {
  /** Premium kicker над заголовком («Портфель», «Готовность» и т.п.). */
  kicker?: string
  title: string
  description?: string
  /** Опциональный slot правее заголовка — например, status-pill. */
  meta?: ReactNode
  children: ReactNode
}

export function DashboardCard({
  kicker,
  title,
  description,
  meta,
  children,
}: Props) {
  const uid = useId()
  const titleId = `${uid}-title`

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.head}>
        {kicker ? (
          <p className={styles.kicker}>
            <img
              className={styles.kickerMark}
              src="/brand-chevron.svg"
              alt=""
              aria-hidden="true"
            />
            <span>{kicker}</span>
          </p>
        ) : null}
        <div className={styles.titleRow}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {description ? (
          <p className={styles.desc}>{description}</p>
        ) : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
