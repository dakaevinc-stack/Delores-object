import { convertDwgToDxf, initWasm } from '@cadview/dwg'
import {
  fetchProjectFileDxfPreviewRemote,
  fetchProjectFilePngPreviewRemote,
  projectFilePngPreviewUrl,
} from './siteFormsApi'
import {
  getDwgDxfPreview,
  putDwgDxfPreview,
} from './siteProjectFilesRepository'

/** WASM с того же origin — только офлайн-fallback. */
export const DWG_WASM_URL = `${import.meta.env.BASE_URL}libredwg.wasm`

export type DwgLoadPhase = 'fetching' | 'converting' | 'rendering'

/** Сброс кэша при смене пайплайна превью (LibreDWG → полный ACadSharp). */
const PREVIEW_CACHE_GEN = 'acadsharp-v2'

const inflight = new Map<string, Promise<string>>()
const memoryCache = new Map<string, string>()
const pngBlobCache = new Map<string, import('./siteFormsApi').PngPreviewRemote>()
const pngInflight = new Map<string, Promise<import('./siteFormsApi').PngPreviewRemote | null>>()

function pngCacheKey(fileId: string, previewKey: string): string {
  return `${PREVIEW_CACHE_GEN}:png:${fileId}:${previewKey}`
}

function cacheKey(fileId: string, uploadedAtIso: string, previewAtIso?: string): string {
  return `${PREVIEW_CACHE_GEN}:${fileId}:${uploadedAtIso}:${previewAtIso ?? 'none'}`
}

export async function resolveDwgDxfText(
  siteId: string,
  fileId: string,
  uploadedAtIso: string,
  opts: {
    remoteActive: boolean
    fetchBlob: () => Promise<Blob | null>
    onPhase?: (phase: DwgLoadPhase) => void
    /** Меняется при пересборке DXF на сервере — инвалидирует локальный кэш */
    dxfPreviewAtIso?: string
    /** Принудительно пересобрать превью на сервере */
    regenerate?: boolean
  },
): Promise<string> {
  const key = cacheKey(fileId, uploadedAtIso, opts.dxfPreviewAtIso)

  const mem = memoryCache.get(key)
  if (mem) {
    opts.onPhase?.('rendering')
    return mem
  }

  const cached = await getDwgDxfPreview(fileId, uploadedAtIso, opts.dxfPreviewAtIso)
  if (cached) {
    memoryCache.set(key, cached)
    opts.onPhase?.('rendering')
    return cached
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const job = (async () => {
    // Всегда пробуем серверное превью (даже если remoteActive ещё false —
    // иначе 3 минуты «Загружаем…» на пустых 404, пока remoteActive не выставится).
    opts.onPhase?.('converting')
    const remoteDxf = await fetchProjectFileDxfPreviewRemote(siteId, fileId, {
      timeoutMs: opts.remoteActive === false ? 12_000 : 180_000,
      onWait: () => opts.onPhase?.('converting'),
      dxfPreviewAtIso: opts.dxfPreviewAtIso,
      uploadedAtIso,
      regenerate: opts.regenerate,
    })
    if (remoteDxf) {
      memoryCache.set(key, remoteDxf)
      void putDwgDxfPreview(fileId, uploadedAtIso, remoteDxf, opts.dxfPreviewAtIso)
      opts.onPhase?.('rendering')
      return remoteDxf
    }

    // Офлайн / файла нет на сервере: LibreDWG в браузере.
    opts.onPhase?.('fetching')
    const wasmInit = initWasm({ wasmUrl: DWG_WASM_URL })
    const blob = await opts.fetchBlob()
    if (!blob) throw new Error('dxf_conversion_failed: server_preview_unavailable')
    await wasmInit

    opts.onPhase?.('converting')
    const arrayBuffer = await blob.arrayBuffer()
    try {
      const dxfText = await convertDwgToDxf(arrayBuffer, {
        timeout: 120_000,
        wasmUrl: DWG_WASM_URL,
      })
      if (!dxfText.trim()) throw new Error('dwg_to_dxf_empty')
      memoryCache.set(key, dxfText)
      void putDwgDxfPreview(fileId, uploadedAtIso, dxfText, opts.dxfPreviewAtIso)
      opts.onPhase?.('rendering')
      return dxfText
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(
        detail.includes('conversion failed') || detail.includes('error code')
          ? detail
          : `dwg_conversion_failed: ${detail}`,
      )
    }
  })()

  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

export function hasDwgPreviewInMemory(
  fileId: string,
  uploadedAtIso: string,
  dxfPreviewAtIso?: string,
): boolean {
  return memoryCache.has(cacheKey(fileId, uploadedAtIso, dxfPreviewAtIso))
}

export function getPrefetchedDwgPng(
  fileId: string,
  previewKey: string,
): import('./siteFormsApi').PngPreviewRemote | undefined {
  return pngBlobCache.get(pngCacheKey(fileId, previewKey))
}

export function getPrefetchedDwgPngBlob(fileId: string, previewKey: string): Blob | undefined {
  return getPrefetchedDwgPng(fileId, previewKey)?.blob
}

/** Прогрев PNG-плана — чтобы «План» открывался без ожидания. */
export function prefetchDwgPngPreview(
  siteId: string,
  fileId: string,
  opts: {
    cacheKey: string
    pngPreviewStatus?: 'pending' | 'ready' | 'failed'
  },
): void {
  if (opts.pngPreviewStatus === 'failed') return
  const key = pngCacheKey(fileId, opts.cacheKey)
  if (pngBlobCache.has(key)) return

  const pending = pngInflight.get(key)
  if (pending) {
    void pending.then((result) => {
      if (result?.blob && result.blob.size > 64) pngBlobCache.set(key, result)
    })
    return
  }

  const job = fetchProjectFilePngPreviewRemote(siteId, fileId, {
    cacheKey: opts.cacheKey,
    timeoutMs: 120_000,
  })
  pngInflight.set(key, job)
  void job
    .then((result) => {
      if (result?.blob && result.blob.size > 64) pngBlobCache.set(key, result)
      return result
    })
    .finally(() => {
      pngInflight.delete(key)
    })
}

/** Прогрев — сразу при загрузке страницы, до клика «Открыть». */
export function prefetchDwgPreview(
  siteId: string,
  fileId: string,
  uploadedAtIso: string,
  opts: {
    remoteActive: boolean
    fetchBlob: () => Promise<Blob | null>
    dxfPreviewAtIso?: string
  },
): void {
  void resolveDwgDxfText(siteId, fileId, uploadedAtIso, opts).catch(() => {
    /* тихий прогрев */
  })
}

/** Прогреть превью DWG объекта — без тяжёлого DXF, если PNG уже готов. */
export function prefetchAllDwgPreviews(
  siteId: string,
  rows: readonly {
    id: string
    uploadedAtIso: string
    kind: string
    dxfPreviewAtIso?: string
    pngPreviewAtIso?: string
    pngPreviewStatus?: 'pending' | 'ready' | 'failed'
  }[],
  opts: {
    remoteActive: boolean
    fetchBlob: (fileId: string) => Promise<Blob | null>
  },
): void {
  if (!opts.remoteActive) return
  for (const row of rows) {
    if (row.kind !== 'dwg') continue
    // Готовый план — только HTTP-прогрев картинки (не Blob и не DXF).
    if (row.pngPreviewStatus === 'ready') {
      const cacheKey = row.pngPreviewAtIso ?? row.uploadedAtIso
      const url = projectFilePngPreviewUrl(siteId, row.id, cacheKey)
      if (typeof Image !== 'undefined') {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
      }
      continue
    }
    prefetchDwgPngPreview(siteId, row.id, {
      cacheKey: row.pngPreviewAtIso ?? row.uploadedAtIso,
      pngPreviewStatus: row.pngPreviewStatus,
    })
    prefetchDwgPreview(siteId, row.id, row.uploadedAtIso, {
      remoteActive: true,
      fetchBlob: () => opts.fetchBlob(row.id),
      dxfPreviewAtIso: row.dxfPreviewAtIso,
    })
  }
}

export function preloadDwgWasm(): void {
  void initWasm({ wasmUrl: DWG_WASM_URL }).catch(() => {
    /* fallback при открытии */
  })
}

export function clearDwgPreviewMemoryCache(): void {
  memoryCache.clear()
}

export function evictDwgPreviewMemoryForFile(fileId: string): void {
  for (const key of memoryCache.keys()) {
    const parts = key.split(':')
    if (parts[1] === fileId) memoryCache.delete(key)
  }
  for (const key of pngBlobCache.keys()) {
    if (key.includes(`:png:${fileId}:`)) pngBlobCache.delete(key)
  }
}

/** После загрузки нового DWG — прогреть DXF и PNG на этом устройстве. */
export async function warmDwgPreviewAfterUpload(
  siteId: string,
  row: {
    id: string
    uploadedAtIso: string
    dxfPreviewAtIso?: string
    pngPreviewAtIso?: string
    pngPreviewStatus?: 'pending' | 'ready' | 'failed'
  },
  fetchBlob: () => Promise<Blob | null>,
): Promise<void> {
  await resolveDwgDxfText(siteId, row.id, row.uploadedAtIso, {
    remoteActive: true,
    fetchBlob,
    dxfPreviewAtIso: row.dxfPreviewAtIso,
  })
  prefetchDwgPngPreview(siteId, row.id, {
    cacheKey: row.pngPreviewAtIso ?? row.uploadedAtIso,
    pngPreviewStatus: row.pngPreviewStatus,
  })
}
