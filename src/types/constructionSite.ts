/**
 * Статус объекта на дашборде руководителя.
 * Визуально: зелёный / жёлтый / красный.
 */
export type SiteStatus = 'normal' | 'attention' | 'critical'

/**
 * Снимок этапа: основа для план/факт и будущего автоматического статуса.
 * Позже значения будут приходить из учёта работ; сейчас — mock.
 */
export interface WorkStageSnapshot {
  id: string
  name: string
  /** Плановая готовность этапа, % */
  planPercent: number
  /** Фактическая готовность этапа, % */
  factPercent: number
}

/**
 * Управленческий срез по объекту для главного экрана.
 * Отдельно от «внутренних критериев» — это агрегированные цифры для обзора.
 */
export interface SiteExecutiveSnapshot {
  /** Плановый прогресс по объекту, % */
  planPercent: number
  /** Фактический прогресс по объекту, % */
  factPercent: number
  /** Краткая причина / зона внимания для карточки */
  summaryLine: string
  /** Есть открытые риски по объекту (для акцентов и будущей логики) */
  hasOpenRisks: boolean
  /** Этапы для drill-down и блока проблемных зон */
  stages: readonly WorkStageSnapshot[]
}

/**
 * Расширяемая модель «здоровья» объекта под будущий расчёт статуса:
 * критерии, показатели, сроки и т.д.
 * Поля опциональны, пока не подключён backend.
 */
export interface SiteHealthInputs {
  indicators?: readonly unknown[]
  criteria?: readonly unknown[]
  planFact?: readonly unknown[]
  deadlines?: readonly unknown[]
  risks?: readonly unknown[]
  reporting?: readonly unknown[]
}

/**
 * Плановая команда и техника на площадке.
 * Заполняется при создании объекта; далее сравнивается с фактическими
 * значениями из ежедневных сводок.
 */
export interface SitePlannedCrew {
  workers?: number
  itr?: number
  equipment?: number
}

/**
 * Критерий/объём работ, заданный при создании объекта (план).
 * Единая форма для любых типов работ.
 */
export interface SiteCriterionInput {
  id: string
  name: string
  unit: string
  planUnits: number
}

export interface ConstructionSite extends SiteHealthInputs {
  id: string
  name: string
  /**
   * Статус для UI. Сейчас задаётся в mock; позже — результат `evaluateSiteStatus(site)`.
   */
  status: SiteStatus
  executive: SiteExecutiveSnapshot

  /** Необязательные поля, заполняемые при создании объекта пользователем. */
  address?: string
  customer?: string
  startDateIso?: string
  endDateIso?: string
  responsibleFio?: string
  plannedCrew?: SitePlannedCrew
  telegramChatHandle?: string
  criteriaDefinitions?: readonly SiteCriterionInput[]
  templateId?: string
  createdAtIso?: string
  isUserCreated?: boolean
}
