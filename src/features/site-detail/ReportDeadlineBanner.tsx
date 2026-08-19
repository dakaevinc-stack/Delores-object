import { useEffect, useState } from 'react'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import styles from './ReportDeadlineBanner.module.css'

type Props = {
  reports: readonly BrigadierStoredReport[]
  todayIso: string
  onOpenComposer: () => void
}

type Urgency = 'none' | 'reminder' | 'warning' | 'overdue'

const DEADLINE_HOUR = 20
const WARNING_HOUR = 19
const REMINDER_HOUR = 17

function mskHour(): number {
  const now = new Date()
  const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60_000)
  return msk.getHours()
}

function getUrgency(hasTodayReport: boolean, hour: number): Urgency {
  if (hasTodayReport) return 'none'
  if (hour >= DEADLINE_HOUR) return 'overdue'
  if (hour >= WARNING_HOUR) return 'warning'
  if (hour >= REMINDER_HOUR) return 'reminder'
  return 'none'
}

const COPY: Record<Exclude<Urgency, 'none'>, { emoji: string; text: string }> = {
  reminder: {
    emoji: '🕐',
    text: 'Отчёт за сегодня ещё не сдан. До конца смены осталось несколько часов.',
  },
  warning: {
    emoji: '⚠️',
    text: 'Отчёт за сегодня не сдан. Остался меньше часа!',
  },
  overdue: {
    emoji: '🔴',
    text: 'Отчёт просрочен. Руководитель уведомлён.',
  },
}

export function ReportDeadlineBanner({ reports, todayIso, onOpenComposer }: Props) {
  const [hour, setHour] = useState(mskHour)

  useEffect(() => {
    const t = window.setInterval(() => setHour(mskHour()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const hasTodayReport = reports.some((r) => r.reportedAtIso.slice(0, 10) === todayIso)
  const urgency = getUrgency(hasTodayReport, hour)

  if (urgency === 'none') return null

  const copy = COPY[urgency]

  return (
    <div
      className={`${styles.banner} ${styles[urgency]}`}
      role="alert"
    >
      <span className={styles.emoji} aria-hidden>
        {copy.emoji}
      </span>
      <p className={styles.text}>{copy.text}</p>
      {urgency !== 'overdue' ? (
        <button type="button" className={styles.cta} onClick={onOpenComposer}>
          Сдать отчёт
        </button>
      ) : (
        <button type="button" className={styles.ctaOverdue} onClick={onOpenComposer}>
          Сдать сейчас
        </button>
      )}
    </div>
  )
}
