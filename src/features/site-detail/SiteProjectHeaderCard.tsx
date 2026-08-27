import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CadViewer, type CadViewerRef } from '@cadview/react'
import { convertDwgToDxf, dwgConverter, initWasm } from '@cadview/dwg'
import { computeEntitiesBounds, fitToView as coreFitToView } from '@cadview/core'
import {
  collectDescendantIds,
  deleteProjectFile,
  detectProjectFileKind,
  getProjectFileBlob,
  listProjectFilesBySite,
  projectParentId,
  pruneProjectFilesToRemote,
  putProjectFile,
  putProjectFileMeta,
  type StoredSiteProjectFile,
} from '../../lib/siteProjectFilesRepository'
import {
  createProjectFileRemote,
  deleteProjectFileRemote,
  describeRemoteWriteError,
  fetchProjectFileBlobRemote,
  fetchProjectFilesRemote,
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

function kindLabel(kind: StoredSiteProjectFile['kind']): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'dwg') return 'DWG'
  if (kind === 'folder') return 'Папка'
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
  const [dwgFile, setDwgFile] = useState<File | null>(null)
  const [dwgDxfText, setDwgDxfText] = useState<string | null>(null)
  const [dwgLoadState, setDwgLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [remoteActive, setRemoteActive] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const dwgLayersLoadedRef = useRef(false)
  const dwgCadRef = useRef<CadViewerRef | null>(null)
  const dwgCanvasWrapRef = useRef<HTMLDivElement | null>(null)

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
      const prevSig = prev.map((r) => `${r.kind}:${r.id}:${r.parentId ?? ''}:${r.sizeBytes}`).join('|')
      const nextSig = resolved.map((r) => `${r.kind}:${r.id}:${r.parentId ?? ''}:${r.sizeBytes}`).join('|')
      if (prevSig === nextSig) return prev
      return resolved
    })
  }, [siteId])

  const smartFitToRoad = () => {
    const viewer = dwgCadRef.current?.getViewer()
    const wrap = dwgCanvasWrapRef.current
    const width = wrap?.clientWidth ?? 0
    const height = wrap?.clientHeight ?? 0

    if (!viewer || !width || !height) {
      dwgCadRef.current?.fitToView()
      return
    }

    const ROAD_TYPES = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE'])
    const entities = viewer.getEntities()
    const roadEntities = entities.filter((e) => e.visible && ROAD_TYPES.has(e.type))

    if (roadEntities.length === 0) {
      dwgCadRef.current?.fitToView()
      return
    }

    const bbox = computeEntitiesBounds(roadEntities, viewer.getDocument() ?? undefined)
    if (!bbox) {
      dwgCadRef.current?.fitToView()
      return
    }

    const cx = (bbox.minX + bbox.maxX) / 2
    const cy = (bbox.minY + bbox.maxY) / 2
    const vt = coreFitToView(width, height, bbox.minX, bbox.minY, bbox.maxX, bbox.maxY, 0.06)

    viewer.zoomTo(vt.scale)
    viewer.panTo(cx, cy)
  }

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
    const id = window.setInterval(tick, 8000)
    return () => window.clearInterval(id)
  }, [canUpload, loadAssets, refreshFromRemote])

  useEffect(() => {
    const anyOpen = viewerPdf != null || viewerDwg != null || folderOpen
    if (!anyOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewerPdf || viewerDwg) {
          setViewerPdf(null)
          setViewerDwg(null)
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
  }, [viewerPdf, viewerDwg, folderOpen])

  const hasLocalOnly = useMemo(() => assets.some((row) => row.url.startsWith('blob:')), [assets])

  const featuredDrawing = useMemo(() => {
    const dwgs = assets.filter((row) => row.kind === 'dwg')
    if (dwgs.length === 0) return null
    // Основной чертёж — самый ранний DWG, остальные остаются в папке.
    return [...dwgs].sort((a, b) => a.uploadedAtIso.localeCompare(b.uploadedAtIso))[0]
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
      await deleteProjectFile(id)
    }
    setAssets((prev) => {
      for (const item of prev) {
        if (toRemove.includes(item.id)) revokeIfBlobUrl(item.url)
      }
      return prev.filter((item) => !toRemove.includes(item.id))
    })
    if (viewerPdf && toRemove.includes(viewerPdf.id)) setViewerPdf(null)
    if (viewerDwg && toRemove.includes(viewerDwg.id)) {
      setViewerDwg(null)
      setDwgFile(null)
      setDwgDxfText(null)
      setDwgLoadState('idle')
      dwgLayersLoadedRef.current = false
    }
    if (currentFolderId && toRemove.includes(currentFolderId)) {
      setCurrentFolderId(null)
    }
    if (serverReachable) void refreshFromRemote()
  }

  const openDwgViewer = async (row: ProjectAsset) => {
    setViewerPdf(null)
    setViewerDwg(row)
    setDwgFile(null)
    setDwgDxfText(null)
    setDwgLoadState('loading')
    dwgLayersLoadedRef.current = false
    try {
      await initWasm()
      const blob = await resolveProjectBlob(row.id)
      if (!blob) throw new Error('dwg_blob_missing')
      const file = new File([blob], row.name, { type: row.mime || 'application/acad' })
      setDwgFile(file)
    } catch {
      setDwgLoadState('error')
    }
  }

  useEffect(() => {
    if (!viewerDwg) return
    if (!dwgFile && !dwgDxfText) return
    const t = window.setTimeout(() => smartFitToRoad(), 180)
    return () => window.clearTimeout(t)
  }, [viewerDwg, dwgFile, dwgDxfText])

  useEffect(() => {
    if (!viewerDwg) return
    if (dwgLoadState !== 'loading') return
    if (!dwgFile) return
    if (dwgDxfText) return

    const currentDwgId = viewerDwg.id
    let cancelled = false

    const t = window.setTimeout(async () => {
      if (cancelled) return
      if (dwgLayersLoadedRef.current) return

      try {
        const blob = await resolveProjectBlob(currentDwgId)
        if (!blob) throw new Error('dwg_blob_missing')
        const arrayBuffer = await blob.arrayBuffer()
        const dxfText = await convertDwgToDxf(arrayBuffer, { timeout: 60000 })
        if (!dxfText || dxfText.trim().length === 0) throw new Error('dwg_to_dxf_empty')
        if (cancelled) return
        setDwgDxfText(dxfText)
      } catch {
        if (cancelled) return
        setDwgLoadState('error')
      }
    }, 15000)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [viewerDwg, dwgLoadState, dwgFile, dwgDxfText])

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
                    onClick={() => void openDwgViewer(featuredDrawing)}
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
                        const canOpen = row.kind === 'pdf' || row.kind === 'dwg'
                        return (
                          <li key={row.id} className={styles.browserRow}>
                            <button
                              type="button"
                              className={styles.fileMain}
                              disabled={!isFolder && !canOpen}
                              onClick={() => {
                                if (isFolder) {
                                  setCurrentFolderId(row.id)
                                  return
                                }
                                if (row.kind === 'pdf') {
                                  setViewerDwg(null)
                                  setViewerPdf(row)
                                } else if (row.kind === 'dwg') {
                                  void openDwgViewer(row)
                                }
                              }}
                              title={isFolder ? 'Открыть папку' : canOpen ? 'Открыть' : row.name}
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
                            <span className={styles.colType}>{kindLabel(row.kind)}</span>
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
                              {canOpen ? (
                                <button
                                  type="button"
                                  className={styles.rowBtn}
                                  onClick={() => {
                                    if (row.kind === 'pdf') {
                                      setViewerDwg(null)
                                      setViewerPdf(row)
                                    } else {
                                      void openDwgViewer(row)
                                    }
                                  }}
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
                    <button
                      type="button"
                      className={styles.viewerBtn}
                      onClick={() => smartFitToRoad()}
                    >
                      Подогнать
                    </button>
                    <a className={styles.viewerBtn} href={viewerDwg.url} download={viewerDwg.name}>
                      Скачать DWG
                    </a>
                    <button
                      type="button"
                      className={styles.viewerBtnClose}
                      onClick={() => setViewerDwg(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
                <div className={styles.dwgCanvasWrap} ref={dwgCanvasWrapRef}>
                  {dwgLoadState === 'error' ? (
                    <p className={styles.dwgLoading}>Не удалось открыть DWG в браузере.</p>
                  ) : !dwgFile && !dwgDxfText ? (
                    <p className={styles.dwgLoading}>Открываем DWG…</p>
                  ) : (
                    <CadViewer
                      ref={dwgCadRef}
                      file={dwgDxfText ?? dwgFile}
                      theme="dark"
                      tool="pan"
                      formatConverters={dwgFile ? [dwgConverter] : undefined}
                      options={{
                        minZoom: 0.001,
                        maxZoom: 2000,
                        zoomSpeed: 1.035,
                      }}
                      onLayersLoaded={() => {
                        dwgLayersLoadedRef.current = true
                        setDwgLoadState('idle')
                        smartFitToRoad()
                      }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
