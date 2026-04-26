import type { SiteStatus } from '../types/constructionSite'

/**
 * Управленческий срез страницы объекта.
 * Сейчас заполняется mock-резолвером; позже — из API / расчётного слоя
 * (критерии из сметы и суточных отчётов, сроки из графика, риски из реестра).
 */
export type WorkCriterionKind =
  | 'curb'
  | 'pipes'
  | 'gravel'
  | 'sand'
  | 'asphalt'

export type SiteDetailCriterion = {
  /**
   * Либо один из системных типов (`WorkCriterionKind`),
   * либо произвольный ключ для пользовательских критериев из формы создания объекта.
   */
  id: WorkCriterionKind | string
  name: string
  /** Условные единицы объёма (м, м³, т) — для UI; позже явная единица из нормативов */
  planUnits: number
  factUnits: number
  /** factUnits − planUnits */
  deviationUnits: number
  /** Доля выполнения по критерию, % */
  completionPercent: number
  status: SiteStatus
  /** Краткий комментарий при отклонении */
  lagReason?: string
}

export type ScheduleTrend = 'improving' | 'flat' | 'worsening'

export type ScheduleCurvePoint = {
  label: string
  planAlongTime: number
  factAlongTime: number
}

export type SiteDetailKpis = {
  completionPercent: number
  planToDatePercent: number
  factToDatePercent: number
  /** План − факт, п.п. */
  deviationPoints: number
  startDateIso: string
  endDateIso: string
  daysToCompletion: number
  openIssuesCount: number
  deadlineStatus: SiteStatus
  deadlineLabel: string
}

export type SiteDetailSchedule = {
  onTrack: boolean
  planProgressAlongTime: number
  factProgressAlongTime: number
  trend: ScheduleTrend
  narrative: string
  curve: readonly ScheduleCurvePoint[]
  timelineStatus: SiteStatus
}

export type SiteDetailReporting = {
  dailyReportSubmitted: boolean
  photoReportUploaded: boolean
  videoReportUploaded: boolean
  foremanCommentPresent: boolean
  problemFlagsCount: number
}

export type SiteRiskCategory =
  | 'critical_notice'
  | 'equipment'
  | 'materials'
  | 'idle'
  | 'weather'
  | 'breakdown_org'

export type SiteRiskRow = {
  id: string
  category: SiteRiskCategory
  title: string
  active: boolean
  severity: SiteStatus
}

export type SiteDetailMeta = {
  objectCode: string
  addressNote?: string
}

export type SiteDetailDashboard = {
  meta: SiteDetailMeta
  /** Краткая причина текущего общего статуса (для шапки) */
  statusReason: string
  kpis: SiteDetailKpis
  criteria: readonly SiteDetailCriterion[]
  schedule: SiteDetailSchedule
  reporting: SiteDetailReporting
  risks: readonly SiteRiskRow[]
}
