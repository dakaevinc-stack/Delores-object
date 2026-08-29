import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type CadViewerRef } from '@cadview/react'
import {
  evictDwgPreviewMemoryForFile,
  hasDwgPreviewInMemory,
  prefetchAllDwgPreviews,
  prefetchDwgPreview,
  prefetchDwgPngPreview,
  getPrefetchedDwgPng,
  resolveDwgDxfText,
  warmDwgPreviewAfterUpload,
  type DwgLoadPhase,
} from '../../lib/dwgPreview'
import { probeRasterPreviewBlank } from '../../lib/dwgRasterBlank'
import { parsePngWorldMeta, type PngPreviewWorldMeta } from '../../lib/dwgPngBounds'
import { fitCadViewerToDrawing } from '../../lib/dwgViewerFit'
import { canPreviewInApp, projectOpenMode } from '../../lib/projectFileOpen'
import { DwgViewerChrome } from './DwgViewerChrome'
import { type DwgRasterViewerRef } from './DwgRasterViewer'
import { ProjectOfficeViewer } from './ProjectOfficeViewer'
import {
  collectDescendantIds,
  deleteProjectFile,
  deleteDwgDxfPreviewsForFile,
  detectProjectFileKind,
  getProjectFileBlob,
  listProjectFilesBySite,
  projectParentId,
  pruneProjectFilesToRemote,
  putProjectFile,
  putProjectFileMeta,
  projectFileSyncSignature,
  type StoredSiteProjectFile,
} from '../../lib/siteProjectFilesRepository'
import {
  createProjectFileRemote,
  deleteProjectFileRemote,
  describeRemoteWriteError,
  fetchProjectFileBlobRemote,
  fetchProjectFilesRemote,
  fetchProjectFilePngPreviewRemote,
  fetchProjectFilePngWorldMetaRemote,
  hasWriteSecret,
  projectFileBlobUrl,
} from '../../lib/siteFormsApi'
import styles from './SiteProjectHeaderCard.module.css'

type Props = {
  siteId: string
  canUpload: boolean
  /** Без собственной рамки — внутри шапки объекта. */
  embedded?: boolean
}

type ProjectAsset = StoredSiteProjectFile & {
  url: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function kindLabel(kind: StoredSiteProjectFile['kind'], name?: string): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'dwg') return 'DWG'
  if (kind === 'folder') return 'Папка'
  const ext = (name ?? '').split('.').pop()?.toUpperCase()
  if (ext && ext.length <= 5) return ext
  return 'Файл'
}

function formatUploaded(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function SiteProjectHeaderCard({ siteId, canUpload, embedded = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<ProjectAsset[]>([])
  const busyRef = useRef(false)
  const syncBlockedRef = useRef(false)
  /** Локальные id, которые ещё ждут отправки на сервер (не «воскрешать» удалённые чужие). */
  const pendingSyncIdsRef = useRef<Set<string>>(new Set())

  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [viewerPdf, setViewerPdf] = useState<ProjectAsset | null>(null)
  const [viewerDwg, setViewerDwg] = useState<ProjectAsset | null>(null)
  const [viewerOffice, setViewerOffice] = useState<ProjectAsset | null>(null)
  const [dwgDxfText, setDwgDxfText] = useState<string | null>(null)
  const [dwgLoadState, setDwgLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [dwgLoadPhase, setDwgLoadPhase] = useState<DwgLoadPhase | null>(null)
  const [dwgErrorDetail, setDwgErrorDetail] = useState<string | null>(null)
  const [remoteActive, setRemoteActive] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const dwgLayersLoadedRef = useRef(false)
  const dwgCadRef = useRef<CadViewerRef | null>(null)
  const dwgRasterRef = useRef<DwgRasterViewerRef | null>(null)
  const dwgCanvasWrapRef = useRef<HTMLDivElement | null>(null)
  const dwgPngRevokeRef = useRef<string | null>(null)
  const dwgOpenGenRef = useRef(0)
  const [dwgPngObjectUrl, setDwgPngObjectUrl] = useState<string | null>(null)
  const [dwgPngWorldMeta, setDwgPngWorldMeta] = useState<PngPreviewWorldMeta | null>(null)
  const [dwgPngState, setDwgPngState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')

  const revokeIfBlobUrl = (url: string) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const resolveProjectBlob = async (fileId: string): Promise<Blob | null> => {
    if (remoteActive) {
      const remote = await fetchProjectFileBlobRemote(siteId, fileId)
      if (remote) return remote
    }
    return getProjectFileBlob(fileId)
  }

  const loadAssets = useCallback(async (opts?: { silent?: boolean }): Promise<string[]> => {
    const blobUrls: string[] = []
    if (!opts?.silent) setLoading(true)
    try {
      const remoteRows = await fetchProjectFilesRemote(siteId)
      const remoteAvailable = remoteRows !== null
      if (remoteAvailable) setRemoteActive(true)

      // Сервер — источник правды: показываем remote + только pending с этого устройства.
      if (remoteAvailable && remoteRows) {
        const remoteIds = new Set(remoteRows.map((row) => row.id))

        await pruneProjectFilesToRemote(siteId, remoteIds, pendingSyncIdsRef.current)

        if (canUpload && !syncBlockedRef.current && pendingSyncIdsRef.current.size > 0) {
          if (import.meta.env.DEV && !hasWriteSecret()) {
            syncBlockedRef.current = true
            setSyncMessage(
              'Локальная разработка без ключа записи — файл виден только на этом ноутбуке. Добавьте VITE_SITE_FORMS_WRITE_SECRET в .env и перезапустите dev-сервер, либо загрузите на http://94.242.58.24.',
            )
          } else {
            const localRows = await listProjectFilesBySite(siteId)
            const toUpload = localRows.filter(
              (local) =>
                pendingSyncIdsRef.current.has(local.id) && !remoteIds.has(local.id),
            )
            if (toUpload.length > 0) {
              if (!opts?.silent) setSyncMessage('Отправляем файлы на сервер…')
              let firstError: string | null = null
              for (const local of toUpload) {
                try {
                  if (local.kind === 'folder') {
                    const result = await createProjectFileRemote(siteId, local)
                    if (result.ok) {
                      pendingSyncIdsRef.current.delete(local.id)
                      remoteIds.add(local.id)
                      syncBlockedRef.current = false
                    } else if (result.reason === 'forbidden') {
                      syncBlockedRef.current = true
                      if (!firstError) firstError = describeRemoteWriteError(result, 'папку')
                    } else if (!firstError) {
                      firstError = describeRemoteWriteError(result, 'папку')
                    }
                    continue
                  }
                  const blob = await getProjectFileBlob(local.id)
                  if (!blob) continue
                  const result = await createProjectFileRemote(siteId, local, blob)
                  if (result.ok) {
                    pendingSyncIdsRef.current.delete(local.id)
                    remoteIds.add(local.id)
                    syncBlockedRef.current = false
                  } else if (result.reason === 'forbidden') {
                    syncBlockedRef.current = true
                    if (!firstError) firstError = describeRemoteWriteError(result, 'файл')
                  } else if (!firstError) {
                    firstError = describeRemoteWriteError(result, 'файл')
                  }
                } catch {
                  if (!firstError) firstError = 'Не удалось перенести файл на сервер.'
                }
              }
              if (firstError) setSyncMessage(firstError)
              else if (!opts?.silent) setSyncMessage(null)
            }
          }
        }

        const refreshed = await fetchProjectFilesRemote(siteId)
        const finalRemote = refreshed ?? remoteRows
        const finalIds = new Set(finalRemote.map((row) => row.id))
        await pruneProjectFilesToRemote(siteId, finalIds, pendingSyncIdsRef.current)

        const resolved: ProjectAsset[] = finalRemote.map((row) => ({
          ...row,
          url: row.kind === 'folder' ? '' : projectFileBlobUrl(siteId, row.id),
        }))

        // Pending, которых ещё нет на сервере — показываем только их (ожидание синка).
        const localRows = await listProjectFilesBySite(siteId)
        for (const local of localRows) {
          if (!pendingSyncIdsRef.current.has(local.id)) continue
          if (finalIds.has(local.id)) {
            pendingSyncIdsRef.current.delete(local.id)
            continue
          }
          if (local.kind === 'folder') {
            resolved.push({ ...local, url: '' })
            continue
          }
          const blob = await getProjectFileBlob(local.id)
          if (!blob) continue
          const url = URL.createObjectURL(blob)
          blobUrls.push(url)
          resolved.push({ ...local, url })
        }

        resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
        setAssets(resolved)
        return blobUrls
      }

      // Офлайн: только локальный IndexedDB.
      const localRows = await listProjectFilesBySite(siteId)
      const resolved: ProjectAsset[] = []
      for (const row of localRows) {
        if (row.kind === 'folder') {
          resolved.push({ ...row, url: '' })
          continue
        }
        const blob = await getProjectFileBlob(row.id)
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        blobUrls.push(url)
        resolved.push({ ...row, url })
      }
      resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
      setAssets(resolved)
      return blobUrls
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [siteId, canUpload])

  const refreshFromRemote = useCallback(async () => {
    const remoteRows = await fetchProjectFilesRemote(siteId)
    if (!remoteRows) return
    setRemoteActive(true)
    const remoteIds = new Set(remoteRows.map((row) => row.id))
    await pruneProjectFilesToRemote(siteId, remoteIds, pendingSyncIdsRef.current)

    setAssets((prev) => {
      const resolved: ProjectAsset[] = remoteRows.map((row) => ({
        ...row,
        url: row.kind === 'folder' ? '' : projectFileBlobUrl(siteId, row.id),
      }))
      const resolvedIds = new Set(resolved.map((r) => r.id))
      for (const row of prev) {
        if (!pendingSyncIdsRef.current.has(row.id)) {
          if (row.url.startsWith('blob:')) revokeIfBlobUrl(row.url)
          continue
        }
        if (remoteIds.has(row.id)) {
          pendingSyncIdsRef.current.delete(row.id)
          if (row.url.startsWith('blob:')) revokeIfBlobUrl(row.url)
          continue
        }
        if (!resolvedIds.has(row.id)) {
          resolved.push(row)
          resolvedIds.add(row.id)
        }
      }
      resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
      const prevSig = prev.map((r) => projectFileSyncSignature(r)).join('|')
      const nextSig = resolved.map((r) => projectFileSyncSignature(r)).join('|')
      if (prevSig === nextSig) return prev
      return resolved
    })
  }, [siteId])

  const clearDwgPngObjectUrl = () => {
    if (dwgPngRevokeRef.current) {
      URL.revokeObjectURL(dwgPngRevokeRef.current)
      dwgPngRevokeRef.current = null
    }
    setDwgPngObjectUrl(null)
    setDwgPngWorldMeta(null)
    setDwgPngState('idle')
  }

  const loadDwgPng = useCallback(
    async (row: ProjectAsset, opts?: { regenerate?: boolean }) => {
      const openGen = dwgOpenGenRef.current
      if (!remoteActive) {
        clearDwgPngObjectUrl()
        return
      }
      // Любой DWG: если превью раньше упало — тихо пробуем снова при открытии.
      const shouldRegenerate = opts?.regenerate === true || row.pngPreviewStatus === 'failed'
      setDwgPngState('loading')
      try {
        const cacheKey = row.pngPreviewAtIso ?? row.uploadedAtIso
        const prefetched =
          !shouldRegenerate ? getPrefetchedDwgPng(row.id, cacheKey) : undefined
        const fetched =
          prefetched == null
            ? await fetchProjectFilePngPreviewRemote(siteId, row.id, {
                cacheKey,
                regenerate: shouldRegenerate,
                onWait: () => {
                  if (dwgOpenGenRef.current === openGen) setDwgLoadPhase('converting')
                },
              })
            : prefetched
        if (dwgOpenGenRef.current !== openGen) return
        const blob = fetched?.blob ?? null
        let worldBounds =
          fetched?.worldBounds ??
          parsePngWorldMeta(row.pngWorldBounds) ??
          null
        if (!worldBounds?.pixelsPerUnit) {
          worldBounds = (await fetchProjectFilePngWorldMetaRemote(siteId, row.id)) ?? worldBounds
        }
        if (dwgOpenGenRef.current !== openGen) return
        if (!blob) {
          setDwgPngState('failed')
          return
        }
        if (dwgPngRevokeRef.current) URL.revokeObjectURL(dwgPngRevokeRef.current)
        const url = URL.createObjectURL(blob)
        if (await probeRasterPreviewBlank(url)) {
          URL.revokeObjectURL(url)
          if (dwgOpenGenRef.current === openGen) setDwgPngState('failed')
          return
        }
        if (dwgOpenGenRef.current !== openGen) {
          URL.revokeObjectURL(url)
          return
        }
        dwgPngRevokeRef.current = url
        setDwgPngObjectUrl(url)
        setDwgPngWorldMeta(worldBounds)
        setDwgPngState('ready')
        void refreshFromRemote()
      } catch {
        if (dwgOpenGenRef.current === openGen) setDwgPngState('failed')
      }
    },
    [remoteActive, siteId, refreshFromRemote],
  )

  const fitDwgToView = () => {
    if (dwgPngState === 'ready' && dwgPngObjectUrl) {
      dwgRasterRef.current?.fit()
      return
    }
    fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current)
  }

  const handleDwgLayersLoaded = useCallback(
    (entityCount: number) => {
      dwgLayersLoadedRef.current = true
      setDwgLoadPhase(null)
      const hasPng = dwgPngState === 'ready' && Boolean(dwgPngObjectUrl)
      if (entityCount === 0 && !hasPng && dwgPngState !== 'loading') {
        setDwgErrorDetail(
          'Не удалось показать цветной план. На сервере нужен Dwg2Png (ACadSharp.Image). Попробуйте «Обновить чертёж» или откройте DWG в AutoCAD.',
        )
        setDwgLoadState('error')
        return
      }
      if (!hasPng && dwgPngState !== 'loading') {
        fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current)
        window.requestAnimationFrame(() =>
          fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current),
        )
      }
    },
    [dwgPngObjectUrl, dwgPngState],
  )

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    let cancelled = false
    let blobUrls: string[] = []

    void (async () => {
      blobUrls = (await loadAssets()) ?? []
      if (cancelled) {
        for (const url of blobUrls) revokeIfBlobUrl(url)
      }
    })()

    return () => {
      cancelled = true
      for (const row of assetsRef.current) revokeIfBlobUrl(row.url)
    }
  }, [loadAssets])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromRemote()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshFromRemote])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (busyRef.current) return
      if (canUpload && pendingSyncIdsRef.current.size > 0) void loadAssets({ silent: true })
      else void refreshFromRemote()
    }
    const id = window.setInterval(tick, 4000)
    return () => window.clearInterval(id)
  }, [canUpload, loadAssets, refreshFromRemote])

  useEffect(() => {
    const anyOpen =
      viewerPdf != null || viewerDwg != null || viewerOffice != null || folderOpen
    if (!anyOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewerPdf || viewerDwg || viewerOffice) {
          setViewerPdf(null)
          setViewerDwg(null)
          setViewerOffice(null)
        } else {
          setFolderOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [viewerPdf, viewerDwg, viewerOffice, folderOpen])

  const hasLocalOnly = useMemo(() => assets.some((row) => row.url.startsWith('blob:')), [assets])

  const featuredDrawing = useMemo(() => {
    const dwgs = assets.filter((row) => row.kind === 'dwg')
    if (dwgs.length === 0) return null
    // Основной чертёж — последний загруженный DWG.
    return [...dwgs].sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))[0]
  }, [assets])

  const archiveFiles = useMemo(() => {
    const inFolder = assets.filter(
      (row) => row.id !== featuredDrawing?.id && projectParentId(row) === currentFolderId,
    )
    return [...inFolder].sort((a, b) => {
      if (a.kind === 'folder' && b.kind !== 'folder') return -1
      if (a.kind !== 'folder' && b.kind === 'folder') return 1
      return a.name.localeCompare(b.name, 'ru')
    })
  }, [assets, featuredDrawing, currentFolderId])

  const folderTrail = useMemo(() => {
    const trail: ProjectAsset[] = []
    let id = currentFolderId
    while (id) {
      const folder = assets.find((row) => row.id === id && row.kind === 'folder')
      if (!folder) break
      trail.unshift(folder)
      id = projectParentId(folder)
    }
    return trail
  }, [assets, currentFolderId])

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    setSyncMessage(null)
    try {
      for (const file of Array.from(fileList)) {
        const kind = detectProjectFileKind(file)
        const record: StoredSiteProjectFile = {
          id: newId(),
          siteId,
          kind,
          name: file.name,
          mime:
            file.type ||
            (kind === 'pdf'
              ? 'application/pdf'
              : kind === 'dwg'
                ? 'application/acad'
                : 'application/octet-stream'),
          sizeBytes: file.size,
          uploadedAtIso: new Date().toISOString(),
          parentId: currentFolderId,
        }
        await putProjectFile(record, file)
        pendingSyncIdsRef.current.add(record.id)

        const remoteProbe = await fetchProjectFilesRemote(siteId)
        const remoteAvailable = remoteProbe !== null
        if (remoteAvailable) setRemoteActive(true)

        let syncedToRemote = false
        if (remoteAvailable) {
          const result = await createProjectFileRemote(siteId, record, file)
          if (result.ok) {
            syncedToRemote = true
            pendingSyncIdsRef.current.delete(record.id)
            syncBlockedRef.current = false
          } else if (result.reason === 'network') {
            setSyncMessage(
              'Не удалось отправить на сервер — проверьте интернет и нажмите «Отправить».',
            )
          } else if (result.reason === 'forbidden') {
            syncBlockedRef.current = true
            setSyncMessage(describeRemoteWriteError(result, 'файл'))
          } else {
            setSyncMessage(describeRemoteWriteError(result, 'файл'))
          }
        } else {
          setSyncMessage('Сервер недоступен — файлы сохранены только на этом устройстве.')
        }

        if (syncedToRemote) {
          await refreshFromRemote()
          if (kind === 'dwg') {
            setSyncMessage('Готовим чертёж к мгновенному открытию…')
            try {
              const remoteRows = await fetchProjectFilesRemote(siteId)
              const remoteRow = remoteRows?.find((r) => r.id === record.id)
              await warmDwgPreviewAfterUpload(
                siteId,
                remoteRow ?? record,
                () => resolveProjectBlob(record.id),
              )
              setSyncMessage('Чертёж готов — откроется на всех устройствах')
              window.setTimeout(() => {
                setSyncMessage((msg) =>
                  msg === 'Чертёж готов — откроется на всех устройствах' ? null : msg,
                )
              }, 2500)
            } catch {
              setSyncMessage('Чертёж загружен, превью догружается — откроется через несколько секунд.')
            }
          } else if (kind === 'pdf') {
            setSyncMessage('PDF готов — откроется на всех устройствах')
            window.setTimeout(() => {
              setSyncMessage((msg) => (msg === 'PDF готов — откроется на всех устройствах' ? null : msg))
            }, 2500)
          }
        } else {
          const url = URL.createObjectURL(file)
          setAssets((prev) =>
            [{ ...record, url }, ...prev].sort((a, b) =>
              b.uploadedAtIso.localeCompare(a.uploadedAtIso),
            ),
          )
        }
      }
      if (!syncMessage) setSyncMessage(null)
    } catch {
      setSyncMessage('Не удалось сохранить файл. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setBusy(true)
    setSyncMessage(null)
    try {
      const record: StoredSiteProjectFile = {
        id: newId(),
        siteId,
        kind: 'folder',
        name,
        mime: 'inode/directory',
        sizeBytes: 0,
        uploadedAtIso: new Date().toISOString(),
        parentId: currentFolderId,
      }
      await putProjectFileMeta(record)
      pendingSyncIdsRef.current.add(record.id)

      const remoteProbe = await fetchProjectFilesRemote(siteId)
      const remoteAvailable = remoteProbe !== null
      if (remoteAvailable) setRemoteActive(true)

      let synced = false
      if (remoteAvailable) {
        const result = await createProjectFileRemote(siteId, record)
        if (result.ok) {
          synced = true
          pendingSyncIdsRef.current.delete(record.id)
          syncBlockedRef.current = false
        } else {
          setSyncMessage(describeRemoteWriteError(result, 'папку'))
          if (result.reason === 'forbidden') syncBlockedRef.current = true
        }
      }

      if (synced) await refreshFromRemote()
      else {
        setAssets((prev) =>
          [{ ...record, url: '' }, ...prev].sort((a, b) =>
            b.uploadedAtIso.localeCompare(a.uploadedAtIso),
          ),
        )
      }
      setNewFolderName('')
      setNewFolderOpen(false)
    } catch {
      setSyncMessage('Не удалось создать папку.')
    } finally {
      setBusy(false)
    }
  }

  const removeAsset = async (row: ProjectAsset) => {
    setSyncMessage(null)
    const toRemove =
      row.kind === 'folder' ? collectDescendantIds(assets, row.id) : [row.id]
    const remoteProbe = await fetchProjectFilesRemote(siteId)
    const serverReachable = remoteProbe !== null
    if (serverReachable) setRemoteActive(true)
    if (serverReachable || remoteActive) {
      for (const id of toRemove) {
        const ok = await deleteProjectFileRemote(siteId, id)
        if (!ok) {
          setSyncMessage(
            'Не удалось удалить на сервере. На других устройствах запись может остаться.',
          )
          return
        }
      }
    }
    for (const id of toRemove) {
      pendingSyncIdsRef.current.delete(id)
      evictDwgPreviewMemoryForFile(id)
      await deleteDwgDxfPreviewsForFile(id)
      await deleteProjectFile(id)
    }
    setAssets((prev) => {
      for (const item of prev) {
        if (toRemove.includes(item.id)) revokeIfBlobUrl(item.url)
      }
      return prev.filter((item) => !toRemove.includes(item.id))
    })
    if (viewerPdf && toRemove.includes(viewerPdf.id)) setViewerPdf(null)
    if (viewerOffice && toRemove.includes(viewerOffice.id)) setViewerOffice(null)
    if (viewerDwg && toRemove.includes(viewerDwg.id)) {
      setViewerDwg(null)
      setDwgDxfText(null)
      setDwgLoadState('idle')
      setDwgLoadPhase(null)
      dwgLayersLoadedRef.current = false
      clearDwgPngObjectUrl()
    }
    if (currentFolderId && toRemove.includes(currentFolderId)) {
      setCurrentFolderId(null)
    }
    if (serverReachable) void refreshFromRemote()
  }

  const openDwgViewer = async (row: ProjectAsset, opts?: { regenerate?: boolean }) => {
    const openGen = ++dwgOpenGenRef.current
    setViewerPdf(null)
    setViewerOffice(null)
    setViewerDwg(row)
    setDwgErrorDetail(null)
    dwgLayersLoadedRef.current = false

    const shouldRegenerate = opts?.regenerate === true
    clearDwgPngObjectUrl()
    void loadDwgPng(row, { regenerate: shouldRegenerate })

    if (
      !shouldRegenerate &&
      hasDwgPreviewInMemory(row.id, row.uploadedAtIso, row.dxfPreviewAtIso)
    ) {
      try {
        const dxfText = await resolveDwgDxfText(siteId, row.id, row.uploadedAtIso, {
          remoteActive,
          fetchBlob: () => resolveProjectBlob(row.id),
          dxfPreviewAtIso: row.dxfPreviewAtIso,
        })
        if (dwgOpenGenRef.current !== openGen) return
        setDwgDxfText(dxfText)
        setDwgLoadState('idle')
        setDwgLoadPhase(null)
        return
      } catch {
        /* ниже обычный путь */
      }
    }

    setDwgDxfText(null)
    setDwgLoadState('loading')
    setDwgLoadPhase('fetching')
    try {
      const dxfText = await resolveDwgDxfText(siteId, row.id, row.uploadedAtIso, {
        remoteActive,
        fetchBlob: () => resolveProjectBlob(row.id),
        onPhase: (phase) => {
          if (dwgOpenGenRef.current === openGen) setDwgLoadPhase(phase)
        },
        dxfPreviewAtIso: row.dxfPreviewAtIso,
        regenerate: shouldRegenerate,
      })
      if (dwgOpenGenRef.current !== openGen) return
      setDwgDxfText(dxfText)
      setDwgLoadState('idle')
      if (shouldRegenerate) void refreshFromRemote()
    } catch (err) {
      if (dwgOpenGenRef.current !== openGen) return
      const msg = err instanceof Error ? err.message : ''
      setDwgErrorDetail(
        msg.includes('conversion failed') ||
          msg.includes('error code') ||
          msg.includes('dxf_conversion_failed')
          ? 'Не удалось разобрать этот DWG. Обновите страницу и попробуйте снова — сервер конвертирует файл заново. Если снова ошибка, напишите нам.'
          : 'Не удалось открыть DWG. Обновите страницу и попробуйте ещё раз.',
      )
      setDwgLoadState('error')
      setDwgLoadPhase(null)
    }
  }

  const openProjectAsset = (row: ProjectAsset) => {
    const mode = projectOpenMode(row)
    if (mode === 'pdf') {
      setViewerDwg(null)
      setViewerOffice(null)
      setViewerPdf(row)
      return
    }
    if (mode === 'dwg') {
      void openDwgViewer(row)
      return
    }
    if (mode === 'image' || mode === 'spreadsheet' || mode === 'word' || mode === 'text') {
      setViewerPdf(null)
      setViewerDwg(null)
      setViewerOffice(row)
      return
    }
    // Остальное — скачивание
    const a = document.createElement('a')
    a.href = row.url
    a.download = row.name
    a.rel = 'noopener'
    a.click()
  }

  const warmDwgPreview = useCallback(
    (row: Pick<
      ProjectAsset,
      'id' | 'uploadedAtIso' | 'dxfPreviewAtIso' | 'pngPreviewAtIso' | 'pngPreviewStatus'
    >) => {
      if (!remoteActive) return
      prefetchDwgPreview(siteId, row.id, row.uploadedAtIso, {
        remoteActive: true,
        fetchBlob: () => resolveProjectBlob(row.id),
        dxfPreviewAtIso: row.dxfPreviewAtIso,
      })
      prefetchDwgPngPreview(siteId, row.id, {
        cacheKey: row.pngPreviewAtIso ?? row.uploadedAtIso,
        pngPreviewStatus: row.pngPreviewStatus,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveProjectBlob из замыкания
    [siteId, remoteActive],
  )

  useEffect(() => {
    if (!viewerDwg) return
    if (!dwgDxfText && dwgPngState !== 'ready') return
    const t = window.setTimeout(() => fitDwgToView(), 180)
    return () => window.clearTimeout(t)
  }, [viewerDwg, dwgDxfText, dwgPngState, dwgPngObjectUrl])

  useEffect(() => {
    if (!featuredDrawing || featuredDrawing.kind !== 'dwg') return
    warmDwgPreview(featuredDrawing)
  }, [featuredDrawing, warmDwgPreview])

  useEffect(() => {
    if (!remoteActive || assets.length === 0) return
    prefetchAllDwgPreviews(siteId, assets, {
      remoteActive: true,
      fetchBlob: (fileId) => resolveProjectBlob(fileId),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- прогрев при смене списка файлов
  }, [siteId, remoteActive, assets])

  return (
    <>
      {canUpload ? (
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          multiple
          accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.txt,.csv,application/pdf,image/*"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      ) : null}

      <aside
        className={`${styles.shell} ${embedded ? styles.shellEmbedded : ''}`}
        aria-label="Чертёж и файлы проекта"
      >
        <span className={styles.shellRail} aria-hidden />
        <div className={styles.shellInner}>
          {loading && !featuredDrawing ? (
            <p className={styles.pending}>Загружаем чертёж…</p>
          ) : (
            <>
              <div className={styles.copy}>
                <p className={styles.kicker}>
                  <span className={styles.kickerDot} aria-hidden />
                  Чертёж
                </p>
                {featuredDrawing ? (
                  <>
                    <h3 className={styles.title} title={featuredDrawing.name}>
                      {featuredDrawing.name}
                    </h3>
                    <p className={styles.lead}>
                      <span className={styles.kind}>DWG</span>
                      <span className={styles.dot} aria-hidden>
                        ·
                      </span>
                      <span>{formatSize(featuredDrawing.sizeBytes)}</span>
                      <span className={styles.leadSep} aria-hidden />
                      <a
                        className={styles.textLink}
                        href={featuredDrawing.url}
                        download={featuredDrawing.name}
                      >
                        Скачать
                      </a>
                      {canUpload ? (
                        <button
                          type="button"
                          className={styles.textLinkDanger}
                          onClick={() => void removeAsset(featuredDrawing)}
                        >
                          Удалить
                        </button>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className={styles.title}>Чертёж ещё не загружен</h3>
                    <p className={styles.lead}>
                      DWG, сметы и акты — в папке файлов
                    </p>
                  </>
                )}
              </div>

              <div className={styles.actions}>
                {featuredDrawing ? (
                  <button
                    type="button"
                    className={styles.ctaPrimary}
                    onClick={() => void openProjectAsset(featuredDrawing)}
                    onPointerEnter={() => warmDwgPreview(featuredDrawing)}
                  >
                    Открыть
                  </button>
                ) : canUpload ? (
                  <button
                    type="button"
                    className={styles.ctaPrimary}
                    onClick={() => setFolderOpen(true)}
                  >
                    Загрузить
                  </button>
                ) : null}

                <button
                  type="button"
                  className={styles.ctaSoft}
                  onClick={() => setFolderOpen(true)}
                >
                  Документы
                </button>
              </div>
            </>
          )}
        </div>

        {canUpload && !loading && hasLocalOnly ? (
          <div className={styles.hintRow}>
            <p className={styles.hint}>Есть файлы только на этом устройстве.</p>
            <button
              type="button"
              className={styles.textLink}
              onClick={() => {
                syncBlockedRef.current = false
                void loadAssets({ silent: true })
              }}
            >
              Отправить
            </button>
          </div>
        ) : null}
        {syncMessage ? <p className={styles.hint}>{syncMessage}</p> : null}
      </aside>

      {folderOpen
        ? createPortal(
            <div
              className={styles.folderScreen}
              role="dialog"
              aria-modal="true"
              aria-label="Документы объекта"
            >
              <header className={styles.folderBar}>
                <div className={styles.folderBarLeft}>
                  <span className={styles.folderIcon} aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                      <path
                        d="M3.5 8.2V7a1.8 1.8 0 0 1 1.8-1.8h4.1L11 6.8h8.7A1.8 1.8 0 0 1 21.5 8.6v1"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M3.5 10h17v7.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V10Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                        fill="rgba(23,42,77,0.06)"
                      />
                    </svg>
                  </span>
                  <div className={styles.folderBarCopy}>
                    <nav className={styles.folderPath} aria-label="Путь">
                      <button
                        type="button"
                        className={styles.pathCrumb}
                        onClick={() => setCurrentFolderId(null)}
                      >
                        Документы
                      </button>
                      {folderTrail.map((folder) => (
                        <span key={folder.id} className={styles.pathSegment}>
                          <span className={styles.pathSep} aria-hidden>
                            /
                          </span>
                          <button
                            type="button"
                            className={styles.pathCrumb}
                            onClick={() => setCurrentFolderId(folder.id)}
                          >
                            {folder.name}
                          </button>
                        </span>
                      ))}
                    </nav>
                    <h2 className={styles.folderTitle}>
                      {folderTrail.length > 0
                        ? folderTrail[folderTrail.length - 1]!.name
                        : 'Документы объекта'}
                    </h2>
                  </div>
                </div>
                <div className={styles.folderBarActions}>
                  {canUpload ? (
                    <>
                      <button
                        type="button"
                        className={styles.folderBtnGhost}
                        disabled={busy}
                        onClick={() => {
                          setNewFolderOpen(true)
                          setNewFolderName('')
                        }}
                      >
                        Новая папка
                      </button>
                      <button
                        type="button"
                        className={styles.folderBtn}
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {busy ? 'Загрузка…' : 'Загрузить файлы'}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={styles.folderBtnGhost}
                    onClick={() => {
                      setFolderOpen(false)
                      setCurrentFolderId(null)
                      setNewFolderOpen(false)
                    }}
                  >
                    Закрыть
                  </button>
                </div>
              </header>

              {newFolderOpen ? (
                <div className={styles.newFolderBar}>
                  <input
                    className={styles.newFolderInput}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Название папки"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createFolder()
                      if (e.key === 'Escape') setNewFolderOpen(false)
                    }}
                  />
                  <button
                    type="button"
                    className={styles.folderBtn}
                    disabled={busy || !newFolderName.trim()}
                    onClick={() => void createFolder()}
                  >
                    Создать
                  </button>
                  <button
                    type="button"
                    className={styles.folderBtnGhost}
                    onClick={() => setNewFolderOpen(false)}
                  >
                    Отмена
                  </button>
                </div>
              ) : null}

              <div className={styles.folderPane}>
                {loading && assets.length === 0 ? (
                  <div className={styles.empty}>
                    <p className={styles.emptyTitle}>Загружаем папку…</p>
                  </div>
                ) : null}

                {!loading && archiveFiles.length === 0 ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyFolderIcon} aria-hidden>
                      <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
                        <path
                          d="M3.5 8.2V7a1.8 1.8 0 0 1 1.8-1.8h4.1L11 6.8h8.7A1.8 1.8 0 0 1 21.5 8.6v1"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M3.5 10h17v7.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V10Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <p className={styles.emptyTitle}>Папка пуста</p>
                    <p className={styles.emptyHint}>
                      Создайте подпапки (сметы, акты) или загрузите файлы сюда
                    </p>
                    {canUpload ? (
                      <div className={styles.emptyActions}>
                        <button
                          type="button"
                          className={styles.folderBtnGhost}
                          disabled={busy}
                          onClick={() => {
                            setNewFolderOpen(true)
                            setNewFolderName('')
                          }}
                        >
                          Новая папка
                        </button>
                        <button
                          type="button"
                          className={styles.folderBtn}
                          disabled={busy}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Загрузить файлы
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {archiveFiles.length > 0 ? (
                  <div className={styles.browser}>
                    <div className={styles.browserHead} aria-hidden>
                      <span className={styles.colName}>Имя</span>
                      <span className={styles.colType}>Тип</span>
                      <span className={styles.colSize}>Размер</span>
                      <span className={styles.colDate}>Дата</span>
                      <span className={styles.colActions} />
                    </div>
                    <ul className={styles.browserList}>
                      {archiveFiles.map((row) => {
                        const isFolder = row.kind === 'folder'
                        const previewable = !isFolder && canPreviewInApp(row)
                        return (
                          <li key={row.id} className={styles.browserRow}>
                            <button
                              type="button"
                              className={styles.fileMain}
                              onClick={() => {
                                if (isFolder) {
                                  setCurrentFolderId(row.id)
                                  return
                                }
                                openProjectAsset(row)
                              }}
                              title={
                                isFolder
                                  ? 'Открыть папку'
                                  : previewable
                                    ? 'Открыть'
                                    : 'Скачать'
                              }
                            >
                              <span
                                className={`${styles.fileIcon} ${
                                  isFolder
                                    ? styles.fileIconFolder
                                    : row.kind === 'pdf'
                                      ? styles.fileIconPdf
                                      : row.kind === 'dwg'
                                        ? styles.fileIconDwg
                                        : styles.fileIconGeneric
                                }`}
                                aria-hidden
                              >
                                {isFolder ? (
                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                    <path
                                      d="M3.5 8.2V7a1.8 1.8 0 0 1 1.8-1.8h4.1L11 6.8h8.7A1.8 1.8 0 0 1 21.5 8.6v1"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M3.5 10h17v7.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V10Z"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinejoin="round"
                                      fill="currentColor"
                                      fillOpacity="0.12"
                                    />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                                    <path
                                      d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M14 3.5V8h4"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className={styles.fileName}>{row.name}</span>
                            </button>
                            <span className={styles.colType}>{kindLabel(row.kind, row.name)}</span>
                            <span className={styles.colSize}>
                              {isFolder ? '—' : formatSize(row.sizeBytes)}
                            </span>
                            <span className={styles.colDate}>
                              {formatUploaded(row.uploadedAtIso)}
                            </span>
                            <span className={styles.colActions}>
                              {isFolder ? (
                                <button
                                  type="button"
                                  className={styles.rowBtn}
                                  onClick={() => setCurrentFolderId(row.id)}
                                >
                                  Открыть
                                </button>
                              ) : null}
                              {previewable ? (
                                <button
                                  type="button"
                                  className={styles.rowBtn}
                                  onClick={() => openProjectAsset(row)}
                                >
                                  Открыть
                                </button>
                              ) : null}
                              {!isFolder ? (
                                <a className={styles.rowBtn} href={row.url} download={row.name}>
                                  Скачать
                                </a>
                              ) : null}
                              {canUpload ? (
                                <button
                                  type="button"
                                  className={styles.rowBtnDanger}
                                  onClick={() => void removeAsset(row)}
                                >
                                  Удалить
                                </button>
                              ) : null}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {viewerPdf
        ? createPortal(
            <div
              className={styles.viewerScreen}
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр PDF"
            >
              <div className={styles.viewer}>
                <div className={styles.viewerHead}>
                  <div>
                    <p className={styles.viewerKicker}>Проект</p>
                    <p className={styles.viewerTitle}>{viewerPdf.name}</p>
                  </div>
                  <div className={styles.viewerActions}>
                    <a className={styles.viewerBtn} href={viewerPdf.url} download={viewerPdf.name}>
                      Скачать PDF
                    </a>
                    <button
                      type="button"
                      className={styles.viewerBtnClose}
                      onClick={() => setViewerPdf(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
                <iframe className={styles.frame} src={viewerPdf.url} title="PDF проекта" />
              </div>
            </div>,
            document.body,
          )
        : null}

      {viewerDwg
        ? createPortal(
            <div
              className={styles.viewerScreen}
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр DWG"
            >
              <div className={styles.viewer}>
                <div className={styles.viewerHeadDark}>
                  <div>
                    <p className={styles.viewerKickerDark}>Проект</p>
                    <p className={styles.viewerTitleDark}>{viewerDwg.name}</p>
                  </div>
                  <div className={styles.viewerActions}>
                    <a className={styles.viewerBtn} href={viewerDwg.url} download={viewerDwg.name}>
                      Скачать DWG
                    </a>
                    <button
                      type="button"
                      className={styles.viewerBtnClose}
                      onClick={() => {
                        setViewerDwg(null)
                        setDwgDxfText(null)
                        setDwgLoadState('idle')
                        setDwgLoadPhase(null)
                        dwgLayersLoadedRef.current = false
                        clearDwgPngObjectUrl()
                      }}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
                <div className={styles.dwgCanvasWrap} ref={dwgCanvasWrapRef}>
                  {viewerDwg?.dxfPreviewEngine === 'libredwg' ? (
                    <p className={styles.dwgPreviewWarn}>
                      Чертёж открыт в упрощённом режиме — часть линий может не отображаться. Нажмите
                      «Обновить чертёж» или обратитесь к администратору (нужен ACadSharp на сервере).
                    </p>
                  ) : null}
                  {dwgLoadState === 'error' ? (
                    <div className={styles.dwgError}>
                      <p className={styles.dwgLoading}>
                        {dwgErrorDetail ?? 'Не удалось открыть DWG в браузере.'}
                      </p>
                      {viewerDwg ? (
                        <a className={styles.viewerBtn} href={viewerDwg.url} download={viewerDwg.name}>
                          Скачать DWG
                        </a>
                      ) : null}
                    </div>
                  ) : !dwgDxfText &&
                    !(remoteActive && (dwgPngState === 'loading' || dwgPngState === 'ready')) ? (
                    <p className={styles.dwgLoading}>
                      {dwgLoadPhase === 'converting'
                        ? 'Готовим чертёж к просмотру…'
                        : 'Загружаем чертёж…'}
                    </p>
                  ) : (
                    <DwgViewerChrome
                      key={viewerDwg.id}
                      dxfText={dwgDxfText ?? ''}
                      pngUrl={dwgPngObjectUrl}
                      pngState={dwgPngState}
                      pngWorldMeta={dwgPngWorldMeta}
                      preferPlan={remoteActive}
                      drawingName={viewerDwg.name}
                      cadRef={dwgCadRef}
                      rasterRef={dwgRasterRef}
                      wrapRef={dwgCanvasWrapRef}
                      onLayersLoaded={handleDwgLayersLoaded}
                      onRasterBlank={() => {
                        if (dwgPngRevokeRef.current) {
                          URL.revokeObjectURL(dwgPngRevokeRef.current)
                          dwgPngRevokeRef.current = null
                        }
                        setDwgPngObjectUrl(null)
                        setDwgPngState('failed')
                      }}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {viewerOffice
        ? createPortal(
            <ProjectOfficeViewer
              name={viewerOffice.name}
              url={viewerOffice.url}
              mode={
                projectOpenMode(viewerOffice) as 'image' | 'spreadsheet' | 'word' | 'text'
              }
              resolveBlob={() => resolveProjectBlob(viewerOffice.id)}
              onClose={() => setViewerOffice(null)}
            />,
            document.body,
          )
        : null}
    </>
  )
}
