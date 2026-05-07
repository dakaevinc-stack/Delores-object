import { formatReportDateTime, formatReportDateTimeFull } from '../../domain/reportFormatting'
import type { DailyTelegramWorkLine } from '../../domain/dailyTelegramReport'
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
  /** ФИО ответственного: показывается аватар-кругом с инициалами в шапке. */
  responsibleName?: string
  /** Краткие чипы статистики в подвале (📎 N вложений / ⚠ M проблем). */
  metaChips?: readonly FieldReportMetaChip[]
  /** Кнопка удалить — встраивается в подвал карточки. */
  onRemove?: () => void
  removeLabel?: string
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
  responsibleName,
  metaChips,
  onRemove,
  removeLabel = 'Удалить',
}: Props) {
  const initials = responsibleName ? getInitials(responsibleName) : ''
  const trimmedComment = narrativeComment?.trim() ?? ''
  const showFooter =
    (metaChips && metaChips.length > 0) || Boolean(onRemove) || (chips && chips.length > 0)

  return (
    <article className={`${styles.card} ${ACCENT_CLASS[accent]}`}>
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
        </div>
      </header>

      {trimmedComment ? (
        <div className={styles.narrative}>
          <span className={styles.narrativeQuote} aria-hidden>
            ❝
          </span>
          <p className={styles.narrativeKicker}>Комментарий смены</p>
          <p className={styles.narrativeBody}>{trimmedComment}</p>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <ol className={styles.lines}>
          {lines.map((line) => (
            <li key={line.index} className={styles.line}>
              <span className={styles.idx}>{line.index}</span>
              <span className={styles.txt}>{line.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {problems && problems.length > 0 ? (
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

      {attachments && attachments.length > 0 ? (
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

      {metrics && metrics.length > 0 ? (
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

      {showFooter ? (
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
