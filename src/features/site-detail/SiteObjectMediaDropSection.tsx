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

  const [knownAuthors, setKnownAuthors] = useState(() => loadRememberedAuthorNames(siteId))
  const [authorFio, setAuthorFio] = useState(() => loadRememberedAuthorNames(siteId)[0] ?? '')
  const [authorError, setAuthorError] = useState<string | null>(null)
  const [otherFioMode, setOtherFioMode] = useState(false)

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

  const addFiles = async (files: FileList | null, kind: 'photo' | 'video') => {
    if (!files?.length) return
    const caption = captionOrError()
    if (!caption) return
    const nowIso = new Date().toISOString()
    const added: SiteObjectMediaItem[] = []
    let remoteSaveFailed = false

    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i)
      if (!file) continue
      const capturedAtIso = file.lastModified
        ? new Date(file.lastModified).toISOString()
        : nowIso
      const record: StoredSiteMedia = {
        id: newId(),
        siteId,
        kind,
        name: file.name,
        mime: file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
        sizeBytes: file.size,
        capturedAtIso,
        uploadedAtIso: nowIso,
        authorCaption: caption,
      }
      try {
        await putMedia(record, file)
        const url = URL.createObjectURL(file)
        added.push(storedToItem(record, url))
        if (serverBacked) {
          const ok = await createObjectMediaRemote(siteId, record, file)
          if (!ok) remoteSaveFailed = true
        }
      } catch (err) {
        console.error('[media] save failed', err)
      }
    }

    if (remoteSaveFailed) {
      onRemoteSyncError?.(
        'Файлы сохранены на устройстве, но не удалось отправить на сервер. Проверьте сеть или ключ записи.',
      )
    }

    if (added.length) {
      rememberAuthorName(siteId, caption)
      setKnownAuthors(loadRememberedAuthorNames(siteId))
      setItems((prev) =>
        [...added, ...prev].sort(
          (a, b) =>
            new Date(b.capturedAtIso).getTime() - new Date(a.capturedAtIso).getTime(),
        ),
      )
    }
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
                void addFiles(e.target.files, 'photo')
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
                void addFiles(e.target.files, 'video')
                e.target.value = ''
              }}
            />
          </div>
          <button
            type="button"
            className={styles.dropBtn}
            onClick={() => photoRef.current?.click()}
          >
            <span className={styles.dropBtnLabel}>Добавить фото</span>
            <span className={styles.dropBtnHint}>с камеры или галереи</span>
          </button>
          <button
            type="button"
            className={styles.dropBtn}
            onClick={() => videoRef.current?.click()}
          >
            <span className={styles.dropBtnLabel}>Добавить видео</span>
            <span className={styles.dropBtnHint}>ролик с площадки</span>
          </button>
        </div>
      </div>

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
