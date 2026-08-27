import { useEffect, useState } from 'react'
import type { BrigadierStoredReport } from '../../domain/brigadierReport'
import styles from './ReportDeadlineBanner.module.css'

type Props = {
  reports: readonly BrigadierStoredReport[]
  todayIso: string
  /** Внутри hero объекта — компактная полоска, без отдельного блока на странице. */
  embedded?: boolean
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

const COPY: Record<Exclude<Urgency, 'none'>, { short: string; full: string }> = {
  reminder: {
    short: 'Отчёт за сегодня ещё не сдан',
    full: 'Отчёт за сегодня ещё не сдан. До конца смены осталось несколько часов.',
  },
  warning: {
    short: 'Меньше часа до сдачи отчёта',
    full: 'Отчёт за сегодня не сдан. Остался меньше часа!',
  },
  overdue: {
    short: 'Отчёт просрочен',
    full: 'Отчёт просрочен. Руководитель уведомлён.',
  },
}

export function ReportDeadlineBanner({
  reports,
  todayIso,
  embedded = false,
}: Props) {
  const [hour, setHour] = useState(mskHour)

  useEffect(() => {
    const t = window.setInterval(() => setHour(mskHour()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const hasTodayReport = reports.some((r) => r.reportedAtIso.slice(0, 10) === todayIso)
  const urgency = getUrgency(hasTodayReport, hour)

  if (urgency === 'none') return null

  const copy = COPY[urgency]
  const text = embedded ? copy.short : copy.full

  return (
    <div
      className={[
        embedded ? styles.inline : styles.banner,
        styles[urgency],
      ].join(' ')}
      role="alert"
    >
      <span className={styles.pulse} aria-hidden />
      <p className={styles.text}>{text}</p>
    </div>
  )
}
