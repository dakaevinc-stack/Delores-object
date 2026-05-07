import { useEffect, useState, type ReactElement } from 'react'
import { formatReportDateTime, formatReportDateTimeFull } from '../../domain/reportFormatting'
import type { DailyTelegramWorkLine } from '../../domain/dailyTelegramReport'
import type { BrigadierCommentSections } from './brigadierCommentSections'
import styles from './FieldReportCard.module.css'

export type FieldReportAttachment = {
  id: string
  kind: 'photo' | 'video'
  previewUrl: string
  name: string
  registeredAtIso: string
  fileModifiedIso: string
  notPersisted?: boolean
}

type Chip = {
  id: string
  text: string
  tone?: 'default' | 'muted'
}

export type FieldReportMetric = {
  id: string
  value: string
  label: string
  tone?: 'navy' | 'red' | 'neutral' | 'success' | 'warning' | 'danger'
}

export type FieldReportProblemRow = {
  kindLabel: string
  details: string
}

export type FieldReportAccent = 'telegram' | 'brigadier' | 'default'

export type FieldReportMetaChip = {
  id: string
  icon: 'attach' | 'warn' | 'photo' | 'video'
  label: string
  tone?: 'neutral' | 'warning'
}

type Props = {
  badge: string
  badgeKicker?: string
  accent?: FieldReportAccent
  dateTimeIso?: string
  /** Короткая отметка относительного времени: «Сегодня», «Вчера», «3 дн. назад». */
  relativeTimeLabel?: string
  lines: readonly DailyTelegramWorkLine[]
  chips?: readonly Chip[]
  metrics?: readonly FieldReportMetric[]
  problems?: readonly FieldReportProblemRow[]
  attachments?: readonly FieldReportAttachment[]
  /** Свободный комментарий (отдельно от строк «работ»). */
  narrativeComment?: string
  /**
   * Структурированная разметка комментария бригадира: работы, что
   * уложено, состав бригады. Если задана и `hasStructure`, рендерится
   * списком с иконками вместо плоского `narrativeComment`.
   */
  narrativeStructured?: BrigadierCommentSections | null
  /** ФИО ответственного: показывается аватар-кругом с инициалами в шапке. */
  responsibleName?: string
  /** Краткие чипы статистики в подвале (📎 N вложений / ⚠ M проблем). */
  metaChips?: readonly FieldReportMetaChip[]
  /** Кнопка удалить — встраивается в подвал карточки. */
  onRemove?: () => void
  removeLabel?: string
  /**
   * Карточку можно сворачивать в шапку: тело прячется до клика по
   * кнопке-шеврону. В свёрнутом состоянии показываем компактную
   * сводку (пункты журнала / уложено / медиа / проблемы).
   */
  collapsible?: boolean
  defaultExpanded?: boolean
}

const ACCENT_CLASS: Record<FieldReportAccent, string> = {
  telegram: styles.accentTelegram,
  brigadier: styles.accentBrigadier,
  default: styles.accentDefault,
}

const METRIC_TONE_CLASS: Record<NonNullable<FieldReportMetric['tone']>, string> = {
  navy: styles.metricNavy,
  red: styles.metricRed,
  neutral: styles.metricNeutral,
  success: styles.metricSuccess,
  warning: styles.metricWarning,
  danger: styles.metricDanger,
}

/**
 * «МА» из «Минасян А.Л.», «ИИ» из «Иванов Иван Иванович». Для коротких
 * имён вроде «Иван» — просто «И».
 */
function getInitials(name: string): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  const first = trimmed.charAt(0).toUpperCase()
  const rest = trimmed.slice(1).match(/[А-ЯЁA-Z]/)
  return (first + (rest?.[0] ?? '')).slice(0, 2)
}

function PaperPlaneIcon() {
  return (
    <svg
      className={styles.badgeIcon}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21.7 2.3a1 1 0 0 0-1.06-.23L2.74 9.34a1 1 0 0 0 .07 1.88l6.5 1.94 1.94 6.5a1 1 0 0 0 1.86.1l7.84-17.4a1 1 0 0 0-.25-1.06ZM10.7 14.18 9.6 17.92l-1.4-4.7 6.6-6.6-4.1 7.56Zm5.6-9.07-6.6 6.6-4.7-1.4L19.5 4.4l-3.2.71Z" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg
      className={styles.badgeIcon}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9 3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2Zm2 0v2h2V3h-2Z" />
    </svg>
  )
}

function CalendarDot() {
  return (
    <svg
      className={styles.dateIcon}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
    </svg>
  )
}

function MetaIcon({ kind }: { kind: FieldReportMetaChip['icon'] }) {
  if (kind === 'attach') {
    return (
      <svg
        className={styles.metaChipIcon}
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16.5 6.5 8.95 14.05a3 3 0 0 0 4.24 4.24l8.5-8.5a5 5 0 0 0-7.07-7.07L4.7 11.7a7 7 0 0 0 9.9 9.9l5.45-5.45" />
      </svg>
    )
  }
  if (kind === 'photo') {
    return (
      <svg
        className={styles.metaChipIcon}
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="18" height="14" rx="2.5" />
        <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    )
  }
  if (kind === 'video') {
    return (
      <svg
        className={styles.metaChipIcon}
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="13" height="12" rx="2.5" />
        <path d="m16 10 5-3v10l-5-3z" />
      </svg>
    )
  }
  return (
    <svg
      className={styles.metaChipIcon}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      className={styles.removeIcon}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M5 6v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" />
      <path d="M10 11v8M14 11v8" />
    </svg>
  )
}

function BadgeIconFor({ accent }: { accent: FieldReportAccent }) {
  if (accent === 'telegram') return <PaperPlaneIcon />
  if (accent === 'brigadier') return <ClipboardIcon />
  return null
}

function ScrollIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h11a3 3 0 0 1 3 3v10" />
      <path d="M5 4a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h12" />
      <path d="M19 17a3 3 0 0 0 3 3v0a3 3 0 0 0-3-3" />
      <path d="M9 14h6M9 18h4" />
    </svg>
  )
}

function PipesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="6" rx="1.5" />
      <rect x="2.5" y="14" width="19" height="6" rx="1.5" />
      <path d="M2.5 9h19M2.5 17h19" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.7" />
      <path d="M21.5 20a4.5 4.5 0 0 0-7-3.7" />
    </svg>
  )
}

function HelmetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 17h18" />
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M10 9V6a2 2 0 0 1 4 0v3" />
      <path d="M8 12.5h8" />
    </svg>
  )
}

function BadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="6" width="15" height="14" rx="2.5" />
      <path d="M9 6V4.5h6V6" />
      <path d="M12 11.5v3.5" />
      <circle cx="12" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="7" width="11.5" height="9" rx="1.6" />
      <path d="M14 10h4l3.5 3v3H14z" />
      <circle cx="6.5" cy="17.5" r="1.7" />
      <circle cx="17.5" cy="17.5" r="1.7" />
    </svg>
  )
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function workWord(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'рабочий'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'рабочих'
  return 'рабочих'
}

type CrewSlot = {
  id: string
  value: number
  label: string
  icon: (props: { className?: string }) => ReactElement
}

function buildCrewSlots(
  crew: NonNullable<BrigadierCommentSections['crew']>,
): CrewSlot[] {
  const slots: CrewSlot[] = []
  if (typeof crew.workers === 'number') {
    slots.push({
      id: 'workers',
      value: crew.workers,
      label: workWord(crew.workers),
      icon: HelmetIcon,
    })
  }
  if (typeof crew.itr === 'number') {
    slots.push({ id: 'itr', value: crew.itr, label: 'ИТР', icon: BadgeIcon })
  }
  if (typeof crew.equipment === 'number') {
    slots.push({
      id: 'equipment',
      value: crew.equipment,
      label: 'ед. техники',
      icon: TruckIcon,
    })
  }
  if (typeof crew.people === 'number') {
    slots.push({
      id: 'people',
      value: crew.people,
      label: 'человек',
      icon: PersonIcon,
    })
  }
  return slots
}

export function FieldReportCard({
  badge,
  badgeKicker,
  accent = 'default',
  dateTimeIso,
  relativeTimeLabel,
  lines,
  chips,
  metrics,
  problems,
  attachments,
  narrativeComment,
  narrativeStructured,
  responsibleName,
  metaChips,
  onRemove,
  removeLabel = 'Удалить',
  collapsible,
  defaultExpanded,
}: Props) {
  const isCollapsible = Boolean(collapsible)
  const [expanded, setExpanded] = useState(
    isCollapsible ? Boolean(defaultExpanded) : true,
  )
  useEffect(() => {
    if (!isCollapsible) setExpanded(true)
  }, [isCollapsible])
  const showBody = !isCollapsible || expanded

  const initials = responsibleName ? getInitials(responsibleName) : ''
  const trimmedComment = narrativeComment?.trim() ?? ''
  const useStructured = Boolean(narrativeStructured?.hasStructure)
  const crewSlots =
    useStructured && narrativeStructured?.crew
      ? buildCrewSlots(narrativeStructured.crew)
      : []
  const showStructured = useStructured && narrativeStructured !== undefined
  const showFooter =
    (metaChips && metaChips.length > 0) || Boolean(onRemove) || (chips && chips.length > 0)

  const previewChips: { id: string; icon: ReactElement; label: string }[] = []
  if (narrativeStructured?.works.length) {
    const n = narrativeStructured.works.length
    previewChips.push({
      id: 'works',
      icon: <ScrollIcon className={styles.metaChipIcon} />,
      label: `${n} ${pluralRu(n, ['пункт', 'пункта', 'пунктов'])} журнала`,
    })
  }
  if (narrativeStructured?.laid.length) {
    const n = narrativeStructured.laid.length
    previewChips.push({
      id: 'laid',
      icon: <PipesIcon className={styles.metaChipIcon} />,
      label: `${n} ${pluralRu(n, ['материал', 'материала', 'материалов'])} уложено`,
    })
  }
  if (narrativeStructured?.crew?.workers != null) {
    previewChips.push({
      id: 'crew',
      icon: <HelmetIcon className={styles.metaChipIcon} />,
      label: `${narrativeStructured.crew.workers} ${pluralRu(narrativeStructured.crew.workers, [
        'рабочий',
        'рабочих',
        'рабочих',
      ])}`,
    })
  }
  if (narrativeStructured?.crew?.equipment != null) {
    previewChips.push({
      id: 'equipment',
      icon: <TruckIcon className={styles.metaChipIcon} />,
      label: `${narrativeStructured.crew.equipment} ед. техники`,
    })
  }
  const showPreview = isCollapsible && !expanded && (previewChips.length > 0 || (metaChips && metaChips.length > 0))

  const cardClass = [
    styles.card,
    ACCENT_CLASS[accent],
    isCollapsible && !expanded ? styles.cardCollapsed : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleCardClick = () => {
    if (isCollapsible && !expanded) setExpanded(true)
  }

  return (
    <article className={cardClass} onClick={handleCardClick}>
      <span className={styles.rail} aria-hidden />
      <span className={styles.topShimmer} aria-hidden />

      <header className={styles.head}>
        <div className={styles.headLeft}>
          <span className={styles.badge}>
            <BadgeIconFor accent={accent} />
            <span className={styles.badgeText}>
              {badgeKicker ? (
                <span className={styles.badgeKicker}>{badgeKicker}</span>
              ) : null}
              <span className={styles.badgeTitle}>{badge}</span>
            </span>
          </span>

          {responsibleName ? (
            <div className={styles.responsible}>
              <span className={styles.avatar} aria-hidden>
                <span className={styles.avatarInitials}>{initials || '—'}</span>
              </span>
              <span className={styles.responsibleText}>
                <span className={styles.responsibleKicker}>Ответственный</span>
                <span className={styles.responsibleName}>{responsibleName}</span>
              </span>
            </div>
          ) : null}
        </div>

        <div className={styles.dateBlock}>
          {relativeTimeLabel ? (
            <span className={styles.relativePill}>{relativeTimeLabel}</span>
          ) : null}
          {dateTimeIso ? (
            <time
              className={styles.date}
              dateTime={dateTimeIso}
              title={formatReportDateTimeFull(dateTimeIso)}
            >
              <CalendarDot />
              <span>{formatReportDateTime(dateTimeIso)}</span>
            </time>
          ) : (
            <span className={styles.dateMuted}>без даты в источнике</span>
          )}
          {isCollapsible ? (
            <button
              type="button"
              className={`${styles.toggle} ${expanded ? styles.toggleOpen : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              aria-expanded={expanded}
              aria-label={expanded ? 'Свернуть отчёт' : 'Раскрыть отчёт'}
              title={expanded ? 'Свернуть отчёт' : 'Раскрыть отчёт'}
            >
              <ChevronDownIcon className={styles.toggleIcon} />
            </button>
          ) : null}
        </div>
      </header>

      {showPreview ? (
        <div className={styles.preview}>
          {previewChips.map((c) => (
            <span
              key={c.id}
              className={`${styles.metaChip} ${styles.metaChip_neutral}`}
            >
              {c.icon}
              <span className={styles.metaChipLabel}>{c.label}</span>
            </span>
          ))}
          {metaChips?.map((c) => (
            <span
              key={`meta-${c.id}`}
              className={`${styles.metaChip} ${
                c.tone === 'warning' ? styles.metaChip_warn : styles.metaChip_neutral
              }`}
            >
              <MetaIcon kind={c.icon} />
              <span className={styles.metaChipLabel}>{c.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {showBody && showStructured && narrativeStructured ? (
        <div className={styles.narrative}>
          <p className={styles.narrativeKicker}>
            <ScrollIcon className={styles.narrativeKickerIcon} />
            <span>Журнал смены</span>
          </p>

          {narrativeStructured.works.length > 0 ? (
            <ol className={styles.workList}>
              {narrativeStructured.works.map((w, i) => (
                <li key={`${i}-${w.activity}`} className={styles.workItem}>
                  <span className={styles.workIdx} aria-hidden>
                    {i + 1}
                  </span>
                  <span className={styles.workBody}>
                    <span className={styles.workActivity}>{w.activity}</span>
                    {w.quantity ? (
                      <span className={styles.workQuantity}>{w.quantity}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          {narrativeStructured.laid.length > 0 ? (
            <div className={styles.laidBlock}>
              <p className={styles.subKicker}>
                <PipesIcon className={styles.subKickerIcon} />
                <span>Уложено за смену</span>
              </p>
              <ul className={styles.laidList}>
                {narrativeStructured.laid.map((item, i) => (
                  <li key={`${i}-${item.name}`} className={styles.laidChip}>
                    <span className={styles.laidChipName}>{item.name}</span>
                    {item.quantity ? (
                      <span className={styles.laidChipQty}>{item.quantity}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {crewSlots.length > 0 ? (
            <div className={styles.crewBlock}>
              <p className={`${styles.subKicker} ${styles.subKickerRed}`}>
                <UsersIcon className={styles.subKickerIcon} />
                <span>Бригада на смене</span>
              </p>
              <div className={styles.crewMetrics}>
                {crewSlots.map((slot) => {
                  const Icon = slot.icon
                  return (
                    <div key={slot.id} className={styles.crewMetric}>
                      <span className={styles.crewMetricIcon} aria-hidden>
                        <Icon />
                      </span>
                      <span className={styles.crewMetricBody}>
                        <span className={styles.crewMetricValue}>{slot.value}</span>
                        <span className={styles.crewMetricLabel}>{slot.label}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : showBody && trimmedComment ? (
        <div className={styles.narrative}>
          <p className={styles.narrativeKicker}>
            <ScrollIcon className={styles.narrativeKickerIcon} />
            <span>Комментарий смены</span>
          </p>
          <p className={styles.narrativeBody}>{trimmedComment}</p>
        </div>
      ) : null}

      {showBody && lines.length > 0 ? (
        <ol className={styles.lines}>
          {lines.map((line) => (
            <li key={line.index} className={styles.line}>
              <span className={styles.idx}>{line.index}</span>
              <span className={styles.txt}>{line.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {showBody && problems && problems.length > 0 ? (
        <div className={styles.problemsWrap}>
          <p className={styles.problemsKicker}>Проблемы для бригадира</p>
          <ul className={styles.problemsList}>
            {problems.map((p, i) => (
              <li key={`${i}-${p.kindLabel}`} className={styles.problemItem}>
                <span className={styles.problemKind}>{p.kindLabel}</span>
                <span className={styles.problemDetails}>{p.details}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showBody && attachments && attachments.length > 0 ? (
        <div className={styles.media}>
          {attachments.map((a) => (
            <figure key={a.id} className={styles.figure}>
              {a.notPersisted || !a.previewUrl ? (
                <div className={styles.mediaMissing}>
                  <span className={styles.mediaMissingTitle}>Не сохранено</span>
                  <span className={styles.mediaMissingText}>
                    {a.kind === 'video' ? 'Видео' : 'Файл'} «{a.name}» слишком большой для памяти
                    браузера — отправьте в общий чат.
                  </span>
                </div>
              ) : a.kind === 'photo' ? (
                <img
                  className={styles.thumb}
                  src={a.previewUrl}
                  alt={a.name}
                  loading="lazy"
                />
              ) : (
                <video className={styles.thumb} src={a.previewUrl} controls muted playsInline />
              )}
              <figcaption className={styles.caption}>
                <span className={styles.captionKind}>{a.kind === 'photo' ? 'Фото' : 'Видео'}</span>
                <span className={styles.captionMeta}>
                  добавлено {formatReportDateTime(a.registeredAtIso)}
                </span>
                <span className={styles.captionFile}>
                  файл {formatReportDateTime(a.fileModifiedIso)}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {showBody && metrics && metrics.length > 0 ? (
        <ul className={styles.metricStrip}>
          {metrics.map((m) => (
            <li
              key={m.id}
              className={`${styles.metric} ${METRIC_TONE_CLASS[m.tone ?? 'neutral']}`}
            >
              <span className={styles.metricValue}>{m.value}</span>
              <span className={styles.metricLabel}>{m.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {showBody && showFooter ? (
        <footer className={styles.footer}>
          <div className={styles.footerStats}>
            {metaChips?.map((c) => (
              <span
                key={c.id}
                className={`${styles.metaChip} ${
                  c.tone === 'warning' ? styles.metaChip_warn : styles.metaChip_neutral
                }`}
              >
                <MetaIcon kind={c.icon} />
                <span className={styles.metaChipLabel}>{c.label}</span>
              </span>
            ))}
            {chips?.map((c) => (
              <span
                key={c.id}
                className={c.tone === 'muted' ? styles.chipMuted : styles.chip}
              >
                {c.text}
              </span>
            ))}
          </div>

          {onRemove ? (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={onRemove}
              aria-label={`${removeLabel} (с этого устройства)`}
              title={`${removeLabel} с этого устройства`}
            >
              <TrashIcon />
              <span className={styles.removeBtnLabel}>{removeLabel}</span>
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
