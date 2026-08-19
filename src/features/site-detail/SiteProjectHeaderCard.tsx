import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CadViewer, type CadViewerRef } from '@cadview/react'
import { convertDwgToDxf, dwgConverter, initWasm } from '@cadview/dwg'
import { computeEntitiesBounds, fitToView as coreFitToView } from '@cadview/core'
import {
  deleteProjectFile,
  getProjectFileBlob,
  listProjectFilesBySite,
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
  const uid = useId()
  const pdfInputRef = useRef<HTMLInputElement | null>(null)
  const dwgInputRef = useRef<HTMLInputElement | null>(null)
  const assetsRef = useRef<ProjectAsset[]>([])

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

  const loadAssets = useCallback(async (): Promise<string[]> => {
    const blobUrls: string[] = []
    setLoading(true)
    try {
      const remoteRows = await fetchProjectFilesRemote(siteId)
      const remoteAvailable = remoteRows !== null
      if (remoteAvailable) setRemoteActive(true)

      let rows = remoteRows ?? (await listProjectFilesBySite(siteId))

      // Догружаем на сервер локальные файлы, которых там ещё нет (PDF или DWG по отдельности).
      if (remoteAvailable && canUpload) {
        const localRows = await listProjectFilesBySite(siteId)
        const remoteKinds = new Set((remoteRows ?? []).map((row) => row.kind))
        const missingOnServer = localRows.filter((local) => !remoteKinds.has(local.kind))
        if (missingOnServer.length > 0) {
          setSyncMessage('Отправляем файлы на сервер…')
          let firstError: string | null = null
          for (const local of missingOnServer) {
            try {
              const blob = await getProjectFileBlob(local.id)
              if (!blob) continue
              const result = await createProjectFileRemote(siteId, local, blob)
              if (!result.ok && !firstError) {
                firstError = describeRemoteWriteError(result, 'файл')
              }
            } catch {
              if (!firstError) firstError = 'Не удалось перенести файл на сервер.'
            }
          }
          setSyncMessage(firstError)
          const refreshed = await fetchProjectFilesRemote(siteId)
          if (refreshed) {
            setRemoteActive(true)
            rows = refreshed
          }
        }
      }

      const resolved: ProjectAsset[] = []
      for (const row of rows) {
        if (remoteAvailable) {
          resolved.push({ ...row, url: projectFileBlobUrl(siteId, row.id) })
        } else {
          const blob = await getProjectFileBlob(row.id)
          if (!blob) continue
          const url = URL.createObjectURL(blob)
          blobUrls.push(url)
          resolved.push({ ...row, url })
        }
      }
      resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
      setAssets(resolved)
      return blobUrls
    } finally {
      setLoading(false)
    }
  }, [siteId, canUpload])

  const refreshFromRemote = useCallback(async () => {
    const remoteRows = await fetchProjectFilesRemote(siteId)
    if (!remoteRows) return
    setRemoteActive(true)
    const resolved = remoteRows.map((row) => ({
      ...row,
      url: projectFileBlobUrl(siteId, row.id),
    }))
    resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
    setAssets(resolved)
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
      if (canUpload) void loadAssets()
      else void refreshFromRemote()
    }
    const id = window.setInterval(tick, 15000)
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
      const remoteProbe = await fetchProjectFilesRemote(siteId)
      const remoteAvailable = remoteProbe !== null
      if (remoteAvailable) setRemoteActive(true)

      let syncedToRemote = false
      if (remoteAvailable) {
        const result = await createProjectFileRemote(siteId, record, file)
        if (result.ok) {
          syncedToRemote = true
          setSyncMessage(null)
        } else if (result.reason === 'forbidden') {
          setSyncMessage(
            'Сервер не принял файл — обновите страницу (Ctrl+Shift+R) и загрузите снова. Пока файл открывается только здесь.',
          )
        } else {
          setSyncMessage(describeRemoteWriteError(result, 'файл'))
        }
      }
      const url = syncedToRemote
        ? projectFileBlobUrl(siteId, record.id)
        : URL.createObjectURL(file)
      setAssets((prev) => {
        const replaced = prev.filter((row) => row.kind !== kind)
        for (const row of prev) {
          if (row.kind === kind) revokeIfBlobUrl(row.url)
        }
        return [{ ...record, url }, ...replaced]
      })
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
    if (remoteActive) {
      const ok = await deleteProjectFileRemote(siteId, row.id)
      if (!ok) {
        setSyncMessage('Не удалось удалить файл на сервере. На других устройствах он может остаться.')
        return
      }
    }
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

  const hasAny = pdf || dwg
  const busyText = loading
    ? 'Загружаем…'
    : busyKind
      ? `Сохраняем ${busyKind.toUpperCase()}…`
      : null

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

      <aside className={styles.card} aria-labelledby={`${uid}-title`}>
        {/* ── Шапка ── */}
        <div className={styles.top}>
          <div>
            <p className={styles.kicker}>Проект</p>
            <p className={styles.title} id={`${uid}-title`}>PDF / DWG</p>
          </div>
          {busyText ? (
            <span className={styles.statusBusy}>{busyText}</span>
          ) : hasAny ? (
            <span className={styles.statusReady}>Готово</span>
          ) : (
            <span className={styles.statusEmpty}>Пусто</span>
          )}
        </div>

        {/* ── PDF строка ── */}
        <div className={`${styles.fileRow} ${pdf ? '' : styles.fileRowEmpty}`}>
          <span className={`${styles.fileTag} ${styles.fileTagPdf}`}>PDF</span>
          <div className={styles.fileRowBody}>
            {pdf ? (
              <>
                <span className={styles.fileName}>{pdf.name}</span>
                <span className={styles.fileMeta}>{formatSize(pdf.sizeBytes)}</span>
              </>
            ) : (
              <span className={styles.fileEmpty}>Не загружен</span>
            )}
          </div>
          <div className={styles.fileRowActions}>
            {pdf ? (
              <>
                <div className={styles.fileRowActionsTop}>
                  <button type="button" className={styles.actionBtnPrimary} onClick={() => setViewerOpen(true)}>
                    Открыть
                  </button>
                  <a className={styles.actionBtnSecondary} href={pdf.url} download={pdf.name}>
                    Скачать
                  </a>
                </div>
                {canUpload ? (
                  <div className={styles.fileRowActionsBottom}>
                    <button
                      type="button"
                      className={styles.actionBtnMuted}
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      Заменить
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtnDanger}
                      onClick={() => void removeAsset('pdf')}
                    >
                      Убрать
                    </button>
                  </div>
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

        {/* ── DWG строка ── */}
        <div className={`${styles.fileRow} ${dwg ? '' : styles.fileRowEmpty}`}>
          <span className={`${styles.fileTag} ${styles.fileTagDwg}`}>DWG</span>
          <div className={styles.fileRowBody}>
            {dwg ? (
              <>
                <span className={styles.fileName}>{dwg.name}</span>
                <span className={styles.fileMeta}>{formatSize(dwg.sizeBytes)}</span>
              </>
            ) : (
              <span className={styles.fileEmpty}>Не загружен</span>
            )}
          </div>
          <div className={styles.fileRowActions}>
            {dwg ? (
              <>
                <div className={styles.fileRowActionsTop}>
                  <button type="button" className={styles.actionBtnPrimary} onClick={() => void openDwgViewer()}>
                    Открыть
                  </button>
                  <a className={styles.actionBtnSecondary} href={dwg.url} download={dwg.name}>
                    Скачать
                  </a>
                </div>
                {canUpload ? (
                  <div className={styles.fileRowActionsBottom}>
                    <button
                      type="button"
                      className={styles.actionBtnMuted}
                      onClick={() => dwgInputRef.current?.click()}
                    >
                      Заменить
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtnDanger}
                      onClick={() => void removeAsset('dwg')}
                    >
                      Убрать
                    </button>
                  </div>
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

        {canUpload && !loading && hasLocalOnly ? (
          <div className={styles.hintRow}>
            <p className={styles.hint}>Файл не на сервере — другие ноутбуки его не видят.</p>
            <button type="button" className={styles.actionBtnMuted} onClick={() => void loadAssets()}>
              Отправить на сервер
            </button>
          </div>
        ) : canUpload && !loading ? (
          <p className={styles.hint}>
            {remoteActive
              ? 'Файлы доступны на других устройствах по этой же странице.'
              : 'Файлы пока сохраняются только на этом устройстве.'}
          </p>
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
