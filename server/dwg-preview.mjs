import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { initWasm, convertDwgToDxf } from '@cadview/dwg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WASM_PATH = path.join(__dirname, '..', 'node_modules', '@cadview', 'dwg', 'dist', 'libredwg.wasm')

/** ACadSharp CLI — лучше тянет «сложные» DWG (Proxy/AEC), чем LibreDWG. */
const DWG2DXF_BIN =
  (process.env.DELORESH_DWG2DXF || '').trim() ||
  '/opt/deloresh/dwg2dxf/publish/Dwg2Dxf'

/** @type {Promise<void> | null} */
let wasmInit = null

/** @type {Map<string, Promise<Buffer>>} */
const inflight = new Map()

/** @type {Map<string, Promise<number | null>>} */
const pngInflight = new Map()

function ensureWasm() {
  if (!wasmInit) {
    wasmInit = initWasm({ wasmUrl: WASM_PATH }).then(() => undefined)
  }
  return wasmInit
}

/** ACadSharp CLI — PNG с заливками/цветами как в AutoCAD. */
const DWG2PNG_BIN =
  (process.env.DELORESH_DWG2PNG || '').trim() ||
  '/opt/deloresh/dwg2png/publish/Dwg2Png'

/** @param {string} baseDir @param {string} fileId */
export function pngPreviewMetaPath(baseDir, fileId) {
  return path.join(baseDir, 'previews', `${fileId}.png.meta.json`)
}

/** @param {string} baseDir @param {string} fileId */
export function pngPreviewPath(baseDir, fileId) {
  return path.join(baseDir, 'previews', `${fileId}.png`)
}

/** @param {string} baseDir @param {string} fileId */
export function dxfPreviewPath(baseDir, fileId) {
  return path.join(baseDir, 'previews', `${fileId}.dxf.gz`)
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [opts]
 */
function runCommand(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 180_000
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`timeout:${command}`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`exit_${code}:${stderr || stdout || command}`))
    })
  })
}

/** @param {Buffer} dwgBuffer */
async function convertWithLibreDwg(dwgBuffer) {
  await ensureWasm()
  const ab = dwgBuffer.buffer.slice(dwgBuffer.byteOffset, dwgBuffer.byteOffset + dwgBuffer.byteLength)
  const dxf = await convertDwgToDxf(ab, { timeout: 120_000, wasmUrl: WASM_PATH })
  if (!dxf.trim()) throw new Error('dxf_empty')
  return Buffer.from(dxf, 'utf8')
}

/** @param {Buffer} dwgBuffer */
async function convertWithACadSharp(dwgBuffer) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dwg2dxf-'))
  const inPath = path.join(tmpRoot, 'in.dwg')
  const outPath = path.join(tmpRoot, 'out.dxf')
  try {
    await fs.writeFile(inPath, dwgBuffer)
    await runCommand(DWG2DXF_BIN, [inPath, outPath], { timeoutMs: 180_000 })
    const dxf = await fs.readFile(outPath)
    if (dxf.length < 32) throw new Error('dxf_empty')
    return dxf
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** @typedef {'acadsharp' | 'libredwg'} DxfPreviewEngine */

/** @param {Buffer} dwgBuffer @param {{ allowLibreFallback?: boolean }} [opts] */
export async function convertDwgBufferToDxfGzip(dwgBuffer, opts = {}) {
  const allowLibreFallback = opts.allowLibreFallback !== false
  /** @type {Error | null} */
  let lastError = null

  // ACadSharp первым: LibreDWG часто «успешно» отдаёт урезанную геометрию.
  try {
    const dxf = await convertWithACadSharp(dwgBuffer)
    return { gz: zlib.gzipSync(dxf), engine: /** @type {DxfPreviewEngine} */ ('acadsharp') }
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e))
    console.warn('[dwg-preview] ACadSharp failed', lastError.message)
  }

  if (!allowLibreFallback) {
    throw new Error(
      `dxf_conversion_failed: acadsharp=${lastError?.message ?? 'n/a'}; libre=disabled`,
    )
  }

  console.warn('[dwg-preview] falling back to LibreDWG — часть объектов может пропасть')
  try {
    const dxf = await convertWithLibreDwg(dwgBuffer)
    return { gz: zlib.gzipSync(dxf), engine: /** @type {DxfPreviewEngine} */ ('libredwg') }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    throw new Error(
      `dxf_conversion_failed: acadsharp=${lastError?.message ?? 'n/a'}; libre=${err.message}`,
    )
  }
}

/**
 * @param {string} baseDir
 * @param {string} fileId
 * @param {Buffer} dwgBuffer
 */
/** @param {Buffer} dwgBuffer @param {number} [width] */
function pickPngRenderWidth(dwgBuffer, width) {
  if (width) return width
  const env = Number(process.env.DELORESH_PNG_MAX_DIMENSION)
  if (Number.isFinite(env) && env >= 2048) return Math.round(env)
  if (dwgBuffer.length > 20_000_000) return 8192
  if (dwgBuffer.length > 8_000_000) return 10240
  return 12288
}

/** @param {Buffer} dwgBuffer @param {number} [width] */
async function convertWithACadSharpPng(dwgBuffer, width) {
  const renderWidth = pickPngRenderWidth(dwgBuffer, width)
  const timeoutMs =
    renderWidth >= 12288 ? 360_000 : renderWidth >= 10240 ? 300_000 : renderWidth >= 8192 ? 240_000 : 180_000
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dwg2png-'))
  const inPath = path.join(tmpRoot, 'in.dwg')
  const outPath = path.join(tmpRoot, 'out.png')
  try {
    await fs.writeFile(inPath, dwgBuffer)
    await runCommand(DWG2PNG_BIN, [inPath, outPath, String(renderWidth)], { timeoutMs })
    const png = await fs.readFile(outPath)
    if (png.length < 64) throw new Error('png_empty')
    /** @type {Record<string, unknown> | null} */
    let meta = null
    try {
      const raw = await fs.readFile(`${outPath}.meta.json`, 'utf8')
      meta = JSON.parse(raw)
    } catch {
      /* older Dwg2Png without sidecar */
    }
    return { png, meta }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** @param {string} baseDir @param {string} fileId @param {Buffer} dwgBuffer */
export async function writePngPreview(baseDir, fileId, dwgBuffer) {
  const previewPath = pngPreviewPath(baseDir, fileId)
  await fs.mkdir(path.dirname(previewPath), { recursive: true })
  const { png, meta } = await convertWithACadSharpPng(dwgBuffer)
  await fs.writeFile(previewPath, png)
  if (meta) {
    await fs.writeFile(pngPreviewMetaPath(baseDir, fileId), `${JSON.stringify(meta)}\n`, 'utf8')
  }
  return { pngBytes: png.length, meta }
}

/** @param {string} baseDir @param {string} fileId */
export async function readPngPreviewMeta(baseDir, fileId) {
  try {
    const raw = await fs.readFile(pngPreviewMetaPath(baseDir, fileId), 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null
    throw e
  }
}

/** @param {string} baseDir @param {string} fileId */
export async function readPngPreview(baseDir, fileId) {
  try {
    return await fs.readFile(pngPreviewPath(baseDir, fileId))
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null
    throw e
  }
}

/** @param {string} baseDir @param {string} fileId */
export async function deletePngPreview(baseDir, fileId) {
  try {
    await fs.unlink(pngPreviewPath(baseDir, fileId))
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
  }
  try {
    await fs.unlink(pngPreviewMetaPath(baseDir, fileId))
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
  }
}

/** @param {string} baseDir @param {string} fileId @param {Buffer} dwgBuffer */
export async function writeDwgPreviews(baseDir, fileId, dwgBuffer) {
  const dxf = await writeDxfPreview(baseDir, fileId, dwgBuffer)
  /** @type {{ pngBytes?: number, pngWorldBounds?: Record<string, unknown>, pngError?: string }} */
  const pngMeta = {}
  try {
    const written = await writePngPreview(baseDir, fileId, dwgBuffer)
    pngMeta.pngBytes = written.pngBytes
    if (written.meta) pngMeta.pngWorldBounds = written.meta
  } catch (e) {
    pngMeta.pngError = e instanceof Error ? e.message : String(e)
    console.warn('[dwg-preview] PNG render failed', fileId, pngMeta.pngError)
  }
  return { ...dxf, ...pngMeta }
}

/** @param {string} baseDir @param {string} fileId @param {Buffer} dwgBuffer */
export async function regenerateDwgPreviews(baseDir, fileId, dwgBuffer) {
  await deleteDxfPreview(baseDir, fileId)
  await deletePngPreview(baseDir, fileId)
  return writeDwgPreviews(baseDir, fileId, dwgBuffer)
}

/** @param {string} manifestPath @param {string} baseDir @param {string} fileId */
export async function syncPngWorldBoundsToManifest(manifestPath, baseDir, fileId) {
  const meta = await readPngPreviewMeta(baseDir, fileId)
  if (!meta) return false
  const raw = await fs.readFile(manifestPath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) return false
  let changed = false
  for (const row of list) {
    if (!row || typeof row !== 'object' || row.id !== fileId) continue
    row.pngWorldBounds = meta
    changed = true
    break
  }
  if (changed) {
    await fs.writeFile(manifestPath, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
  }
  return changed
}

/** @param {string} manifestPath @param {string} fileId */
export async function markPngPreviewPending(manifestPath, fileId) {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) return
  for (const row of list) {
    if (!row || typeof row !== 'object' || row.id !== fileId) continue
    row.pngPreviewStatus = 'pending'
    delete row.pngPreviewBytes
    delete row.pngPreviewAtIso
    delete row.pngWorldBounds
    break
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
}

/** @param {string} baseDir @param {string} fileId */
export function isPngPreviewInflight(baseDir, fileId) {
  return pngInflight.has(`${baseDir}:${fileId}`)
}

/**
 * @param {string} baseDir
 * @param {string} fileId
 * @param {string} manifestPath
 * @param {() => Promise<Buffer>} readDwg
 */
export function kickPngPreview(baseDir, fileId, manifestPath, readDwg) {
  const key = `${baseDir}:${fileId}`
  const existing = pngInflight.get(key)
  if (existing) return existing

  const job = (async () => {
    try {
      await markPngPreviewPending(manifestPath, fileId)
      const buf = await readDwg()
      const written = await writePngPreview(baseDir, fileId, buf)
      await markPngPreviewReady(manifestPath, fileId, written.pngBytes, written.meta)
      return written.pngBytes
    } catch (e) {
      console.error('[dwg-preview] png background failed', fileId, e)
      await markPngPreviewFailed(manifestPath, fileId)
      return null
    } finally {
      pngInflight.delete(key)
    }
  })()

  pngInflight.set(key, job)
  return job
}

/** @param {string} manifestPath @param {string} fileId @param {number} pngBytes @param {Record<string, unknown> | null | undefined} [pngWorldBounds] */
export async function markPngPreviewReady(manifestPath, fileId, pngBytes, pngWorldBounds) {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) return
  for (const row of list) {
    if (!row || typeof row !== 'object' || row.id !== fileId) continue
    row.pngPreviewBytes = pngBytes
    row.pngPreviewAtIso = new Date().toISOString()
    row.pngPreviewStatus = 'ready'
    if (pngWorldBounds) row.pngWorldBounds = pngWorldBounds
    break
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
}

/** @param {string} manifestPath @param {string} fileId */
export async function markPngPreviewFailed(manifestPath, fileId) {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) return
  for (const row of list) {
    if (!row || typeof row !== 'object' || row.id !== fileId) continue
    row.pngPreviewStatus = 'failed'
    delete row.pngPreviewBytes
    delete row.pngPreviewAtIso
    delete row.pngWorldBounds
    break
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
}

/** @param {string} baseDir @param {string} fileId @param {Buffer} dwgBuffer */
export async function writeDxfPreview(baseDir, fileId, dwgBuffer) {
  const previewPath = dxfPreviewPath(baseDir, fileId)
  await fs.mkdir(path.dirname(previewPath), { recursive: true })
  const { gz, engine } = await convertDwgBufferToDxfGzip(dwgBuffer)
  await fs.writeFile(previewPath, gz)
  return { previewBytes: gz.length, engine }
}

/** @param {string} baseDir @param {string} fileId @param {Buffer} dwgBuffer */
export async function regenerateDxfPreview(baseDir, fileId, dwgBuffer) {
  await deleteDxfPreview(baseDir, fileId)
  return writeDxfPreview(baseDir, fileId, dwgBuffer)
}

/** @param {string} baseDir @param {string} fileId */
export async function isDxfPreviewStale(baseDir, fileId) {
  const previewPath = dxfPreviewPath(baseDir, fileId)
  const blobPath = path.join(baseDir, 'blobs', fileId)
  try {
    const [previewStat, blobStat] = await Promise.all([fs.stat(previewPath), fs.stat(blobPath)])
    return blobStat.mtimeMs > previewStat.mtimeMs + 1000
  } catch {
    return true
  }
}
/** @param {string} baseDir @param {string} fileId */
export async function readDxfPreview(baseDir, fileId) {
  try {
    return await fs.readFile(dxfPreviewPath(baseDir, fileId))
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return null
    throw e
  }
}

/**
 * @param {string} baseDir
 * @param {string} fileId
 * @param {() => Promise<Buffer>} readDwg
 */
/** @param {string} baseDir @param {string} fileId @param {() => Promise<Buffer>} readDwg @param {{ force?: boolean }} [opts] */
export async function ensureDxfPreview(baseDir, fileId, readDwg, opts = {}) {
  const key = `${baseDir}:${fileId}`
  const pending = inflight.get(key)
  if (pending) return pending

  const job = (async () => {
    const previewPath = dxfPreviewPath(baseDir, fileId)
    const blobPath = path.join(baseDir, 'blobs', fileId)
    if (!opts.force) {
      const existing = await readDxfPreview(baseDir, fileId)
      if (existing) {
        try {
          const [previewStat, blobStat] = await Promise.all([
            fs.stat(previewPath),
            fs.stat(blobPath),
          ])
          if (blobStat.mtimeMs <= previewStat.mtimeMs + 1000) return existing
        } catch {
          return existing
        }
      }
    }
    const dwgBuffer = await readDwg()
    await writeDxfPreview(baseDir, fileId, dwgBuffer)
    const created = await readDxfPreview(baseDir, fileId)
    if (!created) throw new Error('preview_write_failed')
    return created
  })()

  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

/** @param {string} baseDir @param {string} fileId */
export async function deleteDxfPreview(baseDir, fileId) {
  try {
    await fs.unlink(dxfPreviewPath(baseDir, fileId))
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
  }
}

/** @param {string} baseDir @param {string} fileId */
export async function deleteAllDwgPreviews(baseDir, fileId) {
  await deleteDxfPreview(baseDir, fileId)
  await deletePngPreview(baseDir, fileId)
}

/**
 * @param {string} manifestPath
 * @param {string} fileId
 * @param {'pending' | 'ready' | 'failed'} status
 * @param {number} [previewBytes]
 */
export async function markDxfPreviewStatus(
  manifestPath,
  fileId,
  status,
  previewBytes,
  previewEngine,
) {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) return
  let changed = false
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    if (row.id !== fileId) continue
    row.dxfPreviewStatus = status
    if (status === 'ready' && typeof previewBytes === 'number') {
      row.dxfPreviewBytes = previewBytes
      row.dxfPreviewAtIso = new Date().toISOString()
      if (previewEngine === 'acadsharp' || previewEngine === 'libredwg') {
        row.dxfPreviewEngine = previewEngine
      }
    }
    if (status === 'failed') {
      row.dxfPreviewBytes = 0
      delete row.dxfPreviewEngine
    }
    if (status === 'pending') {
      delete row.dxfPreviewBytes
      delete row.dxfPreviewAtIso
      delete row.dxfPreviewEngine
    }
    changed = true
    break
  }
  if (changed) {
    await fs.writeFile(manifestPath, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
  }
}

/**
 * @param {string} manifestPath
 * @param {string} fileId
 * @param {number} previewBytes
 */
/** @param {string} manifestPath @param {string} fileId @param {number} previewBytes @param {'acadsharp'|'libredwg'} [previewEngine] */
export async function markDxfPreviewReady(manifestPath, fileId, previewBytes, previewEngine) {
  await markDxfPreviewStatus(manifestPath, fileId, 'ready', previewBytes, previewEngine)
}
