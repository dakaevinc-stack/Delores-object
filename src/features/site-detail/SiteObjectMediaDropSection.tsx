import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  loadRememberedAuthorNames,
  rememberAuthorName,
  type SiteObjectMediaItem,
} from '../../domain/siteObjectMedia'
import {
  createObjectMediaRemote,
  deleteObjectMediaRemote,
  fetchObjectMediaBlob,
} from '../../lib/siteFormsApi'
import {
  deleteMedia,
  listMediaBySite,
  getMediaBlob,
  putMedia,
  type StoredSiteMedia,
} from '../../lib/mediaRepository'
import styles from './SiteObjectMediaDropSection.module.css'

type Props = {
  siteId: string
  /** Сервер поддерживает POST/GET object-media (тот же API, что заявки и отчёты). */
  serverBacked?: boolean
  /** Манифест с сервера (из fetchSiteFormsFromServer); подтягиваем отсутствующие в IndexedDB. */
  serverManifest?: StoredSiteMedia[]
  onRemoteSyncError?: (message: string) => void
}

type TypeFilter = 'all' | 'photo' | 'video'
type RangePreset = 'all' | 'today' | '7d' | '30d' | 'custom'

type DayGroup = {
  key: string
  label: string
  items: SiteObjectMediaItem[]
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseInputDate(v: string): Date | null {
  if (!v) return null
  const d = new Date(`${v}T00:00:00`)
  return Number.isFinite(d.getTime()) ? d : null
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return toInputDate(d)
}

function formatDayHeading(key: string): string {
  const d = new Date(`${key}T00:00:00`)
  const today = startOfLocalDay(new Date())
  const dayStart = startOfLocalDay(d)
  const diffDays = Math.round((today.getTime() - dayStart.getTime()) / 86_400_000)

  const long = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })
  if (diffDays === 0) return `Сегодня · ${long}`
  if (diffDays === 1) return `Вчера · ${long}`
  return long
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Дата + время загрузки файла в компактном виде, который гарантированно
 * умещается в узкую плитку и не обрезается троеточием:
 *  • сегодня        → «Сегодня, 13:40»
 *  • вчера          → «Вчера, 13:40»
 *  • текущий год    → «21 апреля, 13:40»
 *  • прошлые годы   → «21 апр. 2025, 13:40»
 */
function formatUploadedStamp(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const today = startOfLocalDay(new Date())
  const dayStart = startOfLocalDay(d)
  const diff = Math.round((today.getTime() - dayStart.getTime()) / 86_400_000)
  const time = formatTime(iso)
  if (diff === 0) return `Сегодня, ${time}`
  if (diff === 1) return `Вчера, ${time}`
  if (d.getFullYear() === today.getFullYear()) {
    const date = d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
    })
    return `${date}, ${time}`
  }
  const date = d
    .toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace(/\s*г\.?$/, '')
  return `${date}, ${time}`
}

/** Полная форма для подсказки (tooltip): «Загружено 21 апреля 2026 г., 13:40». */
function formatUploadedTooltip(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const date = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `Загружено ${date}, ${formatTime(iso)}`
}

function formatFilesCount(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} файл`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} файла`
  return `${n} файлов`
}

function formatBytes(n: number): string {
  if (!n) return ''
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`
  return `${(n / 1024 / 1024).toFixed(1)} МБ`
}

function storedToItem(stored: StoredSiteMedia, previewUrl: string): SiteObjectMediaItem {
  return {
    id: stored.id,
    siteId: stored.siteId,
    kind: stored.kind,
    name: stored.name,
    mime: stored.mime,
    sizeBytes: stored.sizeBytes,
    previewUrl,
    capturedAtIso: stored.capturedAtIso,
    uploadedAtIso: stored.uploadedAtIso,
    authorCaption: stored.authorCaption,
  }
}

export function SiteObjectMediaDropSection({
  siteId,
  serverBacked = false,
  serverManifest = [],
  onRemoteSyncError,
}: Props) {
  const uid = useId()
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<SiteObjectMediaItem[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  /**
   * Карта статуса синхронизации каждого файла:
   *   • 'remote'      — есть и локально, и на сервере (✓ другие устройства видят)
   *   • 'uploading'   — сейчас идёт upload
   *   • 'failed'      — попытка upload закончилась ошибкой; нужен retry
   *   • 'local-only'  — только локально (либо API выключен, либо ещё не доходило до бэкфила)
   * Ключ = id записи. Не лежит в IndexedDB — это derived state, чтобы
   * не трогать схему хранилища и не зависеть от старых данных.
   */
  type SyncStatus = 'remote' | 'uploading' | 'failed' | 'local-only'
  const [syncStatusById, setSyncStatusById] = useState<Record<string, SyncStatus>>({})
  const updateSyncStatus = (id: string, status: SyncStatus) =>
    setSyncStatusById((prev) => ({ ...prev, [id]: status }))
  const updateSyncStatusBatch = (entries: Array<[string, SyncStatus]>) =>
    setSyncStatusById((prev) => {
      const next = { ...prev }
      for (const [id, st] of entries) next[id] = st
      return next
    })

  const [knownAuthors, setKnownAuthors] = useState(() => loadRememberedAuthorNames(siteId))
  const [authorFio, setAuthorFio] = useState(() => loadRememberedAuthorNames(siteId)[0] ?? '')
  const [authorError, setAuthorError] = useState<string | null>(null)
  const [otherFioMode, setOtherFioMode] = useState(false)

  /**
   * «Подготовлено к отправке». Бригадир сначала добавляет фото/видео
   * в эту очередь — без записи в IndexedDB и без обращения к API,
   * — затем подтверждает кнопкой «Отправить». До нажатия можно убрать
   * лишний кадр или поменять ФИО.
   */
  type StagedFile = {
    id: string
    file: File
    kind: 'photo' | 'video'
    previewUrl: string
    name: string
    sizeBytes: number
  }
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [sending, setSending] = useState(false)
  const stagedRef = useRef<StagedFile[]>([])
  useEffect(() => {
    stagedRef.current = staged
  }, [staged])

  // При размонтировании — отзываем blob:URL подготовленных файлов.
  useEffect(() => {
    return () => {
      for (const s of stagedRef.current) URL.revokeObjectURL(s.previewUrl)
    }
  }, [])

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [rangePreset, setRangePreset] = useState<RangePreset>('all')
  const [rangeFrom, setRangeFrom] = useState<string>('')
  const [rangeTo, setRangeTo] = useState<string>('')
  const [authorFilter, setAuthorFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  /**
   * Лайтбокс. Открываем просмотр прямо в приложении — blob-URL-ы не всегда
   * корректно открываются в новой вкладке (некоторые браузеры пересылают их
   * в поиск), а просмотр внутри страницы полностью под нашим контролем.
   */
  const [viewer, setViewer] = useState<SiteObjectMediaItem | null>(null)

  useEffect(() => {
    if (!viewer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [viewer])

  const itemsRef = useRef<SiteObjectMediaItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  /**
   * Если у пользователя ещё не залились файлы (uploading/failed) —
   * на закрытии вкладки показываем нативное предупреждение «уверены,
   * что хотите уйти?». Это спасает от «положил телефон в карман,
   * пока не докачалось».
   */
  useEffect(() => {
    const dirty =
      staged.length > 0 ||
      Object.values(syncStatusById).some(
        (s) => s === 'uploading' || s === 'failed',
      )
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [syncStatusById, staged.length])

  const serverManifestKey = useMemo(() => {
    const head = `${siteId}:`
    if (!serverBacked) return `${head}off`
    if (!serverManifest.length) return `${head}on:empty`
    return `${head}on:${serverManifest
      .map((m) => m.id)
      .sort()
      .join('\0')}`
  }, [siteId, serverBacked, serverManifest])

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []

    void (async () => {
      try {
        const remoteIds = new Set(
          serverManifest.filter((m) => m.siteId === siteId).map((m) => m.id),
        )

        // (1) Скачиваем с сервера то, чего нет локально — чтобы это
        //     устройство тоже видело файлы, добавленные с других.
        if (serverBacked && serverManifest.length > 0) {
          const localRows = await listMediaBySite(siteId)
          const localIds = new Set(localRows.map((r) => r.id))
          for (const meta of serverManifest) {
            if (cancelled) return
            if (meta.siteId !== siteId) continue
            if (localIds.has(meta.id)) continue
            const blob = await fetchObjectMediaBlob(siteId, meta.id)
            if (!blob) continue
            await putMedia(meta, blob)
            localIds.add(meta.id)
          }
        }

        const rows = await listMediaBySite(siteId)
        const resolved: SiteObjectMediaItem[] = []
        for (const row of rows) {
          const blob = await getMediaBlob(row.id)
          if (!blob) continue
          const url = URL.createObjectURL(blob)
          urls.push(url)
          resolved.push(storedToItem(row, url))
        }
        resolved.sort(
          (a, b) =>
            new Date(b.capturedAtIso).getTime() - new Date(a.capturedAtIso).getTime(),
        )
        if (cancelled) {
          for (const u of urls) URL.revokeObjectURL(u)
          return
        }
        setItems(resolved)
        setLoadState('ready')

        // (2) Считаем стартовый статус каждой плитки.
        const initial: Record<string, SyncStatus> = {}
        for (const m of resolved) {
          if (!serverBacked) {
            initial[m.id] = 'local-only'
          } else if (remoteIds.has(m.id)) {
            initial[m.id] = 'remote'
          } else {
            // Файл есть локально, но не пришёл с сервера → надо залить.
            initial[m.id] = 'uploading'
          }
        }
        setSyncStatusById(initial)

        // (3) Бэкфил: для каждого `uploading` пытаемся залить blob на сервер.
        //     Если получилось — статус 'remote'. Если нет — 'failed'
        //     (с возможностью ретрая по кнопке).
        if (serverBacked) {
          const localRowsAfter = await listMediaBySite(siteId)
          for (const row of localRowsAfter) {
            if (cancelled) return
            if (remoteIds.has(row.id)) continue
            const blob = await getMediaBlob(row.id)
            if (!blob) {
              updateSyncStatus(row.id, 'failed')
              continue
            }
            const ok = await createObjectMediaRemote(siteId, row, blob)
            if (cancelled) return
            updateSyncStatus(row.id, ok ? 'remote' : 'failed')
            if (ok) remoteIds.add(row.id)
          }
        }
      } catch (err) {
        console.error('[media] load failed', err)
        if (!cancelled) setLoadState('error')
      }
    })()

    return () => {
      cancelled = true
      for (const m of itemsRef.current) {
        URL.revokeObjectURL(m.previewUrl)
      }
    }
    /* serverManifestKey уже включает siteId, serverBacked и id из serverManifest. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, serverManifestKey])

  const quickSelectValue =
    knownAuthors.length === 0
      ? ''
      : (() => {
          const t = authorFio.trim()
          if (knownAuthors.includes(t)) return t
          if (otherFioMode || t.length > 0) return '__other__'
          return ''
        })()

  const captionOrError = (): string | null => {
    setAuthorError(null)
    const t = authorFio.trim()
    if (!t.length) {
      setAuthorError('Укажите ФИО того, кто выкладывает материал.')
      return null
    }
    return t
  }

  /**
   * Кладёт выбранные файлы в очередь подготовки. Никаких I/O —
   * пользователь подтверждает отправку отдельной кнопкой.
   */
  const stageFiles = (files: FileList | null, kind: 'photo' | 'video') => {
    if (!files?.length) return
    setAuthorError(null)
    const next: StagedFile[] = []
    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i)
      if (!file) continue
      next.push({
        id: newId(),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        sizeBytes: file.size,
      })
    }
    if (next.length) setStaged((prev) => [...prev, ...next])
  }

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const row = prev.find((s) => s.id === id)
      if (row) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((s) => s.id !== id)
    })
  }

  const clearStaged = () => {
    for (const s of stagedRef.current) URL.revokeObjectURL(s.previewUrl)
    setStaged([])
  }

  /**
   * Реальная отправка: записывает файлы в IndexedDB и параллельно
   * заливает на сервер. Каждый файл получает свой статус —
   * uploading → remote (успех) или failed (нужен retry).
   */
  const commitStaged = async () => {
    if (sending) return
    if (staged.length === 0) return
    const caption = captionOrError()
    if (!caption) return
    setSending(true)
    try {
      const nowIso = new Date().toISOString()
      const added: Array<{ item: SiteObjectMediaItem; record: StoredSiteMedia; file: File; previewUrl: string }> = []
      for (const s of staged) {
        const capturedAtIso = s.file.lastModified
          ? new Date(s.file.lastModified).toISOString()
          : nowIso
        const record: StoredSiteMedia = {
          id: newId(),
          siteId,
          kind: s.kind,
          name: s.name,
          mime: s.file.type || (s.kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
          sizeBytes: s.sizeBytes,
          capturedAtIso,
          uploadedAtIso: nowIso,
          authorCaption: caption,
        }
        try {
          await putMedia(record, s.file)
          // Передаём в галерею тот же blob:URL, что был в превью —
          // тогда не придётся пересоздавать его и можно прозрачно
          // отозвать после revoke ниже.
          added.push({ item: storedToItem(record, s.previewUrl), record, file: s.file, previewUrl: s.previewUrl })
        } catch (err) {
          console.error('[media] save failed', err)
        }
      }

      if (added.length) {
        rememberAuthorName(siteId, caption)
        setKnownAuthors(loadRememberedAuthorNames(siteId))
        setItems((prev) =>
          [...added.map((a) => a.item), ...prev].sort(
            (a, b) =>
              new Date(b.capturedAtIso).getTime() - new Date(a.capturedAtIso).getTime(),
          ),
        )
        updateSyncStatusBatch(
          added.map(({ record }) => [
            record.id,
            serverBacked ? 'uploading' : 'local-only',
          ]),
        )
        // Очищаем очередь СРАЗУ — пользователь видит, что нажатие
        // прошло. Превью-URL переехали в галерею, поэтому НЕ
        // отзываем их здесь.
        setStaged([])
      }

      if (serverBacked) {
        let remoteSaveFailed = false
        for (const a of added) {
          const ok = await createObjectMediaRemote(siteId, a.record, a.file)
          updateSyncStatus(a.record.id, ok ? 'remote' : 'failed')
          if (!ok) remoteSaveFailed = true
        }
        if (remoteSaveFailed) {
          onRemoteSyncError?.(
            'Часть файлов не удалось отправить на сервер. На плитке появится «Не на сервере» — нажмите ↻ чтобы повторить.',
          )
        }
      }
    } finally {
      setSending(false)
    }
  }

  const formatStagedCount = (n: number): string => {
    const m10 = n % 10
    const m100 = n % 100
    if (m10 === 1 && m100 !== 11) return `${n} файл`
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} файла`
    return `${n} файлов`
  }

  /** Ручной retry для конкретной плитки. */
  const handleRetry = async (id: string) => {
    if (!serverBacked) return
    const item = itemsRef.current.find((x) => x.id === id)
    if (!item) return
    const record: StoredSiteMedia = {
      id: item.id,
      siteId: item.siteId,
      kind: item.kind,
      name: item.name,
      mime: item.mime,
      sizeBytes: item.sizeBytes,
      capturedAtIso: item.capturedAtIso,
      uploadedAtIso: item.uploadedAtIso,
      authorCaption: item.authorCaption,
    }
    const blob = await getMediaBlob(id)
    if (!blob) {
      updateSyncStatus(id, 'failed')
      return
    }
    updateSyncStatus(id, 'uploading')
    const ok = await createObjectMediaRemote(siteId, record, blob)
    updateSyncStatus(id, ok ? 'remote' : 'failed')
  }

  const handleRemove = async (id: string) => {
    const row = itemsRef.current.find((x) => x.id === id)
    if (serverBacked) {
      const ok = await deleteObjectMediaRemote(siteId, id)
      if (!ok) {
        onRemoteSyncError?.('Не удалось удалить файл на сервере. Проверьте сеть или права.')
        return
      }
    }
    try {
      await deleteMedia(id)
    } catch (err) {
      console.error('[media] delete failed', err)
    }
    if (row) URL.revokeObjectURL(row.previewUrl)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  const authorsInLibrary = useMemo(() => {
    const set = new Set<string>()
    for (const m of items) set.add(m.authorCaption)
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  const { from, to } = useMemo(() => {
    const today = startOfLocalDay(new Date())
    if (rangePreset === 'today') {
      return { from: today, to: addDays(today, 1) }
    }
    if (rangePreset === '7d') {
      return { from: addDays(today, -6), to: addDays(today, 1) }
    }
    if (rangePreset === '30d') {
      return { from: addDays(today, -29), to: addDays(today, 1) }
    }
    if (rangePreset === 'custom') {
      const f = parseInputDate(rangeFrom)
      const t = parseInputDate(rangeTo)
      return {
        from: f ?? null,
        to: t ? addDays(t, 1) : null,
      }
    }
    return { from: null as Date | null, to: null as Date | null }
  }, [rangePreset, rangeFrom, rangeTo])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((m) => {
      if (typeFilter !== 'all' && m.kind !== typeFilter) return false
      if (authorFilter !== 'all' && m.authorCaption !== authorFilter) return false
      if (from || to) {
        const t = new Date(m.capturedAtIso).getTime()
        if (from && t < from.getTime()) return false
        if (to && t >= to.getTime()) return false
      }
      if (q) {
        const hay = `${m.name} ${m.authorCaption}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, typeFilter, authorFilter, from, to, search])

  const groups: DayGroup[] = useMemo(() => {
    const map = new Map<string, SiteObjectMediaItem[]>()
    for (const m of filtered) {
      const key = dayKey(m.capturedAtIso)
      const arr = map.get(key)
      if (arr) arr.push(m)
      else map.set(key, [m])
    }
    const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    return keys.map((key) => ({
      key,
      label: formatDayHeading(key),
      items: (map.get(key) ?? []).sort(
        (a, b) =>
          new Date(b.capturedAtIso).getTime() - new Date(a.capturedAtIso).getTime(),
      ),
    }))
  }, [filtered])

  const resetFilters = () => {
    setTypeFilter('all')
    setRangePreset('all')
    setRangeFrom('')
    setRangeTo('')
    setAuthorFilter('all')
    setSearch('')
  }

  const hasActiveFilters =
    typeFilter !== 'all' ||
    rangePreset !== 'all' ||
    authorFilter !== 'all' ||
    search.trim().length > 0

  return (
    <section
      className={styles.section}
      id="site-object-media"
      aria-labelledby={`${uid}-heading`}
    >
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden>
          {/* Камера + мини-бейдж «play» в углу — читается и как фото, и как видео */}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path
              d="M4 9h3l1.4-2.2A1.5 1.5 0 0 1 9.7 6h4.6c.5 0 1 .3 1.3.8L17 9h3a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 9z"
              fill="currentColor"
              opacity="0.95"
            />
            <circle cx="12" cy="13.4" r="3.2" fill="#0b1a33" />
            <path
              d="m10.9 12.1 2.6 1.3-2.6 1.3v-2.6z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className={styles.headBody}>
          <p className={styles.kicker}>
            <span className={styles.kickerBar} aria-hidden />
            Оперативный обмен
          </p>
          <h2 className={styles.title} id={`${uid}-heading`}>
            Фото/Видео с объекта
          </h2>
          <p className={styles.lead}>
            Быстрая передача в офис и заказчику — без бумаги и отдельного отчёта бригадира.
          </p>
          <ul className={styles.features} aria-label="Особенности раздела">
            <li className={styles.featureChip}>
              <span className={styles.featureDot} aria-hidden />
              Без отчёта
            </li>
            <li className={styles.featureChip}>
              <span className={styles.featureDot} aria-hidden />
              Автор запоминается
            </li>
            <li className={styles.featureChip}>
              <span className={styles.featureDot} aria-hidden />
              Привязано к объекту
            </li>
          </ul>
        </div>
      </header>

      <div className={styles.panel}>
        <div className={styles.author}>
          {knownAuthors.length > 0 ? (
            <>
              <label className={styles.label} htmlFor={`${uid}-quick`}>
                Быстрый выбор
              </label>
              <select
                id={`${uid}-quick`}
                className={styles.select}
                value={quickSelectValue}
                onChange={(e) => {
                  const v = e.target.value
                  setAuthorError(null)
                  if (v === '__other__') {
                    setOtherFioMode(true)
                    setAuthorFio('')
                    return
                  }
                  if (v === '') {
                    setOtherFioMode(false)
                    setAuthorFio('')
                    return
                  }
                  setOtherFioMode(false)
                  setAuthorFio(v)
                }}
              >
                <option value="">— Кто выкладывает —</option>
                {knownAuthors.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="__other__">Другое ФИО…</option>
              </select>
            </>
          ) : null}

          <label className={styles.label} htmlFor={`${uid}-fio`}>
            ФИО
          </label>
          <input
            id={`${uid}-fio`}
            className={styles.input}
            type="text"
            autoComplete="name"
            placeholder="Например: Иванов Александр Сергеевич"
            value={authorFio}
            onChange={(e) => {
              const v = e.target.value
              setAuthorFio(v)
              setAuthorError(null)
              const t = v.trim()
              if (knownAuthors.includes(t)) setOtherFioMode(false)
              else if (t.length > 0) setOtherFioMode(true)
            }}
            list={knownAuthors.length ? `${uid}-fio-list` : undefined}
            aria-invalid={authorError ? true : undefined}
            aria-describedby={authorError ? `${uid}-author-err` : `${uid}-fio-hint`}
          />
          {knownAuthors.length > 0 ? (
            <datalist id={`${uid}-fio-list`}>
              {knownAuthors.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}

          {authorError ? (
            <p className={styles.fieldError} id={`${uid}-author-err`} role="alert">
              {authorError}
            </p>
          ) : (
            <p className={styles.authorHint} id={`${uid}-fio-hint`}>
              ФИО подписывается к каждому файлу. Список «быстрый выбор» хранится только на этом
              устройстве и только для этого объекта.
            </p>
          )}
        </div>

        <div className={styles.dropActions}>
          <div className={styles.fileSink} aria-hidden>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              className={styles.hiddenFile}
              onChange={(e) => {
                stageFiles(e.target.files, 'photo')
                e.target.value = ''
              }}
            />
            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              multiple
              tabIndex={-1}
              className={styles.hiddenFile}
              onChange={(e) => {
                stageFiles(e.target.files, 'video')
                e.target.value = ''
              }}
            />
          </div>
          <button
            type="button"
            className={`${styles.dropBtn} ${styles.dropBtnPhoto}`}
            onClick={() => photoRef.current?.click()}
          >
            <span className={styles.dropBtnIcon} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7c.5 0 .96-.27 1.2-.7l.6-1.05A2 2 0 0 1 11.74 3h.52a2 2 0 0 1 1.74 1.25l.6 1.05c.24.43.7.7 1.2.7h1.7A2.5 2.5 0 0 1 20 8.5V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8.5Z" />
                <circle cx="12" cy="13" r="3.6" />
              </svg>
            </span>
            <span className={styles.dropBtnBody}>
              <span className={styles.dropBtnLabel}>Добавить фото</span>
              <span className={styles.dropBtnHint}>с камеры или галереи</span>
            </span>
            <span className={styles.dropBtnArrow} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.dropBtn} ${styles.dropBtnVideo}`}
            onClick={() => videoRef.current?.click()}
          >
            <span className={styles.dropBtnIcon} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="13" height="12" rx="2.4" />
                <path d="m16 10.5 4.4-2.6c.4-.24.9.05.9.52v7.16c0 .47-.5.76-.9.52L16 13.5" />
              </svg>
            </span>
            <span className={styles.dropBtnBody}>
              <span className={styles.dropBtnLabel}>Добавить видео</span>
              <span className={styles.dropBtnHint}>ролик с площадки</span>
            </span>
            <span className={styles.dropBtnArrow} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {staged.length > 0 ? (
        <div
          className={styles.stagedPanel}
          aria-live="polite"
          aria-label="Подготовлено к отправке"
        >
          <div className={styles.stagedHead}>
            <div className={styles.stagedHeadLeft}>
              <span className={styles.stagedKicker}>ГОТОВО К ОТПРАВКЕ</span>
              <span className={styles.stagedTitle}>
                {formatStagedCount(staged.length)} ·{' '}
                {formatBytes(staged.reduce((sum, s) => sum + s.sizeBytes, 0))}
              </span>
              <span className={styles.stagedHint}>
                Проверьте кадры и нажмите «Отправить».
              </span>
            </div>
            <div className={styles.stagedHeadActions}>
              <button
                type="button"
                className={styles.stagedClear}
                onClick={clearStaged}
                disabled={sending}
              >
                Очистить
              </button>
              <button
                type="button"
                className={styles.stagedSend}
                onClick={() => {
                  void commitStaged()
                }}
                disabled={sending}
              >
                {sending
                  ? 'Отправляем…'
                  : `Отправить · ${formatStagedCount(staged.length)}`}
              </button>
            </div>
          </div>

          <ul className={styles.stagedList}>
            {staged.map((s) => (
              <li key={s.id} className={styles.stagedTile}>
                <div className={styles.stagedThumb}>
                  {s.kind === 'photo' ? (
                    <img src={s.previewUrl} alt={s.name} loading="lazy" />
                  ) : (
                    <video src={s.previewUrl} muted preload="metadata" />
                  )}
                  <span className={styles.stagedKindBadge}>
                    {s.kind === 'photo' ? 'фото' : 'видео'}
                  </span>
                </div>
                <div className={styles.stagedMeta}>
                  <span className={styles.stagedName} title={s.name}>
                    {s.name}
                  </span>
                  <span className={styles.stagedSize}>
                    {formatBytes(s.sizeBytes)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.stagedRemove}
                  onClick={() => removeStaged(s.id)}
                  disabled={sending}
                  aria-label={`Убрать ${s.name}`}
                  title="Убрать из очереди"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loadState === 'loading' ? (
        <p className={styles.empty}>Загружаем сохранённые фото и видео…</p>
      ) : null}
      {loadState === 'error' ? (
        <p className={styles.empty}>
          Не удалось прочитать локальное хранилище. Проверьте разрешения браузера.
        </p>
      ) : null}

      {loadState === 'ready' && items.length === 0 ? (
        <p className={styles.empty}>
          Пока нет материалов по этому объекту — добавьте первое фото или видео.
        </p>
      ) : null}

      {loadState === 'ready' && items.length > 0 ? (
        <>
          <div className={styles.filterBar} role="group" aria-label="Фильтры материалов">
            <div className={styles.filterRow}>
              <div
                className={styles.segmented}
                role="radiogroup"
                aria-label="Тип материала"
              >
                {(
                  [
                    ['all', 'Все'],
                    ['photo', 'Фото'],
                    ['video', 'Видео'],
                  ] as Array<[TypeFilter, string]>
                ).map(([v, label]) => (
                  <button
                    type="button"
                    key={v}
                    role="radio"
                    aria-checked={typeFilter === v}
                    className={`${styles.segment} ${typeFilter === v ? styles.segmentOn : ''}`}
                    onClick={() => setTypeFilter(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className={styles.chips} role="radiogroup" aria-label="Период">
                {(
                  [
                    ['all', 'Всё время'],
                    ['today', 'Сегодня'],
                    ['7d', '7 дней'],
                    ['30d', '30 дней'],
                    ['custom', 'Диапазон'],
                  ] as Array<[RangePreset, string]>
                ).map(([v, label]) => (
                  <button
                    type="button"
                    key={v}
                    role="radio"
                    aria-checked={rangePreset === v}
                    className={`${styles.chip} ${rangePreset === v ? styles.chipOn : ''}`}
                    onClick={() => setRangePreset(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {rangePreset === 'custom' ? (
              <div className={styles.filterRow}>
                <label className={styles.rangeLabel}>
                  <span>С</span>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={rangeFrom}
                    max={rangeTo || undefined}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                </label>
                <label className={styles.rangeLabel}>
                  <span>По</span>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={rangeTo}
                    min={rangeFrom || undefined}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <div className={styles.filterRow}>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Автор</span>
                <select
                  className={styles.select}
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                >
                  <option value="all">Все авторы</option>
                  {authorsInLibrary.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterLabel}>Поиск</span>
                <input
                  type="search"
                  className={styles.input}
                  placeholder="по имени файла или ФИО"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <div className={styles.counterRow}>
              <span className={styles.counter}>
                Показано {filtered.length} из {items.length}
              </span>
              {hasActiveFilters ? (
                <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              ) : null}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className={styles.empty}>
              Под текущие фильтры материалов нет. Попробуйте расширить диапазон.
            </p>
          ) : (
            <div className={styles.groups}>
              {groups.map((group) => (
                <section key={group.key} className={styles.dayGroup} aria-label={group.label}>
                  <header className={styles.dayHead}>
                    <h3 className={styles.dayTitle}>{group.label}</h3>
                    <span className={styles.dayCount}>{formatFilesCount(group.items.length)}</span>
                  </header>
                  <ul className={styles.grid}>
                    {group.items.map((m) => (
                      <li key={m.id} className={styles.tile}>
                        <figure className={styles.figure}>
                          {m.kind === 'photo' ? (
                            <button
                              type="button"
                              className={styles.thumbLink}
                              onClick={() => setViewer(m)}
                              aria-label={`Открыть ${m.name} в полный размер`}
                            >
                              <img
                                className={styles.thumb}
                                src={m.previewUrl}
                                alt={m.name}
                                loading="lazy"
                              />
                              <span className={styles.thumbHint} aria-hidden="true">
                                Открыть
                              </span>
                            </button>
                          ) : (
                            <div className={styles.videoBox}>
                              <video
                                className={styles.thumb}
                                src={m.previewUrl}
                                controls
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <button
                                type="button"
                                className={styles.videoExpand}
                                onClick={() => setViewer(m)}
                                aria-label={`Открыть ${m.name} в полный размер`}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <path
                                    d="M2.5 5.5V2.5H5.5M8.5 2.5H11.5V5.5M11.5 8.5V11.5H8.5M5.5 11.5H2.5V8.5"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span>На весь экран</span>
                              </button>
                            </div>
                          )}
                          <figcaption className={styles.mediaCaption}>
                            <p className={styles.mediaAuthor}>{m.authorCaption}</p>
                            <div className={styles.mediaMetaBar}>
                              <span className={styles.mediaTypePill}>
                                {m.kind === 'photo' ? 'Фото' : 'Видео'}
                              </span>
                              <span className={styles.mediaMetaDot} aria-hidden="true">
                                ·
                              </span>
                              <span className={styles.mediaUploadLabel}>Загружено</span>
                              <time
                                className={styles.mediaUploadTime}
                                dateTime={m.uploadedAtIso}
                                title={formatUploadedTooltip(m.uploadedAtIso)}
                              >
                                {formatUploadedStamp(m.uploadedAtIso)}
                              </time>
                            </div>
                            <div className={styles.syncRow}>
                              {(() => {
                                const status = syncStatusById[m.id] ?? 'local-only'
                                if (status === 'remote') {
                                  return (
                                    <span
                                      className={`${styles.syncPill} ${styles.syncPillRemote}`}
                                      title="Файл загружен на сервер — виден всем устройствам и офису"
                                    >
                                      <span className={styles.syncDot} aria-hidden />
                                      В облаке
                                    </span>
                                  )
                                }
                                if (status === 'uploading') {
                                  return (
                                    <span
                                      className={`${styles.syncPill} ${styles.syncPillUploading}`}
                                      title="Идёт загрузка на сервер — не закрывайте страницу до завершения"
                                    >
                                      <span className={styles.syncSpinner} aria-hidden />
                                      Загружается…
                                    </span>
                                  )
                                }
                                if (status === 'failed') {
                                  return (
                                    <button
                                      type="button"
                                      className={`${styles.syncPill} ${styles.syncPillFailed}`}
                                      onClick={() => {
                                        void handleRetry(m.id)
                                      }}
                                      title="Не удалось отправить на сервер — нажмите, чтобы повторить"
                                    >
                                      <span className={styles.syncDot} aria-hidden />
                                      Не на сервере · ↻ повторить
                                    </button>
                                  )
                                }
                                return (
                                  <span
                                    className={`${styles.syncPill} ${styles.syncPillLocal}`}
                                    title={
                                      serverBacked
                                        ? 'Только на этом устройстве'
                                        : 'API отчётов недоступно — файл лежит локально'
                                    }
                                  >
                                    <span className={styles.syncDot} aria-hidden />
                                    Только локально
                                  </span>
                                )
                              })()}
                            </div>
                          </figcaption>
                        </figure>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => {
                            void handleRemove(m.id)
                          }}
                          aria-label={`Удалить ${m.name}`}
                        >
                          Убрать
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}

      {viewer ? (
        <div
          className={styles.viewerBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${viewer.kind === 'photo' ? 'Фото' : 'Видео'}: ${viewer.name}`}
          onClick={() => setViewer(null)}
        >
          <div
            className={styles.viewerBody}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.viewerClose}
              onClick={() => setViewer(null)}
              aria-label="Закрыть просмотр"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M4 4L14 14M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className={styles.viewerStage}>
              {viewer.kind === 'photo' ? (
                <img
                  className={styles.viewerMedia}
                  src={viewer.previewUrl}
                  alt={viewer.name}
                />
              ) : (
                /* Превью съёмки: короткий ролик без отдельной дорожки субтитров */
                <video
                  className={styles.viewerMedia}
                  src={viewer.previewUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              )}
            </div>

            <div className={styles.viewerMeta}>
              <p className={styles.viewerAuthor}>{viewer.authorCaption}</p>
              <p className={styles.viewerStamp}>
                Загружено · {formatUploadedStamp(viewer.uploadedAtIso)}
              </p>
              <p className={styles.viewerFile} title={viewer.name}>
                {viewer.name}
                {viewer.sizeBytes ? ` · ${formatBytes(viewer.sizeBytes)}` : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
