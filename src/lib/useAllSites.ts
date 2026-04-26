import { useSyncExternalStore } from 'react'
import { listAllSites, subscribeSites } from './sitesRepository'

/**
 * Актуальный список объектов (mock + пользовательские),
 * автоматически перерисовывает подписчиков при изменениях в localStorage-репо.
 */
export function useAllSites() {
  return useSyncExternalStore(subscribeSites, listAllSites, listAllSites)
}
