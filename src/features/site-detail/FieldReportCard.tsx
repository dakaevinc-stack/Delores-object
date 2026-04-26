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

type Props = {
  badge: string
  badgeKicker?: string
  accent?: FieldReportAccent
  dateTimeIso?: string
  lines: readonly DailyTelegramWorkLine[]
  chips?: readonly Chip[]
  metrics?: readonly FieldReportMetric[]
  problems?: readonly FieldReportProblemRow[]
  attachments?: readonly FieldReportAttachment[]
  /** Свободный комментарий (отдельно от строк «работ»). */
  narrativeComment?: string
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
  lines,
  chips,
  metrics,
  problems,
  attachments,
  narrativeComment,
}: Props) {
  return (
    <article className={`${styles.card} ${ACCENT_CLASS[accent]}`}>
      <span className={styles.rail} aria-hidden />

      <header className={styles.head}>
        <span className={styles.badge}>
          <BadgeIconFor accent={accent} />
          <span className={styles.badgeText}>
            {badgeKicker ? (
              <span className={styles.badgeKicker}>{badgeKicker}</span>
            ) : null}
            <span className={styles.badgeTitle}>{badge}</span>
          </span>
        </span>

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
      </header>

      {narrativeComment?.trim() ? (
        <div className={styles.narrative}>
          <p className={styles.narrativeKicker}>Комментарий</p>
          <p className={styles.narrativeBody}>{narrativeComment.trim()}</p>
        </div>
      ) : null}

      <ol className={styles.lines}>
        {lines.map((line) => (
          <li key={line.index} className={styles.line}>
            <span className={styles.idx}>{line.index}</span>
            <span className={styles.txt}>{line.text}</span>
          </li>
        ))}
      </ol>

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

      {chips && chips.length > 0 ? (
        <footer className={styles.footer}>
          {chips.map((c) => (
            <span
              key={c.id}
              className={c.tone === 'muted' ? styles.chipMuted : styles.chip}
            >
              {c.text}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  )
}
