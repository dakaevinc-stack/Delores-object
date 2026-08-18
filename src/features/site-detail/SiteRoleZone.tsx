import type { ReactNode } from 'react'
import { SITE_PAGE_ZONES, type SitePageZoneId } from '../../domain/sitePageZone'
import styles from './SiteRoleZone.module.css'

type Props = {
  zone: SitePageZoneId
  actions?: ReactNode
  children: ReactNode
}

export function SiteRoleZone({ zone, actions, children }: Props) {
  const copy = SITE_PAGE_ZONES[zone]
  const titleId = `site-zone-${zone}-title`

  return (
    <section className={styles.zone} data-site-zone={zone} aria-labelledby={titleId}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <p className={styles.title} id={titleId}>
            {copy.title}
          </p>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
