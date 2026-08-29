/** Множитель: единица чертежа → метры (по $INSUNITS). */
export function insUnitsToMeters(insUnits: number): number {
  switch (insUnits) {
    case 1:
      return 0.0254
    case 2:
      return 0.3048
    case 3:
      return 1609.344
    case 4:
      return 0.001
    case 5:
      return 0.01
    case 6:
      return 1
    case 7:
      return 1000
    case 8:
      return 1e-6
    case 9:
      return 1e-3
    case 10:
      return 0.9144
    case 11:
      return 1e-10
    case 12:
      return 1e-9
    case 13:
      return 1e-8
    case 14:
      return 1e-7
    default:
      return 1
  }
}

/** Площадь: (единицы чертежа)² → м². */
export function drawingAreaToSquareMeters(area: number, insUnits: number): number {
  const k = insUnitsToMeters(insUnits)
  return area * k * k
}

/** Длина: единицы чертежа → метры. */
export function drawingLengthToMeters(length: number, insUnits: number): number {
  return length * insUnitsToMeters(insUnits)
}
