import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type CadViewerRef } from '@cadview/react'
import {
  evictDwgPreviewMemoryForFile,
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
import { lockViewerViewport } from '../../lib/lockViewerViewport'
import { canPreviewInApp, projectOpenMode } from '../../lib/projectFileOpen'
import { listAllSites } from '../../lib/sitesRepository'
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
  featureProjectFileRemote,
  fetchProjectFileBlobRemote,
  fetchProjectFilesRemote,
  fetchProjectFilePngPreviewRemote,
  fetchProjectFilePngWorldMetaRemote,
  hasWriteSecret,
  projectFileBlobUrl,
  projectFilePngPreviewUrl,
  replaceProjectFileBlobRemote,
} from '../../lib/siteFormsApi'
import { dropDwgPlanMarksForDeletedFile } from '../../lib/dwgPlanMarksRepository'
import { pickFeaturedDrawing } from '../../lib/featuredDrawing'
import { ensureCkkbHandoverFolder } from '../../lib/ckkbHandoverDocs'
import { ensureCompletedWorksFolder } from '../../lib/completedWorksDocs'
import styles from './SiteProjectHeaderCard.module.css'

function pendingStorageKey(siteId: string) {
  return `deloresh-pf-pending:${siteId}`
}

function deletedStorageKey(siteId: string) {
  return `deloresh-pf-deleted:${siteId}`
}

function readIdSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

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

/** Сколько ждать PNG: на слабой сети 2 МБ легко идут 40–90 сек. */
function pngPreviewTimeoutMs(row: Pick<StoredSiteProjectFile, 'pngPreviewStatus'>): number {
  if (row.pngPreviewStatus === 'ready') return 180_000
  if (row.pngPreviewStatus === 'failed') return 360_000
  return 240_000
}

function pngRequestTimeoutMs(row: Pick<StoredSiteProjectFile, 'pngPreviewStatus'>): number {
  // Один HTTP-запрос: не рвать на 30с — Opera/мобильный VPN часто медленнее.
  if (row.pngPreviewStatus === 'ready') return 120_000
  if (row.pngPreviewStatus === 'failed') return 90_000
  return 90_000
}

export function SiteProjectHeaderCard({ siteId, canUpload, embedded = false }: Props) {
  const siteName = listAllSites().find((s) => s.id === siteId)?.name ?? siteId
  const canWrite = canUpload && hasWriteSecret()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const replaceTargetRef = useRef<string | null>(null)
  const assetsRef = useRef<ProjectAsset[]>([])
  const busyRef = useRef(false)
  const syncBlockedRef = useRef(false)
  /** Локальные id, которые ещё ждут отправки на сервер (не «воскрешать» удалённые чужие). */
  const pendingSyncIdsRef = useRef<Set<string>>(readIdSet(pendingStorageKey(siteId)))
  const deletedIdsRef = useRef<Set<string>>(readIdSet(deletedStorageKey(siteId)))

  const persistPending = () => writeIdSet(pendingStorageKey(siteId), pendingSyncIdsRef.current)
  const persistDeleted = () => writeIdSet(deletedStorageKey(siteId), deletedIdsRef.current)

  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewerPdf, setViewerPdf] = useState<ProjectAsset | null>(null)
  const [viewerDwg, setViewerDwg] = useState<ProjectAsset | null>(null)
  const [viewerOffice, setViewerOffice] = useState<ProjectAsset | null>(null)
  const [dwgDxfText, setDwgDxfText] = useState<string | null>(null)
  const [dwgLoadState, setDwgLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [, setDwgLoadPhase] = useState<DwgLoadPhase | null>(null)
  const [dwgErrorDetail, setDwgErrorDetail] = useState<string | null>(null)
  const [remoteActive, setRemoteActive] = useState(false)
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

  const viewerOpen = Boolean(viewerPdf || viewerDwg || viewerOffice)
  useEffect(() => {
    if (!viewerOpen) return
    return lockViewerViewport()
  }, [viewerOpen])

  const revokeIfBlobUrl = (url: string) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const resolveProjectBlob = async (fileId: string): Promise<Blob | null> => {
    const remote = await fetchProjectFileBlobRemote(siteId, fileId)
    if (remote && remote.size > 0) {
      setRemoteActive(true)
      return remote
    }
    return getProjectFileBlob(fileId)
  }

  const queueLocalFilesMissingOnRemote = (
    localRows: readonly StoredSiteProjectFile[],
    remoteIds: ReadonlySet<string>,
  ) => {
    for (const local of localRows) {
      if (remoteIds.has(local.id)) {
        deletedIdsRef.current.delete(local.id)
        continue
      }
      // Не поднимать с диска то, что пользователь уже удалил на сервере.
      if (deletedIdsRef.current.has(local.id)) continue
      // Только уже известные pending (после перезагрузки — из sessionStorage).
      if (pendingSyncIdsRef.current.has(local.id)) continue
      // Старый кэш без pending: не синкать обратно, а отдать prune.
    }
    persistDeleted()
  }

  const hydrateAssetsFromLocal = async (outBlobUrls: string[]): Promise<ProjectAsset[]> => {
    const localRows = await listProjectFilesBySite(siteId)
    const resolved: ProjectAsset[] = []
    for (const row of localRows) {
      if (row.kind === 'folder') {
        resolved.push({ ...row, url: '' })
        continue
      }
      if (pendingSyncIdsRef.current.has(row.id)) {
        const blob = await getProjectFileBlob(row.id)
        if (blob) {
          const url = URL.createObjectURL(blob)
          outBlobUrls.push(url)
          resolved.push({ ...row, url })
          continue
        }
      }
      resolved.push({ ...row, url: projectFileBlobUrl(siteId, row.id) })
    }
    resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
    return resolved
  }

  const loadAssets = useCallback(async (opts?: { silent?: boolean }): Promise<string[]> => {
    const blobUrls: string[] = []
    if (!opts?.silent) setLoading(true)
    try {
      if (!opts?.silent) {
        try {
          const localFirst = await hydrateAssetsFromLocal(blobUrls)
          if (localFirst.length > 0) {
            setAssets(localFirst)
            setLoading(false)
          }
        } catch {
          /* IndexedDB недоступен */
        }
      }

      const remoteRows = await fetchProjectFilesRemote(siteId)
      const remoteAvailable = remoteRows !== null
      if (remoteAvailable) setRemoteActive(true)

      if (remoteAvailable && remoteRows) {
        const remoteIds = new Set(remoteRows.map((row) => row.id))
        queueLocalFilesMissingOnRemote(await listProjectFilesBySite(siteId), remoteIds)

        await pruneProjectFilesToRemote(siteId, remoteIds, pendingSyncIdsRef.current)

        const resolved: ProjectAsset[] = remoteRows.map((row) => ({
          ...row,
          url: row.kind === 'folder' ? '' : projectFileBlobUrl(siteId, row.id),
        }))

        const localRows = await listProjectFilesBySite(siteId)
        for (const local of localRows) {
          if (!pendingSyncIdsRef.current.has(local.id)) continue
          if (remoteIds.has(local.id)) {
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
        void syncPendingToRemote()
        return blobUrls
      }

      const localRows = await listProjectFilesBySite(siteId)
      queueLocalFilesMissingOnRemote(localRows, new Set())
      const resolved: ProjectAsset[] = []
      for (const row of localRows) {
        if (row.kind === 'folder') {
          resolved.push({ ...row, url: '' })
          continue
        }
        if (pendingSyncIdsRef.current.has(row.id)) {
          const blob = await getProjectFileBlob(row.id)
          if (blob) {
            const url = URL.createObjectURL(blob)
            blobUrls.push(url)
            resolved.push({ ...row, url })
            continue
          }
        }
        resolved.push({ ...row, url: projectFileBlobUrl(siteId, row.id) })
      }
      resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
      setAssets(resolved)
      void syncPendingToRemote()
      return blobUrls
    } finally {
      if (!opts?.silent) setLoading(false)
    }
    // syncPendingToRemote объявлен ниже — вызываем после hydrate осознанно
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const syncPendingToRemote = useCallback(async () => {
    if (!canWrite || syncBlockedRef.current || pendingSyncIdsRef.current.size === 0) return
    if (import.meta.env.DEV && !hasWriteSecret()) {
      syncBlockedRef.current = true
      return
    }

    const remoteRows = await fetchProjectFilesRemote(siteId)
    if (!remoteRows) return
    setRemoteActive(true)
    const remoteIds = new Set(remoteRows.map((row) => row.id))
    const localRows = await listProjectFilesBySite(siteId)
    const toUpload = localRows.filter(
      (local) => pendingSyncIdsRef.current.has(local.id) && !remoteIds.has(local.id),
    )
    if (toUpload.length === 0) return

    for (const local of toUpload) {
      try {
        if (local.kind === 'folder') {
          const result = await createProjectFileRemote(siteId, local)
          if (result.ok) {
            pendingSyncIdsRef.current.delete(local.id)
            syncBlockedRef.current = false
          } else if (result.reason === 'forbidden') {
            syncBlockedRef.current = true
          }
          continue
        }
        const blob = await getProjectFileBlob(local.id)
        if (!blob) continue
        const result = await createProjectFileRemote(siteId, local, blob)
        if (result.ok) {
          pendingSyncIdsRef.current.delete(local.id)
          syncBlockedRef.current = false
        } else if (result.reason === 'forbidden') {
          syncBlockedRef.current = true
        }
      } catch {
        /* повторим на следующем цикле */
      }
    }

    await refreshFromRemote()
  }, [canWrite, siteId, refreshFromRemote])

  const clearDwgPngObjectUrl = () => {
    if (dwgPngRevokeRef.current) {
      if (dwgPngRevokeRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(dwgPngRevokeRef.current)
      }
      dwgPngRevokeRef.current = null
    }
    setDwgPngObjectUrl(null)
    setDwgPngWorldMeta(null)
    setDwgPngState('idle')
  }

  /** Мгновенный показ PNG по URL. Не доверяем локальному failed — сервер источник правды. */
  const applyPngUrl = (url: string, worldBounds: PngPreviewWorldMeta | null) => {
    dwgPngRevokeRef.current = null
    setDwgPngObjectUrl(url)
    setDwgPngWorldMeta(worldBounds)
    setDwgPngState('ready')
    setRemoteActive(true)
    setDwgDxfText('')
    setDwgLoadState('idle')
    setDwgLoadPhase(null)
  }

  /** Сразу ставим URL плана — браузер стримит сам. Не ждём onload. */
  const openServerPngNow = (row: ProjectAsset) => {
    const cacheKey = row.pngPreviewAtIso ?? row.uploadedAtIso ?? '1'
    const url = projectFilePngPreviewUrl(siteId, row.id, cacheKey)
    applyPngUrl(url, parsePngWorldMeta(row.pngWorldBounds))
    if (!parsePngWorldMeta(row.pngWorldBounds)?.pixelsPerUnit) {
      void fetchProjectFilePngWorldMetaRemote(siteId, row.id).then((meta) => {
        if (meta) setDwgPngWorldMeta(meta)
      })
    }
  }

  const openDxfFallback = async (row: ProjectAsset, openGen: number) => {
    setDwgLoadState('loading')
    setDwgLoadPhase('fetching')
    setDwgPngState('failed')
    try {
      const dxfText = await resolveDwgDxfText(siteId, row.id, row.uploadedAtIso, {
        remoteActive: true,
        fetchBlob: () => resolveProjectBlob(row.id),
        onPhase: (phase) => {
          if (dwgOpenGenRef.current === openGen) setDwgLoadPhase(phase)
        },
        dxfPreviewAtIso: row.dxfPreviewAtIso,
      })
      if (dwgOpenGenRef.current !== openGen) return
      setDwgDxfText(dxfText)
      setDwgLoadState('idle')
      setDwgLoadPhase(null)
    } catch {
      if (dwgOpenGenRef.current !== openGen) return
      setDwgErrorDetail('Не удалось открыть чертёж. Проверьте интернет и нажмите «Открыть» снова.')
      setDwgLoadState('error')
      setDwgLoadPhase(null)
    }
  }

  const loadDwgPng = useCallback(
    async (
      row: ProjectAsset,
      opts?: { regenerate?: boolean; timeoutMs?: number },
    ): Promise<boolean> => {
      const openGen = dwgOpenGenRef.current
      const shouldRegenerate = opts?.regenerate === true
      setDwgPngState('loading')
      try {
        const cacheKey = row.pngPreviewAtIso ?? row.uploadedAtIso
        if (!shouldRegenerate) {
          const url = projectFilePngPreviewUrl(siteId, row.id, cacheKey)
          const worldBounds =
            parsePngWorldMeta(row.pngWorldBounds) ??
            (await fetchProjectFilePngWorldMetaRemote(siteId, row.id))
          if (dwgOpenGenRef.current !== openGen) return false
          dwgPngRevokeRef.current = null
          setDwgPngObjectUrl(url)
          setDwgPngWorldMeta(worldBounds)
          setDwgPngState('ready')
          setRemoteActive(true)
          return true
        }
        const prefetched =
          !shouldRegenerate ? getPrefetchedDwgPng(row.id, cacheKey) : undefined
        const fetched =
          prefetched == null
            ? await fetchProjectFilePngPreviewRemote(siteId, row.id, {
                cacheKey,
                regenerate: shouldRegenerate,
                timeoutMs: opts?.timeoutMs ?? pngPreviewTimeoutMs(row),
                requestTimeoutMs: pngRequestTimeoutMs(row),
                onWait: () => {
                  if (dwgOpenGenRef.current === openGen) setDwgLoadPhase('converting')
                },
              })
            : prefetched
        if (dwgOpenGenRef.current !== openGen) return false
        const blob = fetched?.blob ?? null
        let worldBounds =
          fetched?.worldBounds ??
          parsePngWorldMeta(row.pngWorldBounds) ??
          null
        if (blob && !worldBounds?.pixelsPerUnit) {
          worldBounds = (await fetchProjectFilePngWorldMetaRemote(siteId, row.id)) ?? worldBounds
        }
        if (dwgOpenGenRef.current !== openGen) return false
        if (!blob) {
          setDwgPngState('failed')
          return false
        }
        if (dwgPngRevokeRef.current?.startsWith('blob:')) {
          URL.revokeObjectURL(dwgPngRevokeRef.current)
        }
        const url = URL.createObjectURL(blob)
        if (await probeRasterPreviewBlank(url)) {
          URL.revokeObjectURL(url)
          if (dwgOpenGenRef.current === openGen) setDwgPngState('failed')
          return false
        }
        if (dwgOpenGenRef.current !== openGen) {
          URL.revokeObjectURL(url)
          return false
        }
        dwgPngRevokeRef.current = url
        setDwgPngObjectUrl(url)
        setDwgPngWorldMeta(worldBounds)
        setDwgPngState('ready')
        setRemoteActive(true)
        return true
      } catch {
        if (dwgOpenGenRef.current === openGen) setDwgPngState('failed')
        return false
      }
    },
    [siteId],
  )

  const dwgPngStateRef = useRef(dwgPngState)
  const dwgPngObjectUrlRef = useRef(dwgPngObjectUrl)
  useEffect(() => {
    dwgPngStateRef.current = dwgPngState
  }, [dwgPngState])
  useEffect(() => {
    dwgPngObjectUrlRef.current = dwgPngObjectUrl
  }, [dwgPngObjectUrl])

  const handleDwgLayersLoaded = useCallback((entityCount: number) => {
    dwgLayersLoadedRef.current = true
    setDwgLoadPhase(null)
    const pngState = dwgPngStateRef.current
    const hasPng = pngState === 'ready' && Boolean(dwgPngObjectUrlRef.current)
    if (entityCount === 0 && !hasPng && pngState !== 'loading') {
      setDwgErrorDetail('Не удалось показать чертёж. Попробуйте открыть снова.')
      setDwgLoadState('error')
      return
    }
    if (!hasPng && pngState !== 'loading') {
      fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current)
      window.requestAnimationFrame(() =>
        fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current),
      )
    }
  }, [])

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
      if (document.visibilityState !== 'visible') return
      if (viewerDwg != null || viewerPdf != null || viewerOffice != null) return
      void refreshFromRemote()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshFromRemote, viewerDwg, viewerPdf, viewerOffice])

  /** Системные папки объекта: «Сдача ЦККБ …» и «Выполненные работы …». */
  useEffect(() => {
    if (!folderOpen) return
    let cancelled = false
    void (async () => {
      try {
        await Promise.all([
          ensureCkkbHandoverFolder(siteId, siteName),
          ensureCompletedWorksFolder(siteId, siteName),
        ])
        if (!cancelled) await refreshFromRemote()
      } catch {
        /* локально / без сети — папки появятся при следующей синхронизации */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderOpen, siteId, siteName, refreshFromRemote])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (busyRef.current) return
      // Пока открыт чертёж — не дёргаем список файлов: на слабой сети это
      // обрывает PNG/DXF и выглядит как «выкинуло / ошибка».
      if (viewerDwg != null || viewerPdf != null || viewerOffice != null) return
      for (const row of assetsRef.current) {
        if (row.url.startsWith('blob:')) pendingSyncIdsRef.current.add(row.id)
      }
      void syncPendingToRemote()
      if (pendingSyncIdsRef.current.size === 0) void refreshFromRemote()
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [syncPendingToRemote, refreshFromRemote, viewerDwg, viewerPdf, viewerOffice])

  useEffect(() => {
    if (!remoteActive || assets.length === 0) return
    // Не греем все DWG, пока пользователь смотрит один — экономим канал.
    if (viewerDwg != null) return
    prefetchAllDwgPreviews(siteId, assets, {
      remoteActive: true,
      fetchBlob: (fileId) => resolveProjectBlob(fileId),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- прогрев при смене списка файлов
  }, [siteId, remoteActive, assets, viewerDwg])

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

  const featuredDrawing = useMemo(() => {
    return pickFeaturedDrawing(assets.filter((row) => row.kind === 'dwg'))
  }, [assets])

  const setFeaturedDrawing = useCallback(
    async (row: ProjectAsset) => {
      if (row.kind !== 'dwg') return
      if (featuredDrawing?.id === row.id && row.featuredAtIso) return
      const featuredAtIso = new Date().toISOString()
      setAssets((prev) =>
        prev.map((item) => {
          if (item.kind !== 'dwg') return item
          if (item.id === row.id) return { ...item, featuredAtIso }
          if (!item.featuredAtIso) return item
          const next = { ...item }
          delete next.featuredAtIso
          return next
        }),
      )
      try {
        const local = await listProjectFilesBySite(siteId)
        for (const item of local) {
          if (item.kind !== 'dwg') continue
          if (item.id === row.id) {
            await putProjectFileMeta({ ...item, featuredAtIso })
          } else if (item.featuredAtIso) {
            const next = { ...item }
            delete next.featuredAtIso
            await putProjectFileMeta(next)
          }
        }
      } catch {
        /* IndexedDB может быть недоступен */
      }
      if (hasWriteSecret()) {
        const result = await featureProjectFileRemote(siteId, row.id)
        if (result.ok) void refreshFromRemote()
      }
    },
    [featuredDrawing?.id, refreshFromRemote, siteId],
  )

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
        persistPending()

        const remoteProbe = await fetchProjectFilesRemote(siteId)
        const remoteAvailable = remoteProbe !== null
        if (remoteAvailable) setRemoteActive(true)

        let syncedToRemote = false
        if (remoteAvailable) {
          const result = await createProjectFileRemote(siteId, record, file)
          if (result.ok) {
            syncedToRemote = true
            pendingSyncIdsRef.current.delete(record.id)
            persistPending()
            syncBlockedRef.current = false
          } else if (result.reason === 'forbidden') {
            syncBlockedRef.current = true
            setActionError(
              'Файл сохранён только на этом устройстве. Войдите в аккаунт, чтобы чертёж открывался на сервере.',
            )
          } else {
            pendingSyncIdsRef.current.add(record.id)
            persistPending()
            setActionError(
              'Не удалось отправить DWG на сервер. Чертёж может долго «Загружаться» — войдите и загрузите снова.',
            )
          }
        } else {
          pendingSyncIdsRef.current.add(record.id)
          persistPending()
          setActionError('Сервер недоступен — DWG пока только на этом устройстве.')
        }

        if (syncedToRemote) {
          await refreshFromRemote()
          if (kind === 'dwg') {
            try {
              const remoteRows = await fetchProjectFilesRemote(siteId)
              const remoteRow = remoteRows?.find((r) => r.id === record.id)
              await warmDwgPreviewAfterUpload(
                siteId,
                remoteRow ?? record,
                () => resolveProjectBlob(record.id),
              )
            } catch {
              /* превью догрузится при открытии */
            }
          }
        } else {
          const url = URL.createObjectURL(file)
          setAssets((prev) =>
            [{ ...record, url }, ...prev].sort((a, b) =>
              b.uploadedAtIso.localeCompare(a.uploadedAtIso),
            ),
          )
          void syncPendingToRemote()
        }
      }
    } catch {
      void syncPendingToRemote()
    } finally {
      setBusy(false)
    }
  }

  /**
   * Замена чертежа новой версией. Id файла сохраняется — значит отметки,
   * заливки и расчёты остаются на объекте, а план сервер перерисовывает сам.
   */
  const replaceDrawingFile = async (file: File | null) => {
    const targetId = replaceTargetRef.current
    replaceTargetRef.current = null
    if (!file || !targetId) return
    const target = assetsRef.current.find((row) => row.id === targetId)
    if (!target) return
    if (!canWrite) {
      setActionError('Чтобы заменить чертёж, войдите в аккаунт заново.')
      return
    }
    if (detectProjectFileKind(file) !== 'dwg') {
      setActionError('Заменить чертёж можно только файлом .dwg.')
      return
    }

    setActionError(null)
    setBusy(true)
    try {
      const record: StoredSiteProjectFile = {
        id: target.id,
        siteId,
        kind: 'dwg',
        name: file.name,
        mime: file.type || 'application/acad',
        sizeBytes: file.size,
        uploadedAtIso: new Date().toISOString(),
        parentId: projectParentId(target),
      }

      const result = await replaceProjectFileBlobRemote(siteId, record, file)
      if (!result.ok) {
        setActionError(
          result.reason === 'forbidden'
            ? 'Сервер не принял замену: войдите в аккаунт заново и повторите.'
            : 'Не удалось отправить новый чертёж на сервер. Проверьте связь и повторите.',
        )
        return
      }

      // Заменили — значит это и есть основной чертёж объекта, закрепляем выбор.
      await featureProjectFileRemote(siteId, record.id)

      // Старый план и старый DXF больше не актуальны — иначе останутся в кэше.
      await putProjectFile(record, file)
      evictDwgPreviewMemoryForFile(record.id)
      await deleteDwgDxfPreviewsForFile(record.id)
      if (viewerDwg?.id === record.id) {
        setViewerDwg(null)
        setDwgDxfText(null)
        setDwgLoadState('idle')
        dwgLayersLoadedRef.current = false
        clearDwgPngObjectUrl()
      }

      await refreshFromRemote()
      try {
        const remoteRows = await fetchProjectFilesRemote(siteId)
        const remoteRow = remoteRows?.find((r) => r.id === record.id)
        await warmDwgPreviewAfterUpload(siteId, remoteRow ?? record, () => Promise.resolve(file))
      } catch {
        /* план догрузится при открытии */
      }
      await refreshFromRemote()
    } catch {
      setActionError('Замена не удалась. Повторите попытку.')
    } finally {
      setBusy(false)
    }
  }

  const createFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setBusy(true)
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
        } else if (result.reason === 'forbidden') {
          syncBlockedRef.current = true
        }
      }

      if (synced) await refreshFromRemote()
      else {
        setAssets((prev) =>
          [{ ...record, url: '' }, ...prev].sort((a, b) =>
            b.uploadedAtIso.localeCompare(a.uploadedAtIso),
          ),
        )
        void syncPendingToRemote()
      }
      setNewFolderName('')
      setNewFolderOpen(false)
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const removeAsset = async (row: ProjectAsset) => {
    if (!canWrite) {
      setActionError('Чтобы удалить файл, войдите в аккаунт заново.')
      return
    }
    setActionError(null)
    const toRemove =
      row.kind === 'folder' ? collectDescendantIds(assets, row.id) : [row.id]
    const remoteProbe = await fetchProjectFilesRemote(siteId)
    const serverReachable = remoteProbe !== null
    if (serverReachable) setRemoteActive(true)
    if (serverReachable || remoteActive) {
      for (const id of toRemove) {
        const ok = await deleteProjectFileRemote(siteId, id)
        if (!ok) {
          setActionError(
            'Сервер не принял удаление (нет доступа или сессия истекла). Выйдите и войдите снова, затем повторите.',
          )
          return
        }
        deletedIdsRef.current.add(id)
        pendingSyncIdsRef.current.delete(id)
      }
      persistDeleted()
      persistPending()
    }
    for (const id of toRemove) {
      pendingSyncIdsRef.current.delete(id)
      deletedIdsRef.current.add(id)
      evictDwgPreviewMemoryForFile(id)
      await deleteDwgDxfPreviewsForFile(id)
      await deleteProjectFile(id)
      // Отметки удалённого чертежа держать негде — гасим и локально.
      await dropDwgPlanMarksForDeletedFile(siteId, id)
    }
    persistDeleted()
    persistPending()
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
    setFolderOpen(false)
    setViewerPdf(null)
    setViewerOffice(null)
    setViewerDwg(row)
    setDwgErrorDetail(null)
    dwgLayersLoadedRef.current = false

    const shouldRegenerate = opts?.regenerate === true
    clearDwgPngObjectUrl()

    // Обычное открытие: сразу URL PNG. Не ждём загрузку и не падаем в DXF/WASM.
    if (!shouldRegenerate) {
      openServerPngNow(row)
      warmDwgPreview({ ...row, pngPreviewStatus: 'ready' })
      return
    }

    setDwgDxfText(null)
    setDwgLoadState('loading')
    setDwgLoadPhase('fetching')
    setDwgPngState('loading')
    warmDwgPreview(row)

    const pngOk = await loadDwgPng(row, {
      regenerate: true,
      timeoutMs: pngPreviewTimeoutMs(row),
    })
    if (dwgOpenGenRef.current !== openGen) return
    if (pngOk) {
      setDwgDxfText('')
      setDwgLoadState('idle')
      setDwgLoadPhase(null)
      void refreshFromRemote()
      return
    }
    await openDxfFallback(row, openGen)
  }

  const openProjectAsset = (row: ProjectAsset) => {
    const mode = projectOpenMode(row)
    if (mode === 'pdf') {
      setFolderOpen(false)
      setViewerDwg(null)
      setViewerOffice(null)
      setViewerPdf(row)
      return
    }
    if (mode === 'dwg') {
      void setFeaturedDrawing(row)
      void openDwgViewer(row)
      return
    }
    if (mode === 'image' || mode === 'spreadsheet' || mode === 'word' || mode === 'text') {
      setFolderOpen(false)
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
      // PNG уже готов — только HTTP-прогрев картинки. DXF не трогаем (он тормозит открытие).
      if (row.pngPreviewStatus === 'ready') {
        const cacheKey = row.pngPreviewAtIso ?? row.uploadedAtIso
        const url = projectFilePngPreviewUrl(siteId, row.id, cacheKey)
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        return
      }
      prefetchDwgPngPreview(siteId, row.id, {
        cacheKey: row.pngPreviewAtIso ?? row.uploadedAtIso,
        pngPreviewStatus: row.pngPreviewStatus,
      })
      prefetchDwgPreview(siteId, row.id, row.uploadedAtIso, {
        remoteActive: true,
        fetchBlob: () => resolveProjectBlob(row.id),
        dxfPreviewAtIso: row.dxfPreviewAtIso,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveProjectBlob из замыкания
    [siteId, remoteActive],
  )

  useEffect(() => {
    if (!viewerDwg) return
    if (!dwgDxfText && dwgPngState !== 'ready') return
    const t = window.setTimeout(() => {
      if (dwgPngState === 'ready' && dwgPngObjectUrl) {
        dwgRasterRef.current?.fit()
        return
      }
      fitCadViewerToDrawing(dwgCadRef.current, dwgCanvasWrapRef.current)
    }, 180)
    return () => window.clearTimeout(t)
  }, [viewerDwg, dwgDxfText, dwgPngState, dwgPngObjectUrl])

  useEffect(() => {
    if (!featuredDrawing || featuredDrawing.kind !== 'dwg') return
    warmDwgPreview(featuredDrawing)
  }, [featuredDrawing, warmDwgPreview])

  // Пока сервер готовит план — подтягиваем статус (pending → ready) без ручного F5.
  useEffect(() => {
    if (!featuredDrawing || featuredDrawing.kind !== 'dwg') return
    if (featuredDrawing.pngPreviewStatus === 'ready') return
    if (featuredDrawing.pngPreviewStatus === 'failed') return
    const id = window.setInterval(() => {
      void refreshFromRemote()
    }, 8_000)
    return () => window.clearInterval(id)
  }, [featuredDrawing, refreshFromRemote])

  return (
    <>
      {canWrite ? (
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

      {canWrite ? (
        <input
          ref={replaceInputRef}
          className={styles.hiddenInput}
          type="file"
          accept=".dwg,application/acad"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            e.target.value = ''
            void replaceDrawingFile(file)
          }}
        />
      ) : null}

      <aside
        className={`${styles.shell} ${embedded ? styles.shellEmbedded : ''}`}
        aria-label="Чертёж и файлы проекта"
      >
        <span className={styles.shellRail} aria-hidden />
        <div className={styles.shellInner}>
          {actionError ? (
            <p className={styles.actionError} role="alert">
              {actionError}{' '}
              <button type="button" className={styles.textLink} onClick={() => setActionError(null)}>
                Скрыть
              </button>
            </p>
          ) : null}
          {loading && assets.length === 0 ? (
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
                      <span className={styles.dot} aria-hidden>
                        ·
                      </span>
                      <span
                        className={
                          featuredDrawing.pngPreviewStatus === 'ready'
                            ? styles.statusReady
                            : featuredDrawing.pngPreviewStatus === 'failed'
                              ? styles.statusFail
                              : styles.statusPending
                        }
                      >
                        {featuredDrawing.pngPreviewStatus === 'ready'
                          ? 'План готов'
                          : featuredDrawing.pngPreviewStatus === 'failed'
                            ? 'План не собрался'
                            : featuredDrawing.pngPreviewStatus === 'pending'
                              ? 'Готовим план…'
                              : 'План на сервере'}
                      </span>
                      <span className={styles.leadSep} aria-hidden />
                      <a
                        className={styles.textLink}
                        href={featuredDrawing.url}
                        download={featuredDrawing.name}
                      >
                        Скачать
                      </a>
                      {canWrite ? (
                        <button
                          type="button"
                          className={styles.textLink}
                          onClick={() => void openDwgViewer(featuredDrawing, { regenerate: true })}
                        >
                          Обновить план
                        </button>
                      ) : null}
                      {canWrite ? (
                        <button
                          type="button"
                          className={styles.textLink}
                          disabled={busy}
                          onClick={() => {
                            replaceTargetRef.current = featuredDrawing.id
                            replaceInputRef.current?.click()
                          }}
                        >
                          Заменить
                        </button>
                      ) : null}
                      {canWrite ? (
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
                ) : canWrite ? (
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
                  {currentFolderId ? (
                    <button
                      type="button"
                      className={styles.folderBackBtn}
                      title="Назад"
                      aria-label="Назад"
                      onClick={() => {
                        if (folderTrail.length <= 1) {
                          setCurrentFolderId(null)
                          return
                        }
                        setCurrentFolderId(folderTrail[folderTrail.length - 2]!.id)
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
                        <path
                          d="M15 5.5 8.5 12 15 18.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className={styles.folderBackLabel}>Назад</span>
                    </button>
                  ) : (
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
                  )}
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
                              onPointerDown={(e) => {
                                if (!isFolder && previewable) e.preventDefault()
                              }}
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
                                  onPointerDown={(e) => e.preventDefault()}
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
                  {dwgLoadState === 'error' ? (
                    <div className={styles.dwgError}>
                      <p className={styles.dwgLoading}>
                        {dwgErrorDetail ?? 'Не удалось открыть чертёж.'}
                      </p>
                      {viewerDwg ? (
                        <a className={styles.viewerBtn} href={viewerDwg.url} download={viewerDwg.name}>
                          Скачать DWG
                        </a>
                      ) : null}
                    </div>
                  ) : dwgDxfText === null && dwgPngState !== 'ready' ? (
                    <p className={styles.dwgLoading}>Загрузка…</p>
                  ) : (
                    <DwgViewerChrome
                      key={viewerDwg.id}
                      siteId={siteId}
                      siteName={siteName}
                      fileId={viewerDwg.id}
                      dxfText={dwgDxfText ?? ''}
                      pngUrl={dwgPngObjectUrl}
                      pngState={dwgPngState}
                      pngWorldMeta={dwgPngWorldMeta}
                      preferPlan={remoteActive || dwgPngState === 'loading' || dwgPngState === 'ready'}
                      drawingName={viewerDwg.name}
                      cadRef={dwgCadRef}
                      rasterRef={dwgRasterRef}
                      wrapRef={dwgCanvasWrapRef}
                      onLayersLoaded={handleDwgLayersLoaded}
                      onRasterBlank={() => {
                        if (dwgPngRevokeRef.current?.startsWith('blob:')) {
                          URL.revokeObjectURL(dwgPngRevokeRef.current)
                          dwgPngRevokeRef.current = null
                        }
                        setDwgPngObjectUrl(null)
                        setDwgPngState('failed')
                        // PNG 404 / битый — запасной DXF, без мгновенной ошибки на экране.
                        if (viewerDwg) {
                          void openDxfFallback(viewerDwg, dwgOpenGenRef.current)
                        }
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
