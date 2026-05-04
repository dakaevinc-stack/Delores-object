/**
 * HTTP API для заявок снабженцу, отчётов бригадира и оперативного обмена (фото/видео): JSON и файлы на диске по объектам.
 *
 * Запуск: node server/site-forms.mjs
 * Переменные:
 *   DELORESH_SITE_FORMS_PORT — порт (по умолчанию 8787)
 *   DELORESH_SITE_FORMS_DATA — каталог данных (по умолчанию ./data/site-forms рядом с репозиторием)
 *   DELORESH_SITE_FORMS_WRITE_SECRET — если задан, заголовок X-Deloresh-Write-Secret обязателен для POST/PATCH/DELETE
 */

import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.DELORESH_SITE_FORMS_PORT || 8787) || 8787
const DATA_ROOT =
  process.env.DELORESH_SITE_FORMS_DATA?.trim() ||
  path.join(__dirname, '..', 'data', 'site-forms')
const WRITE_SECRET = (process.env.DELORESH_SITE_FORMS_WRITE_SECRET || '').trim()
const MAX_BODY_BYTES = 100 * 1024 * 1024

/** @param {string | undefined} id */
function safeSiteId(id) {
  if (!id || id.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(id)) return null
  return id
}

/** @param {string | undefined} id */
function safeMediaId(id) {
  if (!id || id.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(id)) return null
  return id
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Deloresh-Write-Secret')
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  setCors(res)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('payload too large')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** @param {string} filePath */
async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const j = JSON.parse(raw)
    return Array.isArray(j) ? j : []
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return []
    throw e
  }
}

/** @param {string} filePath @param {unknown[]} arr */
async function writeJsonArray(filePath, arr) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf8')
}

/** @param {unknown} x */
function isProcurementRow(x) {
  if (!x || typeof x !== 'object') return false
  const r = /** @type {Record<string, unknown>} */ (x)
  return (
    typeof r.id === 'string' &&
    typeof r.shortCode === 'string' &&
    typeof r.siteId === 'string' &&
    typeof r.siteName === 'string' &&
    typeof r.createdAtIso === 'string' &&
    typeof r.createdBy === 'string' &&
    typeof r.note === 'string' &&
    Array.isArray(r.items)
  )
}

/** @param {unknown} x */
function isBrigadierReportRow(x) {
  if (!x || typeof x !== 'object') return false
  const r = /** @type {Record<string, unknown>} */ (x)
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    typeof r.reportedAtIso === 'string' &&
    Array.isArray(r.lines) &&
    Array.isArray(r.problems) &&
    typeof r.responsible === 'string' &&
    Array.isArray(r.attachments)
  )
}

/** @param {unknown} x */
function isObjectMediaRecord(x) {
  if (!x || typeof x !== 'object') return false
  const r = /** @type {Record<string, unknown>} */ (x)
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    (r.kind === 'photo' || r.kind === 'video') &&
    typeof r.name === 'string' &&
    typeof r.mime === 'string' &&
    typeof r.sizeBytes === 'number' &&
    typeof r.capturedAtIso === 'string' &&
    typeof r.uploadedAtIso === 'string' &&
    typeof r.authorCaption === 'string'
  )
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function checkWrite(req, res) {
  if (!WRITE_SECRET) return true
  const got = String(req.headers['x-deloresh-write-secret'] ?? '').trim()
  if (got === WRITE_SECRET) return true
  sendJson(res, 403, { error: 'write_forbidden' })
  return false
}

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const url = new URL(req.url || '/', `http://127.0.0.1`)
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[0] === 'api' && parts[1] === 'health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'sites' &&
      parts[2] &&
      parts[3] === 'procurement-requests'
    ) {
      const siteId = safeSiteId(parts[2])
      if (!siteId) {
        sendJson(res, 400, { error: 'bad_site_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'sites', siteId, 'procurement-requests.json')

      if (parts.length === 4 && req.method === 'GET') {
        const list = await readJsonArray(file)
        const valid = list.filter(isProcurementRow)
        sendJson(res, 200, valid)
        return
      }

      if (parts.length === 4 && req.method === 'POST') {
        if (!checkWrite(req, res)) return
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!isProcurementRow(body)) {
          sendJson(res, 400, { error: 'invalid_procurement' })
          return
        }
        const list = await readJsonArray(file)
        if (list.some((x) => isProcurementRow(x) && /** @type {{id:string}} */ (x).id === body.id)) {
          sendJson(res, 200, { ok: true, duplicate: true })
          return
        }
        list.unshift(body)
        await writeJsonArray(file, list)
        sendJson(res, 201, { ok: true })
        return
      }

      if (parts.length === 5 && req.method === 'PATCH') {
        if (!checkWrite(req, res)) return
        const id = parts[4]
        if (!id || id.includes('..')) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const raw = await readBody(req)
        const patch = JSON.parse(raw)
        if (!patch || typeof patch !== 'object') {
          sendJson(res, 400, { error: 'invalid_patch' })
          return
        }
        const list = await readJsonArray(file)
        const idx = list.findIndex((x) => isProcurementRow(x) && /** @type {{id:string}} */ (x).id === id)
        if (idx === -1) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        const cur = /** @type {Record<string, unknown>} */ (list[idx])
        const allowed = ['status', 'urgent', 'neededByIso', 'note', 'items', 'siteName']
        const merged = { ...cur }
        for (const k of allowed) {
          if (k in patch) merged[k] = patch[k]
        }
        list[idx] = merged
        await writeJsonArray(file, list)
        sendJson(res, 200, { ok: true })
        return
      }

      if (parts.length === 5 && req.method === 'DELETE') {
        if (!checkWrite(req, res)) return
        const id = parts[4]
        if (!id || id.includes('..')) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(file)
        const next = list.filter((x) => !isProcurementRow(x) || /** @type {{id:string}} */ (x).id !== id)
        await writeJsonArray(file, next)
        sendJson(res, 200, { ok: true })
        return
      }
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'sites' &&
      parts[2] &&
      parts[3] === 'brigadier-reports'
    ) {
      const siteId = safeSiteId(parts[2])
      if (!siteId) {
        sendJson(res, 400, { error: 'bad_site_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'sites', siteId, 'brigadier-reports.json')

      if (parts.length === 4 && req.method === 'GET') {
        const list = await readJsonArray(file)
        const valid = list.filter(isBrigadierReportRow)
        sendJson(res, 200, valid)
        return
      }

      if (parts.length === 4 && req.method === 'POST') {
        if (!checkWrite(req, res)) return
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!isBrigadierReportRow(body)) {
          sendJson(res, 400, { error: 'invalid_report' })
          return
        }
        const list = await readJsonArray(file)
        if (list.some((x) => isBrigadierReportRow(x) && /** @type {{id:string}} */ (x).id === body.id)) {
          sendJson(res, 200, { ok: true, duplicate: true })
          return
        }
        list.unshift(body)
        await writeJsonArray(file, list)
        sendJson(res, 201, { ok: true })
        return
      }

      if (parts.length === 5 && req.method === 'DELETE') {
        if (!checkWrite(req, res)) return
        const id = parts[4]
        if (!id || id.includes('..')) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(file)
        const next = list.filter((x) => !isBrigadierReportRow(x) || /** @type {{id:string}} */ (x).id !== id)
        await writeJsonArray(file, next)
        // Удаляем каталог blobs этого отчёта (если был)
        const blobsDir = path.join(DATA_ROOT, 'sites', siteId, 'brigadier-blobs', id)
        try {
          await fs.rm(blobsDir, { recursive: true, force: true })
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
        }
        sendJson(res, 200, { ok: true })
        return
      }

      // POST /api/sites/:siteId/brigadier-reports/:reportId/attachments
      // body: { id, name, mime, sizeBytes, dataBase64 }
      if (parts.length === 6 && parts[5] === 'attachments' && req.method === 'POST') {
        if (!checkWrite(req, res)) return
        const reportId = parts[4]
        if (!reportId || reportId.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(reportId)) {
          sendJson(res, 400, { error: 'bad_report_id' })
          return
        }
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'invalid_attachment' })
          return
        }
        const b = /** @type {Record<string, unknown>} */ (body)
        const attId = typeof b.id === 'string' ? b.id : ''
        if (!attId || attId.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(attId)) {
          sendJson(res, 400, { error: 'bad_attachment_id' })
          return
        }
        if (typeof b.dataBase64 !== 'string') {
          sendJson(res, 400, { error: 'invalid_attachment' })
          return
        }
        const buf = Buffer.from(b.dataBase64, 'base64')
        if (buf.length === 0) {
          sendJson(res, 400, { error: 'empty_payload' })
          return
        }
        const dir = path.join(DATA_ROOT, 'sites', siteId, 'brigadier-blobs', reportId)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, attId), buf)
        sendJson(res, 201, { ok: true })
        return
      }

      // GET /api/sites/:siteId/brigadier-reports/:reportId/attachments/:attId/blob
      if (
        parts.length === 8 &&
        parts[5] === 'attachments' &&
        parts[7] === 'blob' &&
        req.method === 'GET'
      ) {
        const reportId = parts[4]
        const attId = parts[6]
        if (!reportId || reportId.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(reportId)) {
          sendJson(res, 400, { error: 'bad_report_id' })
          return
        }
        if (!attId || attId.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(attId)) {
          sendJson(res, 400, { error: 'bad_attachment_id' })
          return
        }
        // Mime берём из родительского JSON отчёта (attachments[].mime).
        let mime = 'application/octet-stream'
        const list = await readJsonArray(file)
        const report = list.find(
          (x) => isBrigadierReportRow(x) && /** @type {{id:string}} */ (x).id === reportId,
        )
        if (report) {
          const r = /** @type {{ attachments: Array<Record<string, unknown>> }} */ (report)
          const att = r.attachments.find((a) => /** @type {{id:string}} */ (a).id === attId)
          if (att && typeof att.mime === 'string' && att.mime) {
            mime = att.mime
          } else if (att && att.kind === 'photo') {
            mime = 'image/jpeg'
          } else if (att && att.kind === 'video') {
            mime = 'video/mp4'
          }
        }
        const blobPath = path.join(DATA_ROOT, 'sites', siteId, 'brigadier-blobs', reportId, attId)
        try {
          const buf = await fs.readFile(blobPath)
          setCors(res)
          res.statusCode = 200
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          res.end(buf)
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
            sendJson(res, 404, { error: 'blob_missing' })
          } else {
            throw e
          }
        }
        return
      }
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'sites' &&
      parts[2] &&
      parts[3] === 'object-media'
    ) {
      const siteId = safeSiteId(parts[2])
      if (!siteId) {
        sendJson(res, 400, { error: 'bad_site_id' })
        return
      }
      const baseDir = path.join(DATA_ROOT, 'sites', siteId, 'object-media')
      const manifestPath = path.join(baseDir, 'manifest.json')

      if (parts.length === 4 && req.method === 'GET') {
        const list = await readJsonArray(manifestPath)
        const valid = list.filter(isObjectMediaRecord)
        sendJson(res, 200, valid)
        return
      }

      if (parts.length === 6 && parts[5] === 'blob' && req.method === 'GET') {
        const mediaId = safeMediaId(parts[4])
        if (!mediaId) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(manifestPath)
        const meta = list.find((x) => isObjectMediaRecord(x) && /** @type {{id:string}} */ (x).id === mediaId)
        if (!meta) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        const blobPath = path.join(baseDir, 'blobs', mediaId)
        try {
          const buf = await fs.readFile(blobPath)
          setCors(res)
          res.statusCode = 200
          res.setHeader('Content-Type', /** @type {{mime:string}} */ (meta).mime || 'application/octet-stream')
          res.end(buf)
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
            sendJson(res, 404, { error: 'blob_missing' })
          } else {
            throw e
          }
        }
        return
      }

      if (parts.length === 4 && req.method === 'POST') {
        if (!checkWrite(req, res)) return
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'invalid_object_media' })
          return
        }
        const b = /** @type {Record<string, unknown>} */ (body)
        if (!isObjectMediaRecord(b.record) || typeof b.dataBase64 !== 'string') {
          sendJson(res, 400, { error: 'invalid_object_media' })
          return
        }
        const record = /** @type {{ id: string, siteId: string, kind: string, name: string, mime: string, sizeBytes: number, capturedAtIso: string, uploadedAtIso: string, authorCaption: string }} */ (
          b.record
        )
        if (record.siteId !== siteId) {
          sendJson(res, 400, { error: 'site_mismatch' })
          return
        }
        const buf = Buffer.from(b.dataBase64, 'base64')
        if (!buf.length && record.sizeBytes > 0) {
          sendJson(res, 400, { error: 'empty_payload' })
          return
        }
        const list = await readJsonArray(manifestPath)
        if (list.some((x) => isObjectMediaRecord(x) && /** @type {{id:string}} */ (x).id === record.id)) {
          sendJson(res, 200, { ok: true, duplicate: true })
          return
        }
        await fs.mkdir(path.join(baseDir, 'blobs'), { recursive: true })
        await fs.writeFile(path.join(baseDir, 'blobs', record.id), buf)
        list.unshift(record)
        await writeJsonArray(manifestPath, list)
        sendJson(res, 201, { ok: true })
        return
      }

      if (parts.length === 5 && req.method === 'DELETE') {
        if (!checkWrite(req, res)) return
        const mediaId = safeMediaId(parts[4])
        if (!mediaId) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(manifestPath)
        const next = list.filter(
          (x) => !isObjectMediaRecord(x) || /** @type {{id:string}} */ (x).id !== mediaId,
        )
        await writeJsonArray(manifestPath, next)
        const blobPath = path.join(baseDir, 'blobs', mediaId)
        try {
          await fs.unlink(blobPath)
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
        }
        sendJson(res, 200, { ok: true })
        return
      }
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (e) {
    if (/** @type {Error} */ (e).message === 'payload too large') {
      sendJson(res, 413, { error: 'payload_too_large' })
      return
    }
    if (e instanceof SyntaxError) {
      sendJson(res, 400, { error: 'invalid_json' })
      return
    }
    console.error(e)
    sendJson(res, 500, { error: 'internal' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`site-forms API http://0.0.0.0:${PORT}  data=${DATA_ROOT}`)
})
