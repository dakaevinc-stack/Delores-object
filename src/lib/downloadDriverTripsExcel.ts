import * as XLSX from 'xlsx'
import {
  buildDriverTripExportRows,
  collectAllTripsForSite,
  collectTripsInRange,
  type DriverTrip,
} from '../domain/driverTrip'

export function downloadDriverTripsExcel(
  trips: readonly DriverTrip[],
  fromKey: string,
  toKey: string,
  options?: { siteId?: string; filePrefix?: string },
): { ok: true; count: number; fileName: string } | { ok: false; reason: string } {
  const from = fromKey.trim()
  const to = toKey.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, reason: 'Укажите корректный период' }
  }
  const scoped = options?.siteId ? collectAllTripsForSite(trips, options.siteId) : trips
  const ranged = collectTripsInRange(scoped, from, to)
  if (ranged.length === 0) {
    return { ok: false, reason: options?.siteId ? 'За этот период рейсов по объекту нет' : 'За этот период рейсов нет' }
  }

  const rows = buildDriverTripExportRows(ranged)
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 22 },
    { wch: 28 },
    { wch: 14 },
    { wch: 36 },
    { wch: 28 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 36 },
  ]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Рейсы')
  const lo = from <= to ? from : to
  const hi = from <= to ? to : from
  const prefix = (options?.filePrefix ?? (options?.siteId ? `reysy_${options.siteId}` : 'reysy'))
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  const fileName = `${prefix || 'reysy'}_${lo}_${hi}.xlsx`
  XLSX.writeFile(book, fileName)
  return { ok: true, count: ranged.length, fileName }
}
