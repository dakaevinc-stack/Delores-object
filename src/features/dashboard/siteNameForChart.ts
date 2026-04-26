/**
 * Разбивает название объекта на 1–2 строки для оси графика без потери смысла.
 * Сначала по запятой, иначе по пробелу ближе к середине.
 */
export function splitSiteNameForAxis(full: string): [string] | [string, string] {
  const t = full.trim()
  if (t.length <= 30) return [t]

  const comma = t.indexOf(',')
  if (comma > 2 && comma < t.length - 3) {
    const a = t.slice(0, comma + 1).trimEnd()
    const b = t.slice(comma + 1).trimStart()
    if (b.length > 0) return [a, b]
  }

  const mid = Math.min(26, Math.floor(t.length / 2))
  const space = t.lastIndexOf(' ', mid + 10)
  if (space >= 10) {
    return [t.slice(0, space).trimEnd(), t.slice(space + 1).trimStart()]
  }

  if (t.length <= 34) return [t]
  return [t.slice(0, 32).trimEnd() + '…', t.slice(32).trimStart()]
}
