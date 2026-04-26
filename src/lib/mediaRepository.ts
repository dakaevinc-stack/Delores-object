/**
 * Хранилище фото/видео объектов в IndexedDB.
 * Данные переживают перезагрузку вкладки и лежат локально в браузере.
 * Позже тот же интерфейс можно перевесить на HTTP-API без изменений в UI.
 */

export type StoredSiteMedia = {
  id: string
  siteId: string
  kind: 'photo' | 'video'
  name: string
  mime: string
  sizeBytes: number
  /** Когда файл был снят (из EXIF / lastModified, fallback — время загрузки). */
  capturedAtIso: string
  /** Когда файл был загружен в хранилище. */
  uploadedAtIso: string
  authorCaption: string
}

const DB_NAME = 'deloresh-media'
const DB_VERSION = 1
const STORE_MEDIA = 'media'
const STORE_BLOBS = 'blobs'
const INDEX_BY_SITE = 'by-site'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB недоступен в этом окружении'))
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const s = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' })
        s.createIndex(INDEX_BY_SITE, 'siteId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' })
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
    const t = db.transaction(stores, mode)
    let result: T
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
    Promise.resolve(fn(t))
      .then((r) => {
        result = r
      })
      .catch((err) => {
        try {
          t.abort()
        } catch {
          /* no-op */
        }
        reject(err)
      })
  })
}

/** Список записей по объекту, без содержимого файлов. */
export async function listMediaBySite(siteId: string): Promise<StoredSiteMedia[]> {
  return runTx(STORE_MEDIA, 'readonly', (t) => {
    return new Promise<StoredSiteMedia[]>((resolve, reject) => {
      const store = t.objectStore(STORE_MEDIA)
      const idx = store.index(INDEX_BY_SITE)
      const req = idx.getAll(IDBKeyRange.only(siteId))
      req.onsuccess = () => resolve((req.result ?? []) as StoredSiteMedia[])
      req.onerror = () => reject(req.error)
    })
  })
}

/** Получить файл по id (для просмотра/скачивания). */
export async function getMediaBlob(id: string): Promise<Blob | null> {
  return runTx(STORE_BLOBS, 'readonly', (t) => {
    return new Promise<Blob | null>((resolve, reject) => {
      const req = t.objectStore(STORE_BLOBS).get(id)
      req.onsuccess = () => {
        const rec = req.result as { id: string; blob: Blob } | undefined
        resolve(rec?.blob ?? null)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Сохранить запись и её blob-ы атомарно. */
export async function putMedia(record: StoredSiteMedia, blob: Blob): Promise<void> {
  await runTx([STORE_MEDIA, STORE_BLOBS], 'readwrite', (t) => {
    t.objectStore(STORE_MEDIA).put(record)
    t.objectStore(STORE_BLOBS).put({ id: record.id, blob })
  })
}

/** Удаляет запись и связанный файл. */
export async function deleteMedia(id: string): Promise<void> {
  await runTx([STORE_MEDIA, STORE_BLOBS], 'readwrite', (t) => {
    t.objectStore(STORE_MEDIA).delete(id)
    t.objectStore(STORE_BLOBS).delete(id)
  })
}
