/**
 * Одноразовая чистка локальных данных парка.
 *
 * Понадобилась после переноса парка на учётные таблицы:
 *
 *  1. В реестре на устройствах могли остаться тестовые машины, созданные во
 *     время аудита («АУДИТ_20260908_НЕ_РАБОЧАЯ»). Просто вычистить их на
 *     сервере недостаточно: при следующем запуске устройство с непустым
 *     локальным реестром заливает его обратно.
 *  2. id техники раньше зависел от позиции в списке (`dump-trucks-01`), а
 *     теперь привязан к госномеру. Старые ключи ни на что не указывают —
 *     правки и отметки об удалении по ним нужно убрать, иначе они висят
 *     мёртвым грузом и путают синхронизацию.
 *
 * Чистка идемпотентна: второй запуск ничего не меняет.
 */

import { loadRegistry, saveRegistry } from '../features/fleet/fleetRegistry'
import { loadAllOverrides, replaceAllOverrides } from '../features/fleet/vehicleOverrides'
import { FLEET_VEHICLES } from '../data/fleet.mock'

/** Машины из смоук-тестов: их название всегда содержало эту метку. */
const AUDIT_MARKER = /АУДИТ/i

/** Старая схема id: класс техники + порядковый номер в списке. */
const LEGACY_ID = /^[a-z-]+-\d{2}$/

export type FleetMigrationResult = {
  removedAuditVehicles: number
  removedLegacyRemovedIds: number
  removedOrphanOverrides: number
}

function isAuditVehicle(v: { model?: string; plate?: string }): boolean {
  return AUDIT_MARKER.test(v.model ?? '') || AUDIT_MARKER.test(v.plate ?? '')
}

export function migrateLocalFleetData(): FleetMigrationResult {
  const result: FleetMigrationResult = {
    removedAuditVehicles: 0,
    removedLegacyRemovedIds: 0,
    removedOrphanOverrides: 0,
  }

  const registry = loadRegistry()
  const added = registry.added.filter((v) => !isAuditVehicle(v))
  result.removedAuditVehicles = registry.added.length - added.length

  const removedIds = registry.removedIds.filter((id) => !LEGACY_ID.test(id))
  result.removedLegacyRemovedIds = registry.removedIds.length - removedIds.length

  if (result.removedAuditVehicles > 0 || result.removedLegacyRemovedIds > 0) {
    saveRegistry({ ...registry, added, removedIds }, { syncRemote: false })
  }

  /* Правки карточек: оставляем те, у которых есть хозяин — машина из парка
     или добавленная пользователем. Остальные ключи указывают в пустоту. */
  const knownIds = new Set<string>([...FLEET_VEHICLES.map((v) => v.id), ...added.map((v) => v.id)])
  const overrides = loadAllOverrides()
  const kept: typeof overrides = {}
  for (const [id, value] of Object.entries(overrides)) {
    if (knownIds.has(id)) kept[id] = value
    else result.removedOrphanOverrides += 1
  }
  if (result.removedOrphanOverrides > 0) {
    replaceAllOverrides(kept, { syncRemote: false })
  }

  return result
}
