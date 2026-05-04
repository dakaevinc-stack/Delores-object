/**
 * Парсер бригадирских отчётов из Telegram-группы (форум-чата).
 *
 * Реальный формат сообщения, который мы поддерживаем:
 *
 *   Отчёт:
 *   Объект: Брусилова
 *   * Демонтаж тротуаров -250м2
 *   * Выкоп траншеи под БК- 110мп
 *   * Прием материала
 *   *Итр -2чел
 *   *Количество рабочих- 16чел
 *   * Техники- 7шт
 *
 * Парсер «толерантный»: допускает разные пробелы вокруг `*`, `-`, `:`,
 * лишние пустые строки, регистр в служебных строках («ИТР», «итр», «Итр»).
 *
 * Используется и в браузере (через Vite/vitest), и на бэкенде в
 * server/tg-bridge.mjs — поэтому это чистый ESM-модуль JS с JSDoc-типами.
 *
 * @typedef {Object} ParsedTgReport
 * @property {string}       siteName    Имя объекта из строки «Объект: …»
 * @property {string[]}     workLines   Строки работ (без служебных)
 * @property {{itr: number|null, workers: number|null, equipment: number|null}} resources
 *                                       Численность ИТР, рабочих, единиц техники
 * @property {string}       responsible Имя/ник автора сообщения
 * @property {string}       comment     Полный исходный текст (для аудита)
 * @property {string}       reportedAtIso ISO-8601 момента написания
 * @property {string}       sourceMessageId Стабильный ID сообщения в TG (chat:msg)
 */

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeWhitespace(raw) {
  return raw.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim()
}

/**
 * Эвристика: считаем сообщение отчётом, если в первых 3 непустых строках
 * встречается слово «отчёт» (е/ё, любой регистр) ИЛИ есть строка
 * «Объект: …». Это делает парсер устойчивым к мелким стилевым изменениям.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeBrigadierReport(text) {
  if (!text || typeof text !== 'string') return false
  const head = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n')
  if (/отч[её]т/i.test(head)) return true
  if (/^Объект\s*:/im.test(head)) return true
  return false
}

/**
 * Извлекает имя объекта. Разрешённые формы:
 *   "Объект: Брусилова"
 *   "Объект - Брусилова"
 *   "объект:Брусилова"
 *
 * @param {string[]} lines
 * @returns {string|null}
 */
function extractSiteName(lines) {
  for (const line of lines) {
    const m = line.match(/^Объект\s*[:\-—]\s*(.+)$/i)
    if (m && m[1] && m[1].trim()) {
      return m[1].trim().replace(/[\s.,;:]+$/u, '')
    }
  }
  return null
}

/**
 * Является ли пункт «ресурсной» строкой (ИТР / рабочие / техника).
 * Возвращает то, что нашли, и какое значение.
 *
 * @param {string} item
 * @returns {{kind: 'itr'|'workers'|'equipment', value: number}|null}
 */
function classifyResource(item) {
  const t = item.replace(/\s+/g, ' ').trim()

  // ИТР: "Итр -2чел", "ИТР: 2 чел", "итр 2 чел", "ИТР - 3 человека"
  let m = t.match(/^итр\s*[-—:]?\s*(\d+)\s*(?:чел(?:овек)?(?:а|ам|ов)?)?\.?$/i)
  if (m) return { kind: 'itr', value: parseInt(m[1], 10) }

  // Рабочие: "Количество рабочих- 16чел", "рабочие: 16", "Рабочих 16 чел"
  m = t.match(
    /^(?:количество\s+)?рабоч(?:их|ие)\s*[-—:]?\s*(\d+)\s*(?:чел(?:овек)?(?:а|ам|ов)?)?\.?$/i,
  )
  if (m) return { kind: 'workers', value: parseInt(m[1], 10) }

  // Техника: "Техники- 7шт", "техника: 7", "Единиц техники - 7"
  m = t.match(/^(?:единиц\s+)?техник[аеи]\s*[-—:]?\s*(\d+)\s*(?:шт|ед)?\.?$/i)
  if (m) return { kind: 'equipment', value: parseInt(m[1], 10) }

  return null
}

/**
 * Снимает с пункта префикс маркера: «*», «* », «—», «—», «-», «1.», «1)».
 *
 * @param {string} line
 * @returns {string}
 */
function stripBullet(line) {
  return line
    .replace(/^[*•\-—–]\s*/u, '')
    .replace(/^\d+\s*[.)]\s*/u, '')
    .trim()
}

/**
 * Главный парсер.
 *
 * @param {string} text
 * @param {Object} meta
 * @param {string} meta.responsible    Имя автора сообщения в TG
 * @param {string} meta.reportedAtIso  ISO-дата сообщения
 * @param {string} meta.sourceMessageId Стабильный ID (`<chat>:<message>`)
 * @returns {ParsedTgReport|null}
 */
export function parseBrigadierReportText(text, meta) {
  if (!looksLikeBrigadierReport(text)) return null

  const lines = text
    .split('\n')
    .map(normalizeWhitespace)
    .filter(Boolean)

  const siteName = extractSiteName(lines)
  if (!siteName) return null

  const workLines = []
  const resources = { itr: null, workers: null, equipment: null }

  for (const rawLine of lines) {
    // Пропускаем заголовки и строку с объектом — они уже учтены.
    if (/^отч[её]т\s*:?\s*$/i.test(rawLine)) continue
    if (/^Объект\s*[:\-—]/i.test(rawLine)) continue

    // Принимаем только пункты со звёздочкой/дефисом/нумерацией —
    // «фоновый» текст без маркера не трактуем как пункт работы.
    const looksLikeBullet =
      /^[*•\-—–]/u.test(rawLine) || /^\d+\s*[.)]/u.test(rawLine)
    if (!looksLikeBullet) continue

    const item = stripBullet(rawLine)
    if (!item) continue

    const resource = classifyResource(item)
    if (resource) {
      resources[resource.kind] = resource.value
      continue
    }

    workLines.push(item)
  }

  return {
    siteName,
    workLines,
    resources,
    responsible: meta.responsible,
    comment: text.trim(),
    reportedAtIso: meta.reportedAtIso,
    sourceMessageId: meta.sourceMessageId,
  }
}
