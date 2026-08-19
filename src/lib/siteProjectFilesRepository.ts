export type SiteProjectFileKind = 'pdf' | 'dwg'

export type StoredSiteProjectFile = {
  id: string
  siteId: string
  kind: SiteProjectFileKind
  name: string
  mime: string
  sizeBytes: number
  uploadedAtIso: string
}

const DB_NAME = 'deloresh-site-projects'
const DB_VERSION = 1
const STORE_FILES = 'files'
const STORE_BLOBS = 'blobs'
const INDEX_BY_SITE = 'by-site'

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

export async function listProjectFilesBySite(siteId: string): Promise<StoredSiteProjectFile[]> {
  return runTx(STORE_FILES, 'readonly', (tx) => {
    return new Promise<StoredSiteProjectFile[]>((resolve, reject) => {
      const req = tx.objectStore(STORE_FILES).index(INDEX_BY_SITE).getAll(IDBKeyRange.only(siteId))
      req.onsuccess = () => resolve((req.result ?? []) as StoredSiteProjectFile[])
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

export async function putProjectFile(record: StoredSiteProjectFile, blob: Blob): Promise<void> {
  await runTx([STORE_FILES, STORE_BLOBS], 'readwrite', async (tx) => {
    const fileStore = tx.objectStore(STORE_FILES)
    const blobStore = tx.objectStore(STORE_BLOBS)
    const existing = await new Promise<StoredSiteProjectFile[]>((resolve, reject) => {
      const req = fileStore.index(INDEX_BY_SITE).getAll(IDBKeyRange.only(record.siteId))
      req.onsuccess = () => resolve((req.result ?? []) as StoredSiteProjectFile[])
      req.onerror = () => reject(req.error)
    })
    for (const row of existing) {
      if (row.kind !== record.kind) continue
      fileStore.delete(row.id)
      blobStore.delete(row.id)
    }
    fileStore.put(record)
    blobStore.put({ id: record.id, blob })
  })
}

export async function deleteProjectFile(id: string): Promise<void> {
  await runTx([STORE_FILES, STORE_BLOBS], 'readwrite', (tx) => {
    tx.objectStore(STORE_FILES).delete(id)
    tx.objectStore(STORE_BLOBS).delete(id)
  })
}
