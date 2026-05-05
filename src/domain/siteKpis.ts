import { summarizeWorkPlan, type WorkPlan } from './workPlan'

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
