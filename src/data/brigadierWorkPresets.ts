import type { MeasurementUnitId } from '../domain/brigadierReport'

/**
 * Группа в плоском списке работ — визуальный разделитель-подзаголовок
 * между чекбоксами. Группы повторяют разделы производственного плана
 * объекта (см. domain/workPlan + data/workPlans/brusilova), чтобы
 * бригадир, отметив работу, мысленно соотносил её с строкой плана —
 * и при необходимости добирал «Привязку к плану» в блоке ниже.
 */
export type BrigadierWorkGroup = {
  readonly id: string
  readonly title: string
}

export const BRIGADIER_WORK_GROUPS: readonly BrigadierWorkGroup[] = [
  { id: 'earth', title: 'Земляные работы' },
  { id: 'curb', title: 'Бортовой и бордюрный камень' },
  { id: 'sidewalk', title: 'Тротуары и основания' },
  { id: 'asphalt', title: 'Проезжая часть и асфальт' },
  { id: 'electric', title: 'Освещение и кабель' },
  { id: 'amenity', title: 'Благоустройство и МАФ' },
  { id: 'traffic', title: 'ОДД (знаки, разметка)' },
  { id: 'resources', title: 'Ресурсы и контроль' },
] as const

export type BrigadierWorkPreset = {
  readonly id: string
  readonly title: string
  readonly defaultUnit: MeasurementUnitId
  readonly groupId: BrigadierWorkGroup['id']
}

/**
 * Плоский список типовых работ. Сгруппирован по `groupId`, но в форме
 * рендерится одной «iOS-card» — между группами офис ставит тонкий
 * подзаголовок. Порядок презетов внутри группы важен (по нему
 * сортируются выбранные строки в модале).
 *
 * Принципы выбора позиций:
 *   • покрываем все 11 разделов плана Брусилова;
 *   • не дублируем строки плана 1:1 (для этого есть «Привязка к плану»);
 *   • оставляем «общую» формулировку (например, «Установка опор НО»
 *     закрывает 8.1 и 8.4, чтобы не плодить чекбоксы).
 */
export const BRIGADIER_WORK_PRESETS: readonly BrigadierWorkPreset[] = [
  // ── Земляные работы ──────────────────────────────────────────────
  { id: 'soil-cut', title: 'Разработка грунта (механизированная)', defaultUnit: 'm3', groupId: 'earth' },
  { id: 'trough', title: 'Разработка корыта под тротуар', defaultUnit: 'm2', groupId: 'earth' },
  { id: 'trench-no', title: 'Разработка траншеи под НО', defaultUnit: 'm', groupId: 'earth' },
  { id: 'backfill', title: 'Обратная засыпка НО', defaultUnit: 'm', groupId: 'earth' },
  { id: 'utilities-cross', title: 'Пересечение / раскрытие коммуникаций', defaultUnit: 'lm', groupId: 'earth' },
  { id: 'haul-off', title: 'Вывоз грунта с площадки', defaultUnit: 'm3', groupId: 'earth' },

  // ── Бортовой и бордюрный камень ──────────────────────────────────
  { id: 'curb-concrete', title: 'Установка бортового камня (БК) — бетон', defaultUnit: 'm', groupId: 'curb' },
  { id: 'curb-granite', title: 'Установка бортового камня — гранит', defaultUnit: 'm', groupId: 'curb' },
  { id: 'curb-sidewalk', title: 'Установка тротуарного бордюра (БР)', defaultUnit: 'm', groupId: 'curb' },
  { id: 'curb-demolition', title: 'Демонтаж старого бортового камня', defaultUnit: 'm', groupId: 'curb' },

  // ── Тротуары и основания ─────────────────────────────────────────
  { id: 'sidewalk-demolition', title: 'Демонтаж покрытия тротуаров', defaultUnit: 'm2', groupId: 'sidewalk' },
  { id: 'sand-base', title: 'Устройство песчаного основания', defaultUnit: 'm2', groupId: 'sidewalk' },
  { id: 'crushed-base', title: 'Устройство щебёночного основания', defaultUnit: 'm2', groupId: 'sidewalk' },
  { id: 'pavement-tiles', title: 'Укладка тротуарной плитки', defaultUnit: 'm2', groupId: 'sidewalk' },

  // ── Проезжая часть и асфальт ─────────────────────────────────────
  { id: 'milling', title: 'Фрезерование / разборка покрытия', defaultUnit: 'm2', groupId: 'asphalt' },
  { id: 'asphalt-bottom', title: 'Укладка асфальта — нижний слой', defaultUnit: 't', groupId: 'asphalt' },
  { id: 'asphalt-top', title: 'Укладка асфальта — верхний слой', defaultUnit: 't', groupId: 'asphalt' },

  // ── Освещение и кабель ───────────────────────────────────────────
  { id: 'pipe-63', title: 'Укладка трубы 63 (НО)', defaultUnit: 'm', groupId: 'electric' },
  { id: 'pipe-110', title: 'Укладка трубы 110 (НО)', defaultUnit: 'm', groupId: 'electric' },
  { id: 'cable-conduit', title: 'Кабельная канализация (КК)', defaultUnit: 'm', groupId: 'electric' },
  { id: 'cable-laying', title: 'Прокладка кабеля', defaultUnit: 'm', groupId: 'electric' },
  { id: 'pole-demolition', title: 'Демонтаж старых опор', defaultUnit: 'pcs', groupId: 'electric' },
  { id: 'pole-installation', title: 'Установка опор (НО / КО)', defaultUnit: 'pcs', groupId: 'electric' },
  { id: 'lights-installation', title: 'Установка светильников', defaultUnit: 'pcs', groupId: 'electric' },

  // ── Благоустройство и МАФ ────────────────────────────────────────
  { id: 'lawn-grading', title: 'Газоны — планировка', defaultUnit: 'm2', groupId: 'amenity' },
  { id: 'lawn-seeding', title: 'Газоны — посев', defaultUnit: 'm2', groupId: 'amenity' },
  { id: 'green', title: 'Защита зелёных насаждений', defaultUnit: 'm2', groupId: 'amenity' },
  { id: 'amf-install', title: 'Установка МАФ (скамейки, урны, велопарковки)', defaultUnit: 'pcs', groupId: 'amenity' },
  { id: 'tactile-tiles', title: 'Тактильные плитки / ОТТ (МГН)', defaultUnit: 'pcs', groupId: 'amenity' },

  // ── ОДД ──────────────────────────────────────────────────────────
  { id: 'road-signs', title: 'Установка дорожных знаков', defaultUnit: 'pcs', groupId: 'traffic' },
  { id: 'road-marking', title: 'Дорожная разметка', defaultUnit: 'm2', groupId: 'traffic' },

  // ── Ресурсы и контроль ───────────────────────────────────────────
  { id: 'workers-count', title: 'Количество рабочих', defaultUnit: 'person', groupId: 'resources' },
  { id: 'itr-count', title: 'Количество ИТР', defaultUnit: 'person', groupId: 'resources' },
  { id: 'machinery', title: 'Количество техники', defaultUnit: 'pcs', groupId: 'resources' },
  { id: 'survey', title: 'Геодезические работы', defaultUnit: 'shift', groupId: 'resources' },
] as const

export function findBrigadierPreset(id: string): BrigadierWorkPreset | undefined {
  return BRIGADIER_WORK_PRESETS.find((p) => p.id === id)
}

/** Пресеты, сгруппированные по `groupId` — в порядке `BRIGADIER_WORK_GROUPS`. */
export function groupBrigadierPresets(): ReadonlyArray<{
  group: BrigadierWorkGroup
  items: readonly BrigadierWorkPreset[]
}> {
  return BRIGADIER_WORK_GROUPS.map((group) => ({
    group,
    items: BRIGADIER_WORK_PRESETS.filter((p) => p.groupId === group.id),
  }))
}
