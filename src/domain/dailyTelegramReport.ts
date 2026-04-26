/**
 * Суточная сводка «как в Telegram»: список выполненных работ + ресурсы + ответственный.
 * Позже строки можно парсить из текста бота или хранить уже структурированными в БД.
 */
export type DailyTelegramWorkLine = {
  /** Порядковый номер в отчёте (1, 2, …) */
  index: number
  /** Текст пункта целиком, как в сообщении */
  text: string
}

export type DailyTelegramReport = {
  id: string
  /** Стабильный ключ объекта из `ConstructionSite.id` */
  siteId: string
  /** Порядок в ленте (меньше = раньше в примере переписки) */
  sequence: number
  /** Если из Telegram приходит дата — подставляется; иначе опционально */
  reportedAtIso?: string
  lines: readonly DailyTelegramWorkLine[]
  workers: number
  itr: number
  equipmentUnits: number
  responsible: string
}
