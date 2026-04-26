import { useId, type ReactNode } from 'react'
import styles from './DashboardCard.module.css'

type Props = {
  title: string
  description?: string
  children: ReactNode
}

export function DashboardCard({ title, description, children }: Props) {
  const uid = useId()
  const titleId = `${uid}-title`

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.head}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {description ? (
          <p className={styles.desc}>{description}</p>
        ) : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
