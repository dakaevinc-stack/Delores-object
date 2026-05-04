import type { DailyTelegramWorkLine } from './dailyTelegramReport'

/**
 * Единицы для дорожно-инженерных работ (пригодны для сметы и полевых отчётов).
 */
export const MEASUREMENT_UNITS = [
  { id: 'lm', label: 'п.м.', note: 'погонный метр' },
  { id: 'm', label: 'м', note: 'метры' },
  { id: 'm2', label: 'м²', note: 'площадь' },
  { id: 'm3', label: 'м³', note: 'объём' },
  { id: 't', label: 'т', note: 'масса' },
  { id: 'pcs', label: 'шт.', note: 'штуки' },
  { id: 'truckload', label: 'борт', note: 'один борт самосвала (≈10–12 м³ или 18–20 т)' },
  { id: 'person', label: 'чел.', note: 'человек' },
  { id: 'machine_h', label: 'маш.-ч', note: 'машино-часы' },
  { id: 'shift', label: 'смена', note: 'учёт смен' },
] as const

export type MeasurementUnitId = (typeof MEASUREMENT_UNITS)[number]['id']

export function unitLabel(id: MeasurementUnitId): string {
  return MEASUREMENT_UNITS.find((u) => u.id === id)?.label ?? id
}

export type BrigadierCriterionDraft = {
  id: string
  title: string
  quantity: string
  unitId: MeasurementUnitId
  /** Если выбран шаблон из справочника — id пресета; иначе null (ручной ввод) */
  presetId: string | null
}

export type BrigadierAttachmentDraft = {
  id: string
  kind: 'photo' | 'video'
  file: File
  previewUrl: string
  /** Момент добавления в форму (фиксируем автоматически) */
  registeredAtIso: string
  /** Метка времени из файла (если браузер отдаёт) */
  fileModifiedIso: string
}

/** Типы проблем / замечаний, адресуемых бригадиру (полевой отчёт). */
export const BRIGADIER_PROBLEM_KINDS = [
  { id: 'equipment', label: 'Техника / механизация' },
  { id: 'materials', label: 'Материалы / склад' },
  { id: 'personnel', label: 'Кадры / персонал' },
  { id: 'safety', label: 'Охрана труда / безопасность' },
  { id: 'permits', label: 'Согласования / документы' },
  { id: 'logistics', label: 'Логистика / подъезд' },
  { id: 'weather', label: 'Погода / условия' },
  { id: 'subcontractors', label: 'Смежники / подряд' },
  { id: 'quality', label: 'Качество / дефекты' },
  { id: 'other', label: 'Прочее' },
] as const

export type BrigadierProblemKindId = (typeof BRIGADIER_PROBLEM_KINDS)[number]['id']

export function brigadierProblemKindLabel(id: BrigadierProblemKindId): string {
  return BRIGADIER_PROBLEM_KINDS.find((k) => k.id === id)?.label ?? id
}

export type BrigadierProblemDraft = {
  id: string
  kindId: BrigadierProblemKindId
  details: string
}

export type BrigadierStoredProblem = {
  kindId: BrigadierProblemKindId
  details: string
}

export type BrigadierStoredAttachment = {
  id: string
  kind: 'photo' | 'video'
  name: string
  /** data: URL после сохранения или blob: во время ввода */
  previewUrl: string
  registeredAtIso: string
  fileModifiedIso: string
  /** Файл не поместился в локальное хранилище браузера */
  notPersisted?: boolean
}

export type BrigadierStoredReport = {
  id: string
  siteId: string
  reportedAtIso: string
  lines: readonly DailyTelegramWorkLine[]
  /** Структурированные проблемы; дублируются в `lines` при сохранении. */
  problems: readonly BrigadierStoredProblem[]
  responsible: string
  /** Свободный комментарий к отчёту (текст). */
  comment: string
  attachments: readonly BrigadierStoredAttachment[]
}
