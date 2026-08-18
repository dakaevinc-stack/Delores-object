/**
 * Поиск адреса для точки разгрузки.
 * Подсказки — как в навигаторе: ввёл улицу — получил варианты — поставил пин.
 */

export type AddressHit = {
  label: string
  lat: number
  lng: number
}

function asRecord(row: unknown): Record<string, unknown> | null {
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null
}

function pickAddressPart(addr: Record<string, unknown>, key: string): string {
  const v = addr[key]
  return typeof v === 'string' ? v.trim() : ''
}

/** Короткий адрес: улица, дом, район, город — без километрового display_name Nominatim. */
export function formatNominatimLabel(row: unknown): string {
  const r = asRecord(row)
  if (!r) return ''
  const addr = asRecord(r.address)
  if (addr) {
    const road = pickAddressPart(addr, 'road') || pickAddressPart(addr, 'pedestrian')
    const house = pickAddressPart(addr, 'house_number')
    const suburb = pickAddressPart(addr, 'suburb') || pickAddressPart(addr, 'neighbourhood')
    const city =
      pickAddressPart(addr, 'city') ||
      pickAddressPart(addr, 'town') ||
      pickAddressPart(addr, 'village') ||
      pickAddressPart(addr, 'municipality')
    const parts = [road && house ? `${road}, ${house}` : road || house, suburb, city].filter(Boolean)
    if (parts.length > 0) return parts.join(', ')
  }
  return typeof r.display_name === 'string' ? r.display_name.trim() : ''
}

export function parseNominatimSearch(data: unknown): AddressHit[] {
  if (!Array.isArray(data)) return []
  const out: AddressHit[] = []
  const seen = new Set<string>()
  for (const row of data) {
    const r = asRecord(row)
    if (!r) continue
    const lat = Number(r.lat)
    const lng = Number(r.lon)
    const label = formatNominatimLabel(row)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) continue
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, lat, lng })
  }
  return out
}

export function parseNominatimReverse(data: unknown): string | null {
  const label = formatNominatimLabel(data)
  return label || null
}
