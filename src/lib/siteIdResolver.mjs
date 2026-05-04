/**
 * Сопоставление «человеческого» названия объекта (из ТГ-сообщения, имени топика
 * и т.п.) с siteId, который хранится в реестре приложения.
 *
 * Алгоритм (от строгого к мягкому):
 *   1. Точное совпадение нормализованных названий.
 *   2. Каноничное имя объекта целиком встречается в искомом, или искомое —
 *      внутри каноничного (полезно для «Брусилова» ↔ «БРУСИЛОВА ул.»).
 *   3. Совпадение по «токенам» — пересечение слов длиной ≥3 символа
 *      (выручает на «Кошотянца» / «Коштоянца», «Щербинка Вокзальная» /
 *      «Щербинка, Вокзальная»).
 *
 * Если ни одно правило не сработало — возвращаем null. Бридж в этом случае
 * пишет лог и пропускает сообщение, чтобы не плодить мусорные siteId.
 */

/**
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} s
 * @returns {string[]}
 */
function tokens(s) {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 3)
}

/**
 * @typedef {{ id: string, name: string }} SiteRef
 */

/**
 * @param {string} probe Название из ТГ
 * @param {readonly SiteRef[]} sites Реестр объектов из приложения
 * @returns {string|null} siteId или null, если уверенно не сопоставили
 */
export function resolveSiteId(probe, sites) {
  if (!probe || !sites || sites.length === 0) return null

  const np = normalize(probe)
  if (!np) return null

  // 1. Полное совпадение нормализованных строк.
  for (const site of sites) {
    if (normalize(site.name) === np) return site.id
  }

  // 2. Подстрочное совпадение в обе стороны.
  for (const site of sites) {
    const ns = normalize(site.name)
    if (ns && (np.includes(ns) || ns.includes(np))) {
      return site.id
    }
  }

  // 3. Совпадение по токенам (пересечение слов длиной ≥3).
  const probeTokens = new Set(tokens(probe))
  if (probeTokens.size === 0) return null

  let bestId = null
  let bestScore = 0
  for (const site of sites) {
    const siteTokens = tokens(site.name)
    if (siteTokens.length === 0) continue
    let score = 0
    for (const t of siteTokens) {
      if (probeTokens.has(t)) score++
    }
    // Условие уверенности: совпало не меньше половины токенов имени
    // объекта и хотя бы один.
    if (score > bestScore && score * 2 >= siteTokens.length) {
      bestScore = score
      bestId = site.id
    }
  }
  return bestId
}
