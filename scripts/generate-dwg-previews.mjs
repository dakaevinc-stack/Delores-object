#!/usr/bin/env node
/**
 * Генерация DXF-превью для всех DWG в project-files.
 * Запуск: node scripts/generate-dwg-previews.mjs
 *   DELORESH_SITE_FORMS_DATA=/var/lib/deloresh/site-forms node scripts/generate-dwg-previews.mjs
 * Пересборка всех превью (после обновления ACadSharp):
 *   node scripts/generate-dwg-previews.mjs --force
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  markDxfPreviewReady,
  markPngPreviewFailed,
  markPngPreviewReady,
  readDxfPreview,
  regenerateDwgPreviews,
  syncPngWorldBoundsToManifest,
  writeDwgPreviews,
} from '../server/dwg-preview.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT =
  process.env.DELORESH_SITE_FORMS_DATA?.trim() ||
  path.join(__dirname, '..', 'data', 'site-forms')
const sitesRoot = path.join(DATA_ROOT, 'sites')
const force = process.argv.includes('--force')

const siteIds = await fs.readdir(sitesRoot).catch(() => [])
let done = 0
let skipped = 0

for (const siteId of siteIds) {
  const baseDir = path.join(sitesRoot, siteId, 'project-files')
  const manifestPath = path.join(baseDir, 'manifest.json')
  let list = []
  try {
    list = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(list)) continue

  for (const row of list) {
    if (!row || row.kind !== 'dwg') continue
    const fileId = row.id
    const existing = await readDxfPreview(baseDir, fileId)
    if (existing && !force) {
      skipped += 1
      if (!row.dxfPreviewBytes) {
        await markDxfPreviewReady(manifestPath, fileId, existing.length)
      }
      if (!row.pngWorldBounds) {
        await syncPngWorldBoundsToManifest(manifestPath, baseDir, fileId)
      }
      continue
    }
    const blobPath = path.join(baseDir, 'blobs', fileId)
    try {
      console.log(`[dwg-preview] ${siteId}/${fileId} …`)
      const buf = await fs.readFile(blobPath)
      const result = force
        ? await regenerateDwgPreviews(baseDir, fileId, buf)
        : await writeDwgPreviews(baseDir, fileId, buf)
      const { previewBytes, engine, pngBytes, pngWorldBounds, pngError } = result
      await markDxfPreviewReady(manifestPath, fileId, previewBytes, engine)
      if (typeof pngBytes === 'number') {
        await markPngPreviewReady(manifestPath, fileId, pngBytes, pngWorldBounds)
      } else {
        await markPngPreviewFailed(manifestPath, fileId)
        if (pngError) console.warn(`[dwg-preview] png fail ${siteId}/${fileId}: ${pngError}`)
      }
      done += 1
      const pngNote =
        typeof pngBytes === 'number' ? ` png=${(pngBytes / 1024).toFixed(0)}KB` : ' png=FAIL'
      console.log(
        `[dwg-preview] ok ${siteId}/${fileId} engine=${engine} (${(previewBytes / 1024).toFixed(0)} KB gzip)${pngNote}`,
      )
    } catch (e) {
      console.error(`[dwg-preview] fail ${siteId}/${fileId}:`, e)
    }
  }
}

console.log(`[dwg-preview] generated=${done} skipped=${skipped} force=${force}`)
