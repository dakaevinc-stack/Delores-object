import type { PngPreviewWorldMeta } from './dwgPngBounds'

export type SiteProjectFileKind = 'pdf' | 'dwg' | 'file' | 'folder'

export type StoredSiteProjectFile = {
  id: string
  siteId: string
  kind: SiteProjectFileKind
  name: string
  mime: string
  sizeBytes: number
  uploadedAtIso: string
  /** null / отсутствует — в корне папки документов */
  parentId?: string | null
  /** Gzip DXF-превью на сервере — для мгновенного открытия DWG */
  dxfPreviewBytes?: number
  dxfPreviewAtIso?: string
  /** pending | ready | failed — статус автоконвертации на сервере */
  dxfPreviewStatus?: 'pending' | 'ready' | 'failed'
  /** acadsharp — полный чертёж; libredwg — возможны пропуски */
  dxfPreviewEngine?: 'acadsharp' | 'libredwg'
  /** PNG-превью с заливками как в AutoCAD */
  pngPreviewBytes?: number
  pngPreviewAtIso?: string
  pngPreviewStatus?: 'pending' | 'ready' | 'failed'
  /** Точные границы мира, использованные при генерации PNG (для измерений). */
  pngWorldBounds?: PngPreviewWorldMeta
}

/** Сигнатура для синхронизации между устройствами (включая готовность превью). */
export function projectFileSyncSignature(row: StoredSiteProjectFile): string {
  return [
    row.kind,
    row.id,
    row.parentId ?? '',
    row.name,
    row.sizeBytes,
    row.uploadedAtIso,
    row.dxfPreviewStatus ?? '',
    row.dxfPreviewAtIso ?? '',
    row.pngPreviewStatus ?? '',
    row.pngPreviewAtIso ?? '',
    row.pngWorldBounds?.pixelsPerUnit ?? '',
  ].join(':')
}

const DB_NAME = 'deloresh-site-projects'
const DB_VERSION = 2
const STORE_FILES = 'files'
const STORE_BLOBS = 'blobs'
const STORE_DXF_PREVIEWS = 'dxf-previews'
const INDEX_BY_SITE = 'by-site'

type StoredDxfPreview = {
  id: string
  fileId: string
  uploadedAtIso: string
  blob: Blob
  cachedAtIso: string
}

function dxfPreviewId(fileId: string, uploadedAtIso: string, previewAtIso?: string): string {
  return `full-v1:${fileId}:${uploadedAtIso}:${previewAtIso ?? 'none'}`
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB недоступен'))
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' })
        store.createIndex(INDEX_BY_SITE, 'siteId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_DXF_PREVIEWS)) {
        db.createObjectStore(STORE_DXF_PREVIEWS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function runTx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let result: T
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    Promise.resolve(fn(tx))
      .then((value) => {
        result = value
      })
      .catch((err) => {
        try {
          tx.abort()
        } catch {
          /* no-op */
        }
        reject(err)
      })
  })
}

export function detectProjectFileKind(file: { name: string; type?: string }): SiteProjectFileKind {
  const name = file.name.toLowerCase()
  const mime = (file.type ?? '').toLowerCase()
  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf'
  if (
    name.endsWith('.dwg') ||
    name.endsWith('.dxf') ||
    mime.includes('acad') ||
    mime.includes('dwg') ||
    mime === 'image/vnd.dwg'
  ) {
    return 'dwg'
  }
  return 'file'
}

export function projectParentId(row: Pick<StoredSiteProjectFile, 'parentId'>): string | null {
  return row.parentId ?? null
}

export async function listProjectFilesBySite(siteId: string): Promise<StoredSiteProjectFile[]> {
  return runTx(STORE_FILES, 'readonly', (tx) => {
    return new Promise<StoredSiteProjectFile[]>((resolve, reject) => {
      const req = tx.objectStore(STORE_FILES).index(INDEX_BY_SITE).getAll(IDBKeyRange.only(siteId))
      req.onsuccess = () => {
        const rows = (req.result ?? []) as StoredSiteProjectFile[]
        rows.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso))
        resolve(rows)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getProjectFileBlob(id: string): Promise<Blob | null> {
  return runTx(STORE_BLOBS, 'readonly', (tx) => {
    return new Promise<Blob | null>((resolve, reject) => {
      const req = tx.objectStore(STORE_BLOBS).get(id)
      req.onsuccess = () => {
        const row = req.result as { id: string; blob: Blob } | undefined
        resolve(row?.blob ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Метаданные без blob (папки). */
export async function putProjectFileMeta(record: StoredSiteProjectFile): Promise<void> {
  await runTx(STORE_FILES, 'readwrite', (tx) => {
    tx.objectStore(STORE_FILES).put(record)
  })
}

/** Добавить или обновить файл по id (без замены «единственного PDF/DWG»). */
export async function putProjectFile(record: StoredSiteProjectFile, blob: Blob): Promise<void> {
  await runTx([STORE_FILES, STORE_BLOBS], 'readwrite', (tx) => {
    tx.objectStore(STORE_FILES).put(record)
    tx.objectStore(STORE_BLOBS).put({ id: record.id, blob })
  })
}

export async function getDwgDxfPreview(
  fileId: string,
  uploadedAtIso: string,
  previewAtIso?: string,
): Promise<string | null> {
  return runTx(STORE_DXF_PREVIEWS, 'readonly', (tx) => {
    return new Promise<string | null>((resolve, reject) => {
      const req = tx.objectStore(STORE_DXF_PREVIEWS).get(dxfPreviewId(fileId, uploadedAtIso, previewAtIso))
      req.onsuccess = () => {
        const row = req.result as StoredDxfPreview | undefined
        if (!row?.blob) {
          resolve(null)
          return
        }
        void row.blob.text().then(resolve).catch(() => resolve(null))
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function putDwgDxfPreview(
  fileId: string,
  uploadedAtIso: string,
  dxfText: string,
  previewAtIso?: string,
): Promise<void> {
  const record: StoredDxfPreview = {
    id: dxfPreviewId(fileId, uploadedAtIso, previewAtIso),
    fileId,
    uploadedAtIso,
    blob: new Blob([dxfText], { type: 'application/dxf' }),
    cachedAtIso: new Date().toISOString(),
  }
  await runTx(STORE_DXF_PREVIEWS, 'readwrite', (tx) => {
    tx.objectStore(STORE_DXF_PREVIEWS).put(record)
  })
}

export async function deleteDwgDxfPreviewsForFile(fileId: string): Promise<void> {
  await runTx(STORE_DXF_PREVIEWS, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_DXF_PREVIEWS)
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      const row = cursor.value as StoredDxfPreview
      if (row.fileId === fileId) cursor.delete()
      cursor.continue()
    }
  })
}

export async function deleteProjectFile(id: string): Promise<void> {
  await runTx([STORE_FILES, STORE_BLOBS, STORE_DXF_PREVIEWS], 'readwrite', (tx) => {
    tx.objectStore(STORE_FILES).delete(id)
    tx.objectStore(STORE_BLOBS).delete(id)
    const previewStore = tx.objectStore(STORE_DXF_PREVIEWS)
    const req = previewStore.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      const row = cursor.value as StoredDxfPreview
      if (row.fileId === id) cursor.delete()
      cursor.continue()
    }
  })
}

/**
 * Подгоняет локальный кэш под сервер: удаляет записи сайта, которых нет
 * в remoteIds (кроме pendingIds — ещё не отправленные с этого устройства).
 */
export async function pruneProjectFilesToRemote(
  siteId: string,
  remoteIds: ReadonlySet<string>,
  pendingIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const localRows = await listProjectFilesBySite(siteId)
  for (const row of localRows) {
    if (remoteIds.has(row.id) || pendingIds.has(row.id)) continue
    await deleteProjectFile(row.id)
  }
}

/** id папки и всех вложенных файлов/папок (для удаления). */
export function collectDescendantIds(
  all: readonly StoredSiteProjectFile[],
  folderId: string,
): string[] {
  const ids = new Set<string>([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const row of all) {
      if (ids.has(row.id)) continue
      const parent = projectParentId(row)
      if (parent && ids.has(parent)) {
        ids.add(row.id)
        grew = true
      }
    }
  }
  return [...ids]
}
