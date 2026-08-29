/** Расчёт объёма/массы по площади заливки (м²) и толщине слоя (см). */

/**
 * Виды асфальта и ориентировочная плотность уплотнённой смеси, т/м³
 * (типовые значения для сметного/заказного расчёта).
 */
export const ASPHALT_MIXES = [
  { id: 'sand', label: 'Песчаный', densityTPerM3: 2.35 },
  { id: 'fine', label: 'Мелкозернистый', densityTPerM3: 2.39 },
  { id: 'coarse', label: 'Крупнозернистый', densityTPerM3: 2.41 },
  { id: 'sma15', label: 'ЩМА-15', densityTPerM3: 2.49 },
  { id: 'sma20', label: 'ЩМА-20', densityTPerM3: 2.52 },
] as const

export type AsphaltMixId = (typeof ASPHALT_MIXES)[number]['id']
export const DEFAULT_ASPHALT_BINDER_MIX: AsphaltMixId = 'coarse'
export const DEFAULT_ASPHALT_WEARING_MIX: AsphaltMixId = 'fine'
/** @deprecated используйте плотность выбранного вида */
export const DEFAULT_ASPHALT_DENSITY_T_PER_M3 = 2.4

export function asphaltMixById(id: AsphaltMixId) {
  return ASPHALT_MIXES.find((m) => m.id === id) ?? ASPHALT_MIXES[1]
}

export type AsphaltLayerInput = {
  /** Толщина чернового слоя, см */
  binderCm: number
  /** Толщина чистового слоя, см */
  wearingCm: number
  /** Вид смеси чернового слоя */
  binderMixId?: AsphaltMixId
  /** Вид смеси чистового слоя */
  wearingMixId?: AsphaltMixId
  /** Плотность, т/м³ (если задана — перекрывает вид) */
  densityTPerM3?: number
}

export type AsphaltOrderResult = {
  areaM2: number
  binderCm: number
  wearingCm: number
  totalCm: number
  binderMixId: AsphaltMixId
  wearingMixId: AsphaltMixId
  binderMixLabel: string
  wearingMixLabel: string
  binderDensityTPerM3: number
  wearingDensityTPerM3: number
  /** Средняя плотность по объёму (для справки). */
  densityTPerM3: number
  binderVolumeM3: number
  wearingVolumeM3: number
  totalVolumeM3: number
  binderTons: number
  wearingTons: number
  totalTons: number
}

export type SoilOrderResult = {
  areaM2: number
  thicknessCm: number
  volumeM3: number
}

function cmToMeters(cm: number): number {
  return Math.max(0, cm) / 100
}

function volumeFromArea(areaM2: number, thicknessCm: number): number {
  return Math.max(0, areaM2) * cmToMeters(thicknessCm)
}

/** Асфальт: сначала черновой, затем чистовой. V = S × h; масса = V × ρ вида. */
export function calcAsphaltOrder(
  areaM2: number,
  input: AsphaltLayerInput,
): AsphaltOrderResult {
  const binderCm = Math.max(0, input.binderCm)
  const wearingCm = Math.max(0, input.wearingCm)
  const binderMix = asphaltMixById(input.binderMixId ?? DEFAULT_ASPHALT_BINDER_MIX)
  const wearingMix = asphaltMixById(input.wearingMixId ?? DEFAULT_ASPHALT_WEARING_MIX)
  const overrideDensity =
    input.densityTPerM3 != null && input.densityTPerM3 > 0 ? input.densityTPerM3 : null
  const binderDensityTPerM3 = overrideDensity ?? binderMix.densityTPerM3
  const wearingDensityTPerM3 = overrideDensity ?? wearingMix.densityTPerM3
  const binderVolumeM3 = volumeFromArea(areaM2, binderCm)
  const wearingVolumeM3 = volumeFromArea(areaM2, wearingCm)
  const totalVolumeM3 = binderVolumeM3 + wearingVolumeM3
  const binderTons = binderVolumeM3 * binderDensityTPerM3
  const wearingTons = wearingVolumeM3 * wearingDensityTPerM3
  const totalTons = binderTons + wearingTons
  const densityTPerM3 =
    totalVolumeM3 > 0 ? totalTons / totalVolumeM3 : binderDensityTPerM3
  return {
    areaM2: Math.max(0, areaM2),
    binderCm,
    wearingCm,
    totalCm: binderCm + wearingCm,
    binderMixId: binderMix.id,
    wearingMixId: wearingMix.id,
    binderMixLabel: binderMix.label,
    wearingMixLabel: wearingMix.label,
    binderDensityTPerM3,
    wearingDensityTPerM3,
    densityTPerM3,
    binderVolumeM3,
    wearingVolumeM3,
    totalVolumeM3,
    binderTons,
    wearingTons,
    totalTons,
  }
}

/** Грунт под газон: V = S × h. */
export function calcSoilOrder(areaM2: number, thicknessCm: number): SoilOrderResult {
  const thickness = Math.max(0, thicknessCm)
  return {
    areaM2: Math.max(0, areaM2),
    thicknessCm: thickness,
    volumeM3: volumeFromArea(areaM2, thickness),
  }
}

/** Толщина слоя щебня/песка в форме заказа, см. */
export const LAYER_THICKNESS_CM_MIN = 5
export const LAYER_THICKNESS_CM_MAX = 100
export const DEFAULT_LAYER_THICKNESS_CM = 20

export function clampLayerThicknessCm(cm: number): number {
  if (!Number.isFinite(cm)) return DEFAULT_LAYER_THICKNESS_CM
  return Math.min(LAYER_THICKNESS_CM_MAX, Math.max(LAYER_THICKNESS_CM_MIN, cm))
}

/** Фракции щебня для заказа. */
export const CRUSHED_STONE_FRACTIONS = ['5/20', '20/40', '40/70'] as const
export type CrushedStoneFraction = (typeof CRUSHED_STONE_FRACTIONS)[number]
export const DEFAULT_CRUSHED_STONE_FRACTION: CrushedStoneFraction = '20/40'

export type CrushedStoneOrderResult = {
  areaM2: number
  thicknessCm: number
  volumeM3: number
  fraction: CrushedStoneFraction
}

export type SandOrderResult = {
  areaM2: number
  thicknessCm: number
  volumeM3: number
}

/** Щебень: V = S × h. */
export function calcCrushedStoneOrder(
  areaM2: number,
  thicknessCm: number,
  fraction: CrushedStoneFraction = DEFAULT_CRUSHED_STONE_FRACTION,
): CrushedStoneOrderResult {
  const thickness = clampLayerThicknessCm(thicknessCm)
  return {
    areaM2: Math.max(0, areaM2),
    thicknessCm: thickness,
    volumeM3: volumeFromArea(areaM2, thickness),
    fraction,
  }
}

/** Песок: V = S × h. */
export function calcSandOrder(areaM2: number, thicknessCm: number): SandOrderResult {
  const thickness = clampLayerThicknessCm(thicknessCm)
  return {
    areaM2: Math.max(0, areaM2),
    thicknessCm: thickness,
    volumeM3: volumeFromArea(areaM2, thickness),
  }
}

/** Норма бетона на 100 п.м. бордюра при замке 10 см (объём не зависит от марки). */
export const CURB_CONCRETE_M3_PER_100M_AT_10CM = { min: 6, max: 6.5 } as const
export const DEFAULT_CURB_LOCK_CM = 10

/** Основные марки бетона в дорожно-благоустроительных работах. */
export const CONCRETE_GRADES = ['B15', 'B20', 'B22,5', 'B25', 'B30'] as const
export type ConcreteGrade = (typeof CONCRETE_GRADES)[number]
export const DEFAULT_CONCRETE_GRADE: ConcreteGrade = 'B15'

export type CurbConcreteOrderResult = {
  lengthM: number
  lockCm: number
  /** Кубы на 100 п.м. при заданном замке (пересчёт от нормы на 10 см). */
  m3Per100MMin: number
  m3Per100MMax: number
  volumeM3Min: number
  volumeM3Max: number
  /** Среднее для ориентира заказа. */
  volumeM3Mid: number
  grade: ConcreteGrade
}

/**
 * Бетон под бортовой камень.
 * База: 6–6,5 м³ на 100 п.м. при замке 10 см; при другом замке — пропорционально.
 */
export function calcCurbConcreteOrder(
  perimeterM: number,
  lockCm: number = DEFAULT_CURB_LOCK_CM,
  grade: ConcreteGrade = DEFAULT_CONCRETE_GRADE,
): CurbConcreteOrderResult {
  const lengthM = Math.max(0, perimeterM)
  const lock = Math.max(0, lockCm)
  const scale = DEFAULT_CURB_LOCK_CM > 0 ? lock / DEFAULT_CURB_LOCK_CM : 0
  const m3Per100MMin = CURB_CONCRETE_M3_PER_100M_AT_10CM.min * scale
  const m3Per100MMax = CURB_CONCRETE_M3_PER_100M_AT_10CM.max * scale
  const volumeM3Min = (lengthM / 100) * m3Per100MMin
  const volumeM3Max = (lengthM / 100) * m3Per100MMax
  return {
    lengthM,
    lockCm: lock,
    m3Per100MMin,
    m3Per100MMax,
    volumeM3Min,
    volumeM3Max,
    volumeM3Mid: (volumeM3Min + volumeM3Max) / 2,
    grade,
  }
}

export function formatTons(value: number): string {
  if (value >= 100) return `${value.toFixed(0)} т`
  if (value >= 10) return `${value.toFixed(1)} т`
  return `${value.toFixed(2)} т`
}

export function formatVolumeM3(value: number): string {
  if (value >= 100) return `${value.toFixed(0)} м³`
  if (value >= 10) return `${value.toFixed(1)} м³`
  return `${value.toFixed(2)} м³`
}

export function formatVolumeM3Range(min: number, max: number): string {
  if (Math.abs(max - min) < 1e-9) return formatVolumeM3(min)
  const fmt = (v: number) => {
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(1)
    return v.toFixed(2)
  }
  return `${fmt(min)}–${fmt(max)} м³`
}
