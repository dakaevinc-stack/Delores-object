import { Children, type ReactNode } from 'react'
import { SITE_PAGE_ZONES, type SitePageZoneId } from '../../domain/sitePageZone'
import styles from './SiteRoleZone.module.css'

type Props = {
  zone: SitePageZoneId
  actions?: ReactNode
  children?: ReactNode
  /**
   * `stack` — отдельная шапка-карточка и тело ниже (по умолчанию).
   * `panel` — одна цельная панель: шапка + контент внутри общей рамки.
   */
  layout?: 'stack' | 'panel'
}

export function SiteRoleZone({
  zone,
  actions,
  children,
  layout = 'stack',
}: Props) {
  const copy = SITE_PAGE_ZONES[zone]
  const titleId = `site-zone-${zone}-title`
  const showKicker = Boolean(copy.kicker.trim())
  const hasBody = Children.count(children) > 0
  const isPanel = layout === 'panel'

  return (
    <section
      className={isPanel ? styles.zonePanel : styles.zone}
      data-site-zone={zone}
      data-layout={layout}
      aria-labelledby={titleId}
    >
      {isPanel ? <div className={styles.panelRail} aria-hidden /> : null}
      {isPanel ? <div className={styles.panelGlow} aria-hidden /> : null}

      <header className={isPanel ? styles.panelHead : styles.head}>
        {!isPanel ? (
          <>
            <div className={styles.headRail} aria-hidden />
            <div className={styles.headGlow} aria-hidden />
          </>
        ) : null}
        <div className={styles.headText}>
          {showKicker ? (
            <p className={styles.kicker}>
              <img className={styles.kickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
              {copy.kicker}
            </p>
          ) : null}
          <h2 className={styles.title} id={titleId}>
            {copy.title}
          </h2>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>

      {hasBody ? (
        <div className={isPanel ? styles.panelBody : styles.body}>{children}</div>
      ) : null}
    </section>
  )
}
