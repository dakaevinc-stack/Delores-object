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
        <div className={styles.headRail} aria-hidden />
        <div className={styles.headGlow} aria-hidden />
        <div className={styles.headText}>
          <p className={styles.kicker}>
            <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            {copy.kicker}
          </p>
          <h2 className={styles.title} id={titleId}>
            {copy.title}
          </h2>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
