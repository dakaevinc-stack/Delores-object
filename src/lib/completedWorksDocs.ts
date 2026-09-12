/**
 * Папка «Выполненные работы {объект}» в Документах объекта —
 * акты, фото и отчёты по выполненным работам (рядом с «Сдача ЦККБ …»).
 */

import { createProjectFileRemote, fetchProjectFilesRemote } from './siteFormsApi'
import {
  listProjectFilesBySite,
  putProjectFileMeta,
  type StoredSiteProjectFile,
} from './siteProjectFilesRepository'
import { resolveSiteDisplayName } from './ckkbHandoverDocs'

export function completedWorksFolderId(siteId: string): string {
  return `completed-works-${siteId}`
}

/** «Выполненные работы Брусилова» — короткое имя объекта без «пос.» */
export function completedWorksFolderName(siteName: string): string {
  const short = siteName.replace(/^пос\.\s*/i, '').trim() || siteName.trim() || 'объект'
  return `Выполненные работы ${short}`
}

function isRootFolder(row: StoredSiteProjectFile, siteId: string): boolean {
  return (
    row.siteId === siteId &&
    row.kind === 'folder' &&
    (row.parentId == null || row.parentId === '')
  )
}

/**
 * Находит или создаёт папку выполненных работ в корне Документов объекта.
 * Id стабильный — на всех устройствах одна и та же папка.
 */
export async function ensureCompletedWorksFolder(
  siteId: string,
  siteName?: string,
): Promise<{ folderId: string; folderName: string; created: boolean }> {
  const folderId = completedWorksFolderId(siteId)
  const folderName = completedWorksFolderName(siteName ?? resolveSiteDisplayName(siteId))

  const remote = await fetchProjectFilesRemote(siteId)
  const local = await listProjectFilesBySite(siteId).catch(() => [] as StoredSiteProjectFile[])
  const pool = remote ?? local

  const byId = pool.find((r) => r.id === folderId && r.kind === 'folder')
  const byName = pool.find((r) => isRootFolder(r, siteId) && r.name === folderName)
  const existing = byId ?? byName
  if (existing) {
    return { folderId: existing.id, folderName: existing.name, created: false }
  }

  const record: StoredSiteProjectFile = {
    id: folderId,
    siteId,
    kind: 'folder',
    name: folderName,
    mime: 'inode/directory',
    sizeBytes: 0,
    uploadedAtIso: new Date().toISOString(),
    parentId: null,
  }
  await putProjectFileMeta(record)
  const result = await createProjectFileRemote(siteId, record)
  if (!result.ok && remote === null) {
    return { folderId, folderName, created: true }
  }
  if (!result.ok) {
    const again = await fetchProjectFilesRemote(siteId)
    const found =
      again?.find((r) => r.id === folderId) ??
      again?.find((r) => isRootFolder(r, siteId) && r.name === folderName)
    if (found) return { folderId: found.id, folderName: found.name, created: false }
  }
  return { folderId, folderName, created: true }
}
