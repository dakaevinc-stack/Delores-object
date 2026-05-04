import type { BrigadierStoredReport, MeasurementUnitId } from './brigadierReport'

/**
 * Производственный план объекта — то, что в офисе ведут как
 * «справку по объекту» в Excel: разделы (бортовой камень, тротуары,
 * проезжая часть, освещение, ОДД и т.д.), внутри — строки работ с
 * планом, фактом, остатком, % выполнения и сроками.
 *
 * Модель сделана как «снимок» — план копируется в систему и хранится
 * как `WorkPlan` с датой `asOfIso`. Это нужно, чтобы видеть, как план
 * выглядел на конкретную дату (для аудита и отчётов). Когда офис
 * обновит цифры — приходит новый снимок, прежний остаётся в истории.
 *
 * Все денежные / объёмные значения — числа, без единиц в самом числе:
 * единица отдельно в `unit`. Так сохраняется возможность машинного
 * сложения остатков по похожим работам и удобный экспорт.
 */

export type WorkPlanItem = {
  /** «1.1», «11.8» — как в исходной справке. */
  readonly number: string
  readonly title: string
  readonly unit: MeasurementUnitId
  /** План — объём по проекту. */
  readonly total: number
  /** Факт — выполнено к моменту снятия снимка. */
  readonly done: number
  /**
   * Дата начала по графику (ISO без времени, например '2025-05-01').
   * null — срок не задан в исходнике (в Excel это «31/12/29», условный пик).
   */
  readonly startIso: string | null
  /** Дата окончания по графику. null — не задан. */
  readonly endIso: string | null
}

export type WorkPlanSection = {
  /** «1», «2», «11» — номер раздела в исходной справке. */
  readonly number: string
  readonly title: string
  readonly items: readonly WorkPlanItem[]
}

export type WorkPlan = {
  readonly siteId: string
  readonly siteName: string
  /** Дата снятия справки (ISO date-time) — кому отправлен снимок. */
  readonly asOfIso: string
  readonly sections: readonly WorkPlanSection[]
}

/* ─── Утилиты ──────────────────────────────────────────────────────── */

/** Парсит «1/5/25» → '2025-05-01'. «31/12/29» интерпретируется как «нет даты». */
export function parseRussianShortDate(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  const m = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += 2000
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12
  ) {
    return null
  }
  // 31/12/29 — условный «нулевой» срок в исходниках. Считаем «не задан».
  if (year === 2029 && month === 12 && day === 31) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Доля выполнения [0, 100]; 0 если плана нет (предотвращает деление на 0). */
export function workItemPercent(item: WorkPlanItem): number {
  if (!Number.isFinite(item.total) || item.total <= 0) return 0
  const ratio = item.done / item.total
  if (!Number.isFinite(ratio)) return 0
  return Math.max(0, Math.min(100, ratio * 100))
}

/** «Активная» — есть план, есть сроки. То, что бригадир реально должен сделать. */
export function isItemScheduled(item: WorkPlanItem): boolean {
  return item.total > 0 && (item.startIso !== null || item.endIso !== null)
}

/** «Резервная» — позиция в реестре, но без объёма и/или сроков. */
export function isItemDeferred(item: WorkPlanItem): boolean {
  if (item.total <= 0) return true
  return item.startIso === null && item.endIso === null
}

export type WorkPlanSummary = {
  readonly sectionsCount: number
  readonly itemsCount: number
  /** Активные позиции — с объёмом и/или сроками. */
  readonly scheduledCount: number
  /** Завершённые (done >= total и оба больше нуля). */
  readonly completedCount: number
  /** Без срока — позиции в реестре, но не привязанные к графику. */
  readonly deferredCount: number
  /** Самая ранняя дата начала среди активных (ISO date) — или null. */
  readonly earliestStartIso: string | null
  /** Самая поздняя дата окончания (ISO date) — или null. */
  readonly latestEndIso: string | null
  /**
   * Средний % по активным позициям — простое среднее, без весов.
   * Это нужно, чтобы шапка показывала «приблизительный» прогресс.
   * Для точного веса понадобится единая стоимость, которой у нас нет.
   */
  readonly averagePercent: number
}

export function summarizeWorkPlan(plan: WorkPlan): WorkPlanSummary {
  const items = plan.sections.flatMap((s) => s.items)
  const scheduled = items.filter(isItemScheduled)
  const deferred = items.filter(isItemDeferred)

  const completed = items.filter((it) => it.total > 0 && it.done >= it.total)

  const startTs = scheduled
    .map((it) => it.startIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))

  const endTs = scheduled
    .map((it) => it.endIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))

  const sumPercent = scheduled.reduce((acc, it) => acc + workItemPercent(it), 0)
  const avg = scheduled.length === 0 ? 0 : sumPercent / scheduled.length

  return {
    sectionsCount: plan.sections.length,
    itemsCount: items.length,
    scheduledCount: scheduled.length,
    completedCount: completed.length,
    deferredCount: deferred.length,
    earliestStartIso:
      startTs.length === 0 ? null : new Date(Math.min(...startTs)).toISOString().slice(0, 10),
    latestEndIso:
      endTs.length === 0 ? null : new Date(Math.max(...endTs)).toISOString().slice(0, 10),
    averagePercent: Math.round(avg * 10) / 10,
  }
}

/** Сводка по разделу — для шапки аккордеона. */
export type WorkPlanSectionSummary = {
  readonly itemsCount: number
  readonly scheduledCount: number
  readonly deferredCount: number
  readonly averagePercent: number
  readonly earliestStartIso: string | null
  readonly latestEndIso: string | null
}

export function summarizeWorkPlanSection(section: WorkPlanSection): WorkPlanSectionSummary {
  const scheduled = section.items.filter(isItemScheduled)
  const deferred = section.items.filter(isItemDeferred)

  const startTs = scheduled
    .map((it) => it.startIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))
  const endTs = scheduled
    .map((it) => it.endIso)
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))

  const sumPercent = scheduled.reduce((acc, it) => acc + workItemPercent(it), 0)
  const avg = scheduled.length === 0 ? 0 : sumPercent / scheduled.length

  return {
    itemsCount: section.items.length,
    scheduledCount: scheduled.length,
    deferredCount: deferred.length,
    averagePercent: Math.round(avg * 10) / 10,
    earliestStartIso:
      startTs.length === 0 ? null : new Date(Math.min(...startTs)).toISOString().slice(0, 10),
    latestEndIso:
      endTs.length === 0 ? null : new Date(Math.max(...endTs)).toISOString().slice(0, 10),
  }
}

/* ─── Форматирование ───────────────────────────────────────────────── */

const NUM_FMT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return NUM_FMT.format(value)
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return SHORT_DATE_FMT.format(d)
}

/** «1.5–3.7.2025» / «без срока» / «—» — для шапки строки. */
export function formatPeriod(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  const s = formatShortDate(startIso)
  const e = formatShortDate(endIso)
  if (!s && !e) return 'без срока'
  if (s && e) return s === e ? s : `${s} — ${e}`
  return s ?? e ?? '—'
}

/** Длительность в днях (включительно) или null. */
export function durationDays(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  if (!startIso || !endIso) return null
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 86_400_000) + 1
}

/* ─── Слияние плана с фактом из бригадирских отчётов ────────────────── */

/**
 * Накопленный факт по строке плана: суммарный объём из всех бригадирских
 * привязок плюс дата последнего обновления (ISO) — для отображения
 * «обновлено N <дата>».
 */
export type PlanItemFactAccumulator = {
  /** Сумма qty из workEntries (в единицах строки плана). */
  readonly qtyAdded: number
  /** Сколько привязок в сумме (для подсчёта «N записей»). */
  readonly entriesCount: number
  /** Самая свежая дата отчёта, в котором есть привязка к этой строке. */
  readonly lastReportedAtIso: string | null
}

/**
 * Считает по каждому `planNumber`, сколько суммарно сделано (`qtyAdded`)
 * и когда последний раз отчитывались. Учитывает только отчёты по
 * `siteId` плана.
 *
 * Если бригадир ввёл объём в чужой единице — мы всё равно складываем
 * как есть. Это сознательное упрощение: офис увидит несоответствие в
 * UI (рядом со строкой плана будет «странная» цифра) и поправит вручную.
 * Альтернатива — конвертация — требует таблицы плотностей и в полевых
 * условиях ошибается чаще, чем помогает.
 */
export function computePlanFactFromReports(
  plan: WorkPlan,
  reports: readonly BrigadierStoredReport[],
): ReadonlyMap<string, PlanItemFactAccumulator> {
  const acc = new Map<string, { qtyAdded: number; entriesCount: number; lastReportedAtIso: string | null }>()
  for (const r of reports) {
    if (r.siteId !== plan.siteId) continue
    const entries = r.workEntries
    if (!entries || entries.length === 0) continue
    for (const e of entries) {
      const num = e.planNumber.trim()
      if (!num) continue
      const qty = Number.isFinite(e.qty) ? e.qty : 0
      const prev = acc.get(num)
      if (!prev) {
        acc.set(num, {
          qtyAdded: qty,
          entriesCount: 1,
          lastReportedAtIso: r.reportedAtIso ?? null,
        })
        continue
      }
      const prevTs = prev.lastReportedAtIso ? new Date(prev.lastReportedAtIso).getTime() : 0
      const curTs = r.reportedAtIso ? new Date(r.reportedAtIso).getTime() : 0
      acc.set(num, {
        qtyAdded: prev.qtyAdded + qty,
        entriesCount: prev.entriesCount + 1,
        lastReportedAtIso:
          curTs > prevTs ? (r.reportedAtIso ?? prev.lastReportedAtIso) : prev.lastReportedAtIso,
      })
    }
  }
  return acc
}

/**
 * Возвращает копию плана, где `done` каждой строки увеличен на
 * соответствующую сумму из бригадирских отчётов. Базовое значение
 * `done` из снимка сохраняется (его офис мог проставить вручную) —
 * фактический прирост из отчётов добавляется сверху.
 *
 * Структура `WorkPlan` иммутабельна (readonly), поэтому возвращается
 * новый объект; исходный план остаётся как «снимок из Excel».
 */
export function applyWorkEntriesToPlan(
  plan: WorkPlan,
  reports: readonly BrigadierStoredReport[],
): WorkPlan {
  const factByNumber = computePlanFactFromReports(plan, reports)
  if (factByNumber.size === 0) return plan
  return {
    ...plan,
    sections: plan.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const fact = factByNumber.get(item.number)
        if (!fact) return item
        return {
          ...item,
          done: item.done + fact.qtyAdded,
        }
      }),
    })),
  }
}
