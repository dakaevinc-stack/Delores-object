import type { MeasurementUnitId } from '../domain/brigadierReport'

export type BrigadierWorkPreset = {
  id: string
  title: string
  defaultUnit: MeasurementUnitId
}

/** Единый плоский список типовых работ — без подгрупп. */
export const BRIGADIER_WORK_PRESETS: readonly BrigadierWorkPreset[] = [
  { id: 'trench-no', title: 'Разработка траншеи под НО', defaultUnit: 'm' },
  { id: 'pipe-63', title: 'Укл 63й трубы', defaultUnit: 'm' },
  { id: 'pipe-110', title: 'Укл 110й трубы', defaultUnit: 'm' },
  { id: 'trough', title: 'Разработка корыта под тротуар', defaultUnit: 'm2' },
  { id: 'green', title: 'Защита зеленных насаждений + установка', defaultUnit: 'm2' },
  { id: 'backfill', title: 'Обратная засыпка НО', defaultUnit: 'm' },
  { id: 'survey', title: 'Геодезические работы', defaultUnit: 'shift' },
  { id: 'workers-count', title: 'Количество рабочих', defaultUnit: 'person' },
  { id: 'itr-count', title: 'Количество ИТР', defaultUnit: 'person' },
  { id: 'machinery', title: 'Количество техники', defaultUnit: 'pcs' },
  { id: 'soil-cut', title: 'Разработка грунта (механизированная)', defaultUnit: 'm3' },
  { id: 'sand-base', title: 'Устройство песчаного основания', defaultUnit: 'm3' },
  { id: 'asphalt-lay', title: 'Укладка асфальтобетонного покрытия', defaultUnit: 't' },
  {
    id: 'utilities-cross',
    title: 'Пересечение / раскрытие существующих коммуникаций',
    defaultUnit: 'lm',
  },
  { id: 'haul-off', title: 'Вывоз грунта с площадки', defaultUnit: 'm3' },
] as const

export function findBrigadierPreset(id: string): BrigadierWorkPreset | undefined {
  return BRIGADIER_WORK_PRESETS.find((p) => p.id === id)
}
