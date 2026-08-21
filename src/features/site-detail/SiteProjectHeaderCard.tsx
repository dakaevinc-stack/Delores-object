import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CadViewer, type CadViewerRef } from '@cadview/react'
import { convertDwgToDxf, dwgConverter, initWasm } from '@cadview/dwg'
import { computeEntitiesBounds, fitToView as coreFitToView } from '@cadview/core'
import {
  deleteProjectFile,
  getProjectFileBlob,
  listProjectFilesBySite,
  pruneProjectFilesToRemote,
  putProjectFile,
  type SiteProjectFileKind,
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

export function SiteProjectHeaderCard({ siteId, canUpload }: Props) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null)
  const dwgInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<ProjectAsset[]>([])
  const busyKindRef = useRef<SiteProjectFileKind | null>(null)
  const syncBlockedRef = useRef(false)
  /** Локальные id, которые ещё ждут отправки на сервер (не «воскрешать» удалённые чужие). */
  const pendingSyncIdsRef = useRef<Set<string>>(new Set())

  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKind, setBusyKind] = useState<SiteProjectFileKind | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [dwgViewerOpen, setDwgViewerOpen] = useState(false)
  const [dwgFile, setDwgFile] = useState<File | null>(null)
  const [dwgDxfText, setDwgDxfText] = useState<string | null>(null)
  const [dwgLoadState, setDwgLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [remoteActive, setRemoteActive] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
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
        const remoteKinds = new Set(remoteRows.map((row) => row.kind))

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
                pendingSyncIdsRef.current.has(local.id) && !remoteKinds.has(local.kind),
            )
            if (toUpload.length > 0) {
              if (!opts?.silent) setSyncMessage('Отправляем файлы на сервер…')
              let firstError: string | null = null
              for (const local of toUpload) {
                try {
                  const blob = await getProjectFileBlob(local.id)
                  if (!blob) continue
                  const result = await createProjectFileRemote(siteId, local, blob)
                  if (result.ok) {
                    pendingSyncIdsRef.current.delete(local.id)
                    remoteKinds.add(local.kind)
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
          url: projectFileBlobUrl(siteId, row.id),
        }))

        // Pending, которых ещё нет на сервере — показываем только их (ожидание синка).
        const localRows = await listProjectFilesBySite(siteId)
        const remoteKindSet = new Set(finalRemote.map((r) => r.kind))
        for (const local of localRows) {
          if (!pendingSyncIdsRef.current.has(local.id)) continue
          if (remoteKindSet.has(local.kind) || finalIds.has(local.id)) {
            pendingSyncIdsRef.current.delete(local.id)
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
      const remoteKinds = new Set(remoteRows.map((row) => row.kind))
      const resolved: ProjectAsset[] = remoteRows.map((row) => ({
        ...row,
        url: projectFileBlobUrl(siteId, row.id),
      }))
      // Оставляем только pending с этого устройства, не чужие «старые» blob.
      for (const row of prev) {
        if (!row.url.startsWith('blob:')) continue
        if (!pendingSyncIdsRef.current.has(row.id)) {
          revokeIfBlobUrl(row.url)
          continue
        }
        if (remoteKinds.has(row.kind) || remoteIds.has(row.id)) {
          pendingSyncIdsRef.current.delete(row.id)
          revokeIfBlobUrl(row.url)
          continue
        }
        resolved.push(row)
      }
      resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
      const prevSig = prev.map((r) => `${r.kind}:${r.id}:${r.sizeBytes}`).join('|')
      const nextSig = resolved.map((r) => `${r.kind}:${r.id}:${r.sizeBytes}`).join('|')
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
    busyKindRef.current = busyKind
  }, [busyKind])

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
      if (busyKindRef.current) return
      // Пока есть неотправленные — дожимаем upload; иначе только читаем сервер.
      if (canUpload && pendingSyncIdsRef.current.size > 0) void loadAssets({ silent: true })
      else void refreshFromRemote()
    }
    const id = window.setInterval(tick, 8000)
    return () => window.clearInterval(id)
  }, [canUpload, loadAssets, refreshFromRemote])

  useEffect(() => {
    const anyOpen = viewerOpen || dwgViewerOpen
    if (!anyOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewerOpen(false)
        setDwgViewerOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [viewerOpen, dwgViewerOpen])

  const pdf = useMemo(() => assets.find((row) => row.kind === 'pdf') ?? null, [assets])
  const dwg = useMemo(() => assets.find((row) => row.kind === 'dwg') ?? null, [assets])
  const hasLocalOnly = useMemo(() => assets.some((row) => row.url.startsWith('blob:')), [assets])

  const replaceAsset = async (kind: SiteProjectFileKind, file: File | null) => {
    if (!file) return
    setBusyKind(kind)
    setSyncMessage(null)
    try {
      if (kind === 'dwg') {
        setDwgViewerOpen(false)
        setDwgFile(null)
        setDwgDxfText(null)
        setDwgLoadState('idle')
        dwgLayersLoadedRef.current = false
      }

      const record: StoredSiteProjectFile = {
        id: newId(),
        siteId,
        kind,
        name: file.name,
        mime: file.type || (kind === 'pdf' ? 'application/pdf' : 'application/acad'),
        sizeBytes: file.size,
        uploadedAtIso: new Date().toISOString(),
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
          setSyncMessage(null)
        } else if (result.reason === 'network') {
          setSyncMessage('Не удалось отправить на сервер — проверьте интернет и нажмите «Отправить на сервер».')
        } else if (result.reason === 'forbidden') {
          syncBlockedRef.current = true
          setSyncMessage(describeRemoteWriteError(result, 'файл'))
        } else {
          setSyncMessage(describeRemoteWriteError(result, 'файл'))
        }
      } else {
        setSyncMessage('Сервер недоступен — файл сохранён только на этом устройстве.')
      }
      const url = syncedToRemote
        ? projectFileBlobUrl(siteId, record.id)
        : URL.createObjectURL(file)
      if (syncedToRemote) {
        await refreshFromRemote()
      } else {
        setAssets((prev) => {
          const replaced = prev.filter((row) => row.kind !== kind)
          for (const row of prev) {
            if (row.kind === kind) revokeIfBlobUrl(row.url)
          }
          return [{ ...record, url }, ...replaced]
        })
      }
    } catch {
      setSyncMessage('Не удалось сохранить файл. Попробуйте ещё раз.')
    } finally {
      setBusyKind(null)
    }
  }

  const removeAsset = async (kind: SiteProjectFileKind) => {
    const row = assets.find((item) => item.kind === kind)
    if (!row) return
    setSyncMessage(null)
    const remoteProbe = await fetchProjectFilesRemote(siteId)
    const serverReachable = remoteProbe !== null
    if (serverReachable) setRemoteActive(true)
    if (serverReachable || remoteActive) {
      const ok = await deleteProjectFileRemote(siteId, row.id)
      if (!ok) {
        setSyncMessage('Не удалось удалить файл на сервере. На других устройствах он может остаться.')
        return
      }
    }
    pendingSyncIdsRef.current.delete(row.id)
    await deleteProjectFile(row.id)
    revokeIfBlobUrl(row.url)
    setAssets((prev) => prev.filter((item) => item.id !== row.id))
    if (kind === 'pdf') setViewerOpen(false)
    if (kind === 'dwg') {
      setDwgViewerOpen(false)
      setDwgFile(null)
      setDwgDxfText(null)
      setDwgLoadState('idle')
      dwgLayersLoadedRef.current = false
    }
    // Сразу подтянуть актуальное состояние сервера (на случай другого id того же kind).
    if (serverReachable) void refreshFromRemote()
  }

  const openDwgViewer = async () => {
    if (!dwg) return
    setViewerOpen(false)
    setDwgViewerOpen(true)

    if (dwgFile || dwgDxfText) return

    setDwgLoadState('loading')
    dwgLayersLoadedRef.current = false
    try {
      await initWasm()
      const blob = await resolveProjectBlob(dwg.id)
      if (!blob) throw new Error('dwg_blob_missing')

      const file = new File([blob], dwg.name, { type: dwg.mime || 'application/acad' })
      setDwgDxfText(null)
      setDwgFile(file)
    } catch {
      setDwgLoadState('error')
    }
  }

  useEffect(() => {
    if (!dwgViewerOpen) return
    if (!dwgFile && !dwgDxfText) return
    const t = window.setTimeout(() => smartFitToRoad(), 180)
    return () => window.clearTimeout(t)
  }, [dwgViewerOpen, dwgFile, dwgDxfText])

  // Fallback: DWG -> DXF конвертация если прямой путь не отдал слои за 15 сек.
  useEffect(() => {
    if (!dwgViewerOpen) return
    if (dwgLoadState !== 'loading') return
    if (!dwgFile) return
    if (dwgDxfText) return
    if (!dwg?.id) return

    const currentDwgId = dwg.id
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
  }, [dwgViewerOpen, dwgLoadState, dwgFile, dwgDxfText, dwg?.id])

  /* ── Рендер карточки ── */

  return (
    <>
      {canUpload ? (
        <>
          <input
            ref={pdfInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              void replaceAsset('pdf', e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          <input
            ref={dwgInputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".dwg,application/acad,application/x-acad,image/vnd.dwg"
            onChange={(e) => {
              void replaceAsset('dwg', e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </>
      ) : null}

      <aside className={styles.card} aria-label="Файлы проекта">
        <div className={styles.files}>
          <div className={`${styles.fileRow} ${pdf ? styles.fileRowReady : styles.fileRowEmpty}`}>
            <span className={`${styles.fileTag} ${styles.fileTagPdf}`}>PDF</span>
            <div className={styles.fileRowBody}>
              {pdf ? (
                <span className={styles.fileName} title={pdf.name}>
                  <span className={styles.fileNameText}>{pdf.name}</span>
                  <span className={styles.fileMeta}>{formatSize(pdf.sizeBytes)}</span>
                </span>
              ) : (
                <span className={styles.fileEmpty}>Не загружен</span>
              )}
            </div>
            <div className={styles.fileRowActions}>
              {pdf ? (
                <>
                  <button type="button" className={styles.actionBtnPrimary} onClick={() => setViewerOpen(true)}>
                    Открыть
                  </button>
                  <a className={styles.actionBtnSecondary} href={pdf.url} download={pdf.name} title="Скачать">
                    ↓
                  </a>
                  {canUpload ? (
                    <button
                      type="button"
                      className={styles.actionBtnDanger}
                      onClick={() => void removeAsset('pdf')}
                      title="Убрать"
                    >
                      ×
                    </button>
                  ) : null}
                </>
              ) : canUpload ? (
                <button
                  type="button"
                  className={styles.actionBtnPrimary}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  Загрузить
                </button>
              ) : null}
            </div>
          </div>

          <div className={`${styles.fileRow} ${dwg ? styles.fileRowReady : styles.fileRowEmpty}`}>
            <span className={`${styles.fileTag} ${styles.fileTagDwg}`}>DWG</span>
            <div className={styles.fileRowBody}>
              {dwg ? (
                <span className={styles.fileName} title={dwg.name}>
                  <span className={styles.fileNameText}>{dwg.name}</span>
                  <span className={styles.fileMeta}>{formatSize(dwg.sizeBytes)}</span>
                </span>
              ) : (
                <span className={styles.fileEmpty}>Не загружен</span>
              )}
            </div>
            <div className={styles.fileRowActions}>
              {dwg ? (
                <>
                  <button type="button" className={styles.actionBtnPrimary} onClick={() => void openDwgViewer()}>
                    Открыть
                  </button>
                  <a className={styles.actionBtnSecondary} href={dwg.url} download={dwg.name} title="Скачать">
                    ↓
                  </a>
                  {canUpload ? (
                    <button
                      type="button"
                      className={styles.actionBtnDanger}
                      onClick={() => void removeAsset('dwg')}
                      title="Убрать"
                    >
                      ×
                    </button>
                  ) : null}
                </>
              ) : canUpload ? (
                <button
                  type="button"
                  className={styles.actionBtnPrimary}
                  onClick={() => dwgInputRef.current?.click()}
                >
                  Загрузить
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {canUpload && !loading && hasLocalOnly ? (
          <div className={styles.hintRow}>
            <p className={styles.hint}>Файл ещё не на сервере.</p>
            <button
              type="button"
              className={styles.actionBtnMuted}
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

      {/* ── PDF Viewer Modal ── */}
      {viewerOpen && pdf ? (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Просмотр PDF" onClick={() => setViewerOpen(false)}>
          <div className={styles.viewer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.viewerHead}>
              <div>
                <p className={styles.viewerKicker}>Проект</p>
                <p className={styles.viewerTitle}>{pdf.name}</p>
              </div>
              <div className={styles.viewerActions}>
                <a className={styles.viewerBtn} href={pdf.url} download={pdf.name}>
                  Скачать PDF
                </a>
                <button type="button" className={styles.viewerBtnClose} onClick={() => setViewerOpen(false)}>
                  Закрыть
                </button>
              </div>
            </div>
            <iframe className={styles.frame} src={pdf.url} title="PDF проекта" />
          </div>
        </div>
      ) : null}

      {/* ── DWG Viewer Modal ── */}
      {dwgViewerOpen && dwg ? (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр DWG"
          onClick={() => setDwgViewerOpen(false)}
        >
          <div className={styles.viewer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.viewerHeadDark}>
              <div>
                <p className={styles.viewerKickerDark}>Проект</p>
                <p className={styles.viewerTitleDark}>{dwg.name}</p>
              </div>
              <div className={styles.viewerActions}>
                <button
                  type="button"
                  className={styles.viewerBtn}
                  onClick={() => smartFitToRoad()}
                >
                  Подогнать
                </button>
                <a className={styles.viewerBtn} href={dwg.url} download={dwg.name}>
                  Скачать DWG
                </a>
                <button type="button" className={styles.viewerBtnClose} onClick={() => setDwgViewerOpen(false)}>
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
        </div>
      ) : null}
    </>
  )
}
