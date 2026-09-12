/**
 * Документы сдачи ЦККБ / «Сдано» — автоматически в папку
 * «Сдача ЦККБ {объект}» в Документах объекта.
 */

import {
  createProjectFileRemote,
  fetchProjectFilesRemote,
} from './siteFormsApi'
import {
  detectProjectFileKind,
  listProjectFilesBySite,
  putProjectFile,
  putProjectFileMeta,
  type StoredSiteProjectFile,
} from './siteProjectFilesRepository'
import { listAllSites } from './sitesRepository'

export function ckkbHandoverFolderId(siteId: string): string {
  return `ckkb-handover-${siteId}`
}

/** «Сдача ЦККБ Брусилова» — короткое имя объекта без «пос.» */
export function ckkbHandoverFolderName(siteName: string): string {
  const short = siteName.replace(/^пос\.\s*/i, '').trim() || siteName.trim() || siteIdFallback(siteName)
  return `Сдача ЦККБ ${short}`
}

function siteIdFallback(name: string): string {
  return name || 'объект'
}

export function resolveSiteDisplayName(siteId: string): string {
  const site = listAllSites().find((s) => s.id === siteId)
  return site?.name ?? siteId
}

function newFileId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isRootFolder(row: StoredSiteProjectFile, siteId: string): boolean {
  return (
    row.siteId === siteId &&
    row.kind === 'folder' &&
    (row.parentId == null || row.parentId === '')
  )
}

/**
 * Находит или создаёт папку сдачи ЦККБ в корне Документов объекта.
 * Id стабильный — на всех устройствах одна и та же папка.
 */
export async function ensureCkkbHandoverFolder(
  siteId: string,
  siteName?: string,
): Promise<{ folderId: string; folderName: string; created: boolean }> {
  const folderId = ckkbHandoverFolderId(siteId)
  const folderName = ckkbHandoverFolderName(siteName ?? resolveSiteDisplayName(siteId))

  const remote = await fetchProjectFilesRemote(siteId)
  const local = await listProjectFilesBySite(siteId).catch(() => [] as StoredSiteProjectFile[])
  const pool = remote ?? local

  const byId = pool.find((r) => r.id === folderId && r.kind === 'folder')
  const byName = pool.find(
    (r) => isRootFolder(r, siteId) && r.name === folderName,
  )
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
    // только локально — ок
    return { folderId, folderName, created: true }
  }
  if (!result.ok) {
    // гонка: кто-то уже создал — перечитаем
    const again = await fetchProjectFilesRemote(siteId)
    const found =
      again?.find((r) => r.id === folderId) ??
      again?.find((r) => isRootFolder(r, siteId) && r.name === folderName)
    if (found) return { folderId: found.id, folderName: found.name, created: false }
  }
  return { folderId, folderName, created: true }
}

export type CkkbUploadResult = {
  folderId: string
  folderName: string
  fileIds: string[]
  fileNames: string[]
  ok: boolean
}

/** Контекст участка — чтобы в имени файла и карточке было понятно, куда сдали. */
export type CkkbHandoverLabelContext = {
  statusLabel: string
  areaM2?: number
  note?: string
  planName?: string
  markId?: string
  /** Порядковый № отметки на объекте */
  markNumber?: number
  author?: string
  siteName?: string
}

export function sanitizeFileToken(s: string, max = 32): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|#]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.slice(0, max) || 'файл'
}

/** Имя вроде: 2026-08-31_ЦККБ_142м2_участок-А__фото.jpg */
export function buildCkkbHandoverFileName(
  originalName: string,
  ctx: CkkbHandoverLabelContext,
): string {
  const day = new Date().toISOString().slice(0, 10)
  const dot = originalName.lastIndexOf('.')
  const ext = dot >= 0 ? originalName.slice(dot) : ''
  const origBase = (dot >= 0 ? originalName.slice(0, dot) : originalName).trim() || 'файл'

  const parts = [day, sanitizeFileToken(ctx.statusLabel, 12)]
  if (ctx.markNumber != null && Number.isFinite(ctx.markNumber) && ctx.markNumber >= 1) {
    parts.push(`№${Math.floor(ctx.markNumber)}`)
  }
  if (ctx.areaM2 != null && Number.isFinite(ctx.areaM2)) {
    parts.push(`${Math.round(ctx.areaM2)}м2`)
  }
  if (ctx.note?.trim()) parts.push(sanitizeFileToken(ctx.note.trim(), 28))
  if (ctx.markNumber == null && ctx.markId) {
    const shortId = ctx.markId.replace(/^m-/, '').slice(-8)
    parts.push(`отм-${sanitizeFileToken(shortId, 10)}`)
  }

  const cameraLike = /^(IMG_|DSC_|Photo|image|скрин|PXL_|VID_)/i.test(origBase) || origBase.length <= 4
  if (cameraLike) return `${parts.join('_')}${ext || '.jpg'}`
  return `${parts.join('_')}__${sanitizeFileToken(origBase, 24)}${ext}`
}

function mimeForKind(kind: ReturnType<typeof detectProjectFileKind>, file: File): string {
  if (file.type) return file.type
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'dwg') return 'application/acad'
  if (/\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(file.name)) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'heic') return 'image/heic'
    return 'image/jpeg'
  }
  return 'application/octet-stream'
}

/** Загружает акты / фото в папку «Сдача ЦККБ …» с понятными именами. */
export async function uploadCkkbHandoverDocs(
  siteId: string,
  files: readonly File[],
  siteName?: string,
  label?: CkkbHandoverLabelContext,
): Promise<CkkbUploadResult> {
  if (files.length === 0 && !label) {
    const folder = await ensureCkkbHandoverFolder(siteId, siteName)
    return {
      folderId: folder.folderId,
      folderName: folder.folderName,
      fileIds: [],
      fileNames: [],
      ok: true,
    }
  }

  const { folderId, folderName } = await ensureCkkbHandoverFolder(siteId, siteName)
  const fileIds: string[] = []
  const fileNames: string[] = []
  let allOk = true

  const ctx: CkkbHandoverLabelContext = {
    statusLabel: label?.statusLabel ?? 'Сдача',
    areaM2: label?.areaM2,
    note: label?.note,
    planName: label?.planName,
    markId: label?.markId,
    markNumber: label?.markNumber,
    author: label?.author,
    siteName: label?.siteName ?? siteName,
  }

  const queue: File[] = [...files]

  for (const file of queue) {
    const kind = detectProjectFileKind(file)
    const name = label
      ? buildCkkbHandoverFileName(file.name.trim() || 'документ.jpg', ctx)
      : (() => {
          const day = new Date().toISOString().slice(0, 10)
          const baseName = file.name.trim() || 'документ'
          return baseName.startsWith(day) ? baseName : `${day}_${baseName}`
        })()
    const record: StoredSiteProjectFile = {
      id: newFileId(),
      siteId,
      kind: kind === 'folder' ? 'file' : kind,
      name,
      mime: mimeForKind(kind, file),
      sizeBytes: file.size,
      uploadedAtIso: new Date().toISOString(),
      parentId: folderId,
    }
    await putProjectFile(record, file)
    const result = await createProjectFileRemote(siteId, record, file)
    if (!result.ok) allOk = false
    fileIds.push(record.id)
    fileNames.push(name)
  }

  return { folderId, folderName, fileIds, fileNames, ok: allOk }
}

export function kindNeedsHandoverDoc(kind: string): boolean {
  return kind === 'accepted' || kind === 'ckkb'
}
