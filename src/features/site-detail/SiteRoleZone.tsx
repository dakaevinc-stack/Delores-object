import { Children, useId, type ReactNode } from 'react'
import { SITE_PAGE_ZONES, type SitePageZoneId } from '../../domain/sitePageZone'
import { CollapseToggle } from './CollapseToggle'
import { useAnchoredExpand } from './useAnchoredExpand'
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
  /** Шапка с кнопкой «Открыть / Свернуть» — тело скрыто, пока не откроют. */
  collapsible?: boolean
  /** Стартовое состояние при `collapsible` (по умолчанию свёрнуто). */
  defaultExpanded?: boolean
}

export function SiteRoleZone({
  zone,
  actions,
  children,
  layout = 'stack',
  collapsible = false,
  defaultExpanded = false,
}: Props) {
  const copy = SITE_PAGE_ZONES[zone]
  const titleId = `site-zone-${zone}-title`
  const bodyId = useId()
  const showKicker = Boolean(copy.kicker.trim())
  const hasBody = Children.count(children) > 0
  const isPanel = layout === 'panel'
  const { expanded, toggle, anchorRef } = useAnchoredExpand(defaultExpanded)
  const showBody = hasBody && (!collapsible || expanded)

  return (
    <section
      ref={anchorRef}
      className={isPanel ? styles.zonePanel : styles.zone}
      data-site-zone={zone}
      data-layout={layout}
      data-collapsed={collapsible && !expanded ? 'true' : undefined}
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
        {(collapsible && hasBody) || actions ? (
          <div className={styles.actions}>
            {actions}
            {collapsible && hasBody ? (
              <CollapseToggle
                expanded={expanded}
                onToggle={toggle}
                ariaControls={bodyId}
                className={styles.headToggle}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      {showBody ? (
        <div className={isPanel ? styles.panelBody : styles.body} id={bodyId}>
          {children}
        </div>
      ) : collapsible && hasBody ? (
        <div id={bodyId} hidden />
      ) : null}
    </section>
  )
}
