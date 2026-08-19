import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  RemoteWriteFailure,
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
    const urls: string[] = []

    void (async () => {
      setLoading(true)
      try {
        const remoteRows = await fetchProjectFilesRemote(siteId)
        const remoteAvailable = remoteRows !== null
        if (remoteAvailable) setRemoteActive(true)
        const rows = remoteRows ?? (await listProjectFilesBySite(siteId))
        const resolved: ProjectAsset[] = []
        for (const row of rows) {
          let url = ''
          if (remoteAvailable) {
            url = projectFileBlobUrl(siteId, row.id)
          } else {
            const blob = await getProjectFileBlob(row.id)
            if (!blob) continue
            url = URL.createObjectURL(blob)
            urls.push(url)
          }
          resolved.push({ ...row, url })
        }
        resolved.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
        if (cancelled) {
          for (const url of urls) URL.revokeObjectURL(url)
          return
        }
        setAssets(resolved)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      for (const row of assetsRef.current) revokeIfBlobUrl(row.url)
    }
  }, [siteId])

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
      if (remoteActive) {
        const result = await createProjectFileRemote(siteId, record, file)
        if (!result.ok) {
          throw new RemoteWriteFailure(describeRemoteWriteError(result, 'файл'))
        }
      }
      const url = remoteActive ? projectFileBlobUrl(siteId, record.id) : URL.createObjectURL(file)
      setAssets((prev) => {
        const replaced = prev.filter((row) => row.kind !== kind)
        for (const row of prev) {
          if (row.kind === kind) revokeIfBlobUrl(row.url)
        }
        return [{ ...record, url }, ...replaced]
      })
      if (!remoteActive) {
        const probe = await fetchProjectFilesRemote(siteId)
        if (probe !== null) setRemoteActive(true)
      }
    } catch (e) {
      if (e instanceof RemoteWriteFailure) {
        setSyncMessage(e.message)
      } else {
        setSyncMessage('Файл сохранился только на этом устройстве. На другом ноутбуке его пока не будет.')
      }
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
      const blob = remoteActive
        ? await fetchProjectFileBlobRemote(siteId, dwg.id)
        : await getProjectFileBlob(dwg.id)
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
        const blob = remoteActive
          ? await fetchProjectFileBlobRemote(siteId, currentDwgId)
          : await getProjectFileBlob(currentDwgId)
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
                    Скачать PDF
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
                Загрузить PDF
              </button>
            ) : null}
          </div>
        </div>

        {/* ── DWG строка ── */}
        <div className={`${styles.fileRow} ${dwg ? '' : styles.fileRowEmpty}`}>
          <span className={`${styles.fileTag} ${dwg ? styles.fileTagDwg : ''}`}>DWG</span>
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
                    Скачать DWG
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
                Загрузить DWG
              </button>
            ) : null}
          </div>
        </div>

        {canUpload && !loading ? (
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
