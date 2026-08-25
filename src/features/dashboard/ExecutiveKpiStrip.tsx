import type { StatusCounts } from '../../domain/executiveDashboard'
import { SITE_STATUS_LABEL } from '../../domain/objectStatus'
import type { StatusFilterValue } from '../objects/ObjectStatusFilter'
import styles from './ExecutiveKpiStrip.module.css'

type Props = {
  counts: StatusCounts
  activeStatus: StatusFilterValue
  onSelectStatus: (status: StatusFilterValue) => void
}

type StatusTone = 'ok' | 'warn' | 'bad'

function sharePercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function StatusCard({
  tone,
  status,
  label,
  value,
  hint,
  share,
  active,
  onSelect,
}: {
  tone: StatusTone
  status: 'normal' | 'attention' | 'critical'
  label: string
  value: number
  hint: string
  share: number
  active: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.item} ${styles[tone]} ${active ? styles.itemActive : ''}`}
        data-kpi-status={status}
        aria-pressed={active}
        aria-label={`${label}: ${value}. Показать объекты с этим статусом`}
        onClick={onSelect}
      >
        <span className={styles.stripe} aria-hidden />
        <span className={styles.specular} aria-hidden />
        <span className={styles.caustic} aria-hidden />
        <div className={styles.face}>
          <div className={styles.head}>
            <span className={styles.headLead}>
              <span className={styles.dot} aria-hidden />
              <p className={styles.label}>{label}</p>
            </span>
          </div>
          <p className={styles.value}>{value}</p>
          <p className={styles.hint}>{hint}</p>
          <div className={styles.foot}>
            <div className={styles.footRow}>
              <span className={styles.footLabel}>Доля портфеля</span>
              <span className={styles.footVal}>{share}%</span>
            </div>
            <div className={styles.track} aria-hidden>
              <span className={styles.fill} style={{ width: `${share}%` }} />
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

export function ExecutiveKpiStrip({
  counts,
  activeStatus,
  onSelectStatus,
}: Props) {
  const total = counts.all
  const segments: Array<{ tone: StatusTone; count: number }> = [
    { tone: 'ok', count: counts.normal },
    { tone: 'warn', count: counts.attention },
    { tone: 'bad', count: counts.critical },
  ]
  const segmentClass: Record<StatusTone, string> = {
    ok: styles.segOk,
    warn: styles.segWarn,
    bad: styles.segBad,
  }
  const portfolioActive = activeStatus === 'all'

  return (
    <section className={styles.wrap} aria-label="Ключевые показатели по объектам">
      <ul className={styles.grid}>
        <li>
          <button
            type="button"
            className={`${styles.item} ${styles.itemHero} ${portfolioActive ? styles.itemActive : ''}`}
            data-kpi-status="all"
            aria-pressed={portfolioActive}
            aria-label={`Портфель: ${total}. Показать все объекты`}
            onClick={() => onSelectStatus('all')}
          >
            <span className={styles.stripe} aria-hidden />
            <span className={styles.specular} aria-hidden />
            <span className={styles.caustic} aria-hidden />
            <div className={styles.face}>
              <div className={styles.head}>
                <span className={styles.headLead}>
                  <span className={styles.dot} aria-hidden />
                  <p className={styles.label}>Портфель</p>
                </span>
                <span className={styles.heroChip}>Сегодня</span>
              </div>
              <p className={styles.value}>{total}</p>
              <p className={styles.hint}>Действующих объектов в работе</p>
              <div className={styles.foot}>
                <div className={styles.footRow}>
                  <span className={styles.footLabel}>Структура</span>
                  <span className={styles.footVal}>
                    {counts.normal} / {counts.attention} / {counts.critical}
                  </span>
                </div>
                <div className={styles.track} aria-hidden>
                  {segments
                    .filter((segment) => segment.count > 0)
                    .map((segment) => (
                      <span
                        key={segment.tone}
                        className={`${styles.fill} ${segmentClass[segment.tone]}`}
                        style={{ flex: `${segment.count} 0 0` }}
                      />
                    ))}
                </div>
              </div>
            </div>
          </button>
        </li>

        <StatusCard
          tone="ok"
          status="normal"
          label={SITE_STATUS_LABEL.normal}
          value={counts.normal}
          hint="В графике, без критики"
          share={sharePercent(counts.normal, total)}
          active={activeStatus === 'normal'}
          onSelect={() => onSelectStatus('normal')}
        />
        <StatusCard
          tone="warn"
          status="attention"
          label={SITE_STATUS_LABEL.attention}
          value={counts.attention}
          hint="Нужен контроль"
          share={sharePercent(counts.attention, total)}
          active={activeStatus === 'attention'}
          onSelect={() => onSelectStatus('attention')}
        />
        <StatusCard
          tone="bad"
          status="critical"
          label={SITE_STATUS_LABEL.critical}
          value={counts.critical}
          hint="Срочные решения"
          share={sharePercent(counts.critical, total)}
          active={activeStatus === 'critical'}
          onSelect={() => onSelectStatus('critical')}
        />
      </ul>
    </section>
  )
}
