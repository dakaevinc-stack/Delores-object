import type { BrigadierStoredReport } from './brigadierReport'
import {
  applyWorkEntriesToPlan,
  summarizeWorkPlan,
  type WorkPlan,
} from './workPlan'

/**
 * KPI по объекту, посчитанный «вживую» из реальных данных:
 * — факт берём из агрегата производственного плана (он сам уже учитывает
 *   фактовые отчёты бригадира через `applyWorkEntriesToPlan`);
 * — план на дату — это календарная доля периода `start..end`, прошедшая
 *   к сегодняшнему дню (линейная интерполяция).
 *
 * Сравнивая факт с этой долей, мы получаем единый процент отклонения,
 * который не зависит от единиц измерения отдельных позиций.
 */

export type SiteLiveKpisStatus =
  | 'not_started'
  | 'normal'
  | 'attention'
  | 'critical'
  | 'finished'

export type SiteLiveKpis = {
  /** Средний процент готовности по всем активным позициям плана. */
  factPercent: number
  /** Целевой прогресс на сегодня (доля прошедшего срока, 0..100). */
  planToDatePercent: number
  /** plan − fact, п.п. Положительное — отстаём, отрицательное — опережаем. */
  deviationPercent: number
  startIso: string
  endIso: string
  todayIso: string
  /** Полная длительность периода, дней. */
  daysTotal: number
  /** Сколько дней прошло от старта до сегодня (>= 0). */
  daysSinceStart: number
  /** Сколько дней осталось до конца (>= 0). */
  daysToCompletion: number
  /** Сколько срока пройдено к сегодня, % (та же величина, что и planToDatePercent, но без округления для шкал). */
  scheduleProgressPercent: number
  status: SiteLiveKpisStatus
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  // Считаем дни строго в UTC, чтобы не ловить смену часового пояса
  // в крайних точках периода (полночь по Europe/Moscow).
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  )
  return Math.round((b - a) / 86400000)
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function todayIsoMsk(): string {
  // UI ориентирован на московскую стройку: счётчик дней должен
  // переключаться по местному времени, а не по UTC.
  const now = new Date()
  const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60_000)
  return msk.toISOString().slice(0, 10)
}

export function computeSiteLiveKpis(
  plan: WorkPlan | null,
  startIso: string,
  endIso: string,
  todayIso: string,
): SiteLiveKpis {
  const total = Math.max(1, diffDaysIso(startIso, endIso))
  const sinceRaw = diffDaysIso(startIso, todayIso)
  const remainingRaw = diffDaysIso(todayIso, endIso)
  const since = Math.max(0, Math.min(total, sinceRaw))
  const remaining = Math.max(0, remainingRaw)
  const sched = clampPct((since / total) * 100)

  const fact = plan ? summarizeWorkPlan(plan).averagePercent : 0

  let status: SiteLiveKpisStatus
  if (sinceRaw <= 0 && remainingRaw > 0) {
    status = 'not_started'
  } else if (remainingRaw <= 0) {
    status = 'finished'
  } else {
    const dev = sched - fact
    if (dev >= 12) status = 'critical'
    else if (dev >= 5) status = 'attention'
    else status = 'normal'
  }

  return {
    factPercent: round1(fact),
    planToDatePercent: round1(sched),
    deviationPercent: round1(sched - fact),
    startIso,
    endIso,
    todayIso,
    daysTotal: total,
    daysSinceStart: since,
    daysToCompletion: remaining,
    scheduleProgressPercent: sched,
    status,
  }
}

const DAYS_FORMS: readonly [string, string, string] = ['день', 'дня', 'дней']

export function pluralizeDays(n: number): string {
  const m10 = Math.abs(n) % 10
  const m100 = Math.abs(n) % 100
  if (m10 === 1 && m100 !== 11) return DAYS_FORMS[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return DAYS_FORMS[1]
  return DAYS_FORMS[2]
}

export type ScheduleCurvePoint = {
  /** ISO даты этой точки (YYYY-MM-DD). */
  dateIso: string
  /** Подпись для оси X (короткая). */
  label: string
  /** Плановый процент к этой дате (линейный календарный график), 0..100. */
  planPercent: number
  /**
   * Накопительный фактический процент к этой дате. `null` означает,
   * что точка лежит в будущем относительно сегодня — линию факта
   * мы туда не тянем, чтобы не врать.
   */
  factPercent: number | null
}

/**
 * Возвращает компактные подписи для оси X: «17 апр.», «28 мая» и т.д.
 */
const SHORT_LABEL_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
})

function formatShortLabel(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  if (!y || !m || !d) return iso
  return SHORT_LABEL_FMT.format(new Date(Date.UTC(y, m - 1, d)))
}

/**
 * Строит кривую «План vs Факт» для горизонта объекта.
 *
 * — Плановая кривая: линейный календарный график 0% (start) → 100% (end).
 * — Фактическая кривая: накопительный средний процент готовности позиций
 *   плана после применения всех отчётов бригадира на дату этой точки.
 *
 * Точки кривой расставляются равномерно по горизонту проекта (≈9 шагов),
 * к ним добавляются даты реальных отчётов и «сегодня» — чтобы кривая
 * факта пересчитывалась именно на тех днях, когда она менялась.
 */
export function buildScheduleCurve(
  basePlan: WorkPlan | null,
  reports: readonly BrigadierStoredReport[],
  startIso: string,
  endIso: string,
  todayIso: string,
): readonly ScheduleCurvePoint[] {
  const total = Math.max(1, diffDaysIso(startIso, endIso))

  const dates = new Set<string>([startIso, endIso, todayIso])
  // Равномерные опорные точки — чтобы кривая плана выглядела гладко
  // даже без событий внутри периода.
  const STEPS = 9
  for (let i = 1; i < STEPS; i += 1) {
    const offset = Math.round((total / STEPS) * i)
    dates.add(addDaysIso(startIso, offset))
  }
  // Даты реальных отчётов — это «реперы» фактической кривой.
  for (const r of reports) {
    const iso = r.reportedAtIso.slice(0, 10)
    if (iso) dates.add(iso)
  }

  const sortedReports = [...reports].sort((a, b) =>
    a.reportedAtIso.localeCompare(b.reportedAtIso),
  )

  const sorted = [...dates]
    .filter((iso) => iso >= startIso && iso <= endIso)
    .sort((a, b) => a.localeCompare(b))

  return sorted.map((dateIso) => {
    const sinceStart = Math.max(0, Math.min(total, diffDaysIso(startIso, dateIso)))
    const planPercent = clampPct((sinceStart / total) * 100)

    let factPercent: number | null = null
    if (dateIso <= todayIso && basePlan) {
      // Берём отчёты строго до этой даты включительно и применяем
      // их к чистому плану — это даёт честный «накопленный факт».
      const upto = sortedReports.filter(
        (r) => r.reportedAtIso.slice(0, 10) <= dateIso,
      )
      const planAt = applyWorkEntriesToPlan(basePlan, upto)
      factPercent = round1(summarizeWorkPlan(planAt).averagePercent)
    }

    return {
      dateIso,
      label: formatShortLabel(dateIso),
      planPercent: round1(planPercent),
      factPercent,
    }
  })
}

function addDaysIso(iso: string, days: number): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
