/**
 * Локальные предпочтения формы отчёта бригадира.
 *
 * Сейчас единственное предпочтение — последнее введённое ФИО
 * ответственного: если бригадир один раз вписал «Иванов И. И.»,
 * в следующий раз это значение должно подставиться автоматически,
 * чтобы он не вводил руками одно и то же 30 раз в день.
 *
 * Где храним
 * ──────────
 * `localStorage` на устройстве пользователя:
 *   • ФИО относится к человеку, а не к объекту → ключ глобальный,
 *     без привязки к siteId;
 *   • два бригадира на одном телефоне — крайне редкий кейс; если
 *     случится, второй человек просто перепишет поле, и его ФИО
 *     станет «последним» — без шума на UI.
 *
 * Подводные камни и их обработка
 * ──────────────────────────────
 *   • SSR / non-browser (тесты на jsdom без localStorage):
 *     `typeof window === 'undefined'` → возвращаем дефолт.
 *   • Приватный режим Safari / квота забита: `setItem` бросает
 *     QuotaExceededError → молча игнорируем, prefill следующий раз
 *     будет пустой, но отчёт уже отправлен — это не критично.
 *   • Сохраняем только тримнутую непустую строку, чтобы случайный
 *     пробел или ESC-нажатие не записали мусор.
 *   • Версионируем ключ (`v1`) — если структура поменяется (например,
 *     начнём хранить ещё и должность/телефон), мигрируем без боли.
 */

const RESPONSIBLE_KEY = 'deloresh:brigadier-report:last-responsible:v1'

export function readLastResponsible(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(RESPONSIBLE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeLastResponsible(value: string): void {
  if (typeof window === 'undefined') return
  const trimmed = value.trim()
  if (!trimmed) return
  try {
    window.localStorage.setItem(RESPONSIBLE_KEY, trimmed)
  } catch {
    // приватный режим / квота — отчёт уже отправлен, обойдёмся без prefill
  }
}
