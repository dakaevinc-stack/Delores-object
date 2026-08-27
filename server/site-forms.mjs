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
import {
  formatDriverTripNotifyText,
  namesMatchDriver,
} from '../src/lib/driverTripNotify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.DELORESH_SITE_FORMS_PORT || 8787) || 8787
const DATA_ROOT =
  process.env.DELORESH_SITE_FORMS_DATA?.trim() ||
  path.join(__dirname, '..', 'data', 'site-forms')
const WRITE_SECRET = (process.env.DELORESH_SITE_FORMS_WRITE_SECRET || '').trim()
const TG_BOT_TOKEN = (process.env.TG_BOT_TOKEN || '').trim()
const MAX_BODY_BYTES = 100 * 1024 * 1024
const DRIVER_BINDS_FILE = () => path.join(DATA_ROOT, 'driver-telegram-binds.json')

/** @type {string} */
let cachedBotUsername = (process.env.TG_BOT_USERNAME || '').trim()

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Deloresh-Write-Secret, X-Project-File-Record',
  )
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
  const buf = await readBodyBuffer(req)
  return buf.toString('utf8')
}

/** @param {import('node:http').IncomingMessage} req */
async function readBodyBuffer(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('payload too large')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** @param {unknown} raw */
function parseProjectFileRecordHeader(raw) {
  const s = String(raw)
  try {
    if (s.startsWith('b64.')) {
      return JSON.parse(Buffer.from(s.slice(4), 'base64').toString('utf8'))
    }
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * @param {string} baseDir
 * @param {string} manifestPath
 * @param {string} siteId
 * @param {{ id: string, siteId: string, kind: 'pdf'|'dwg'|'file', name: string, mime: string, sizeBytes: number, uploadedAtIso: string }} record
 * @param {Buffer} buf
 */
async function saveProjectFileMetadata(baseDir, manifestPath, siteId, record) {
  if (record.siteId !== siteId) throw new Error('site_mismatch')
  const list = await readJsonArray(manifestPath)
  const valid = list.filter(isProjectFileRecord)
  const next = [record, ...valid.filter((x) => /** @type {{id:string}} */ (x).id !== record.id)]
  await writeJsonArray(manifestPath, next)
}

async function saveProjectFileRecord(baseDir, manifestPath, siteId, record, buf) {
  if (record.siteId !== siteId) throw new Error('site_mismatch')
  if (!buf.length && record.sizeBytes > 0) throw new Error('empty_payload')
  await saveProjectFileMetadata(baseDir, manifestPath, siteId, record)
  await fs.mkdir(path.join(baseDir, 'blobs'), { recursive: true })
  await fs.writeFile(path.join(baseDir, 'blobs', record.id), buf)
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

/** @param {string} filePath @param {unknown} obj */
async function writeJsonFile(filePath, obj) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8')
}

/** @param {unknown} x */
function isDeliveryPointRow(x) {
  if (!x || typeof x !== 'object') return false
  const r = /** @type {Record<string, unknown>} */ (x)
  const lat = typeof r.lat === 'number' ? r.lat : Number(r.lat)
  const lng = typeof r.lng === 'number' ? r.lng : Number(r.lng)
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    typeof r.hint === 'string' &&
    typeof r.updatedAtIso === 'string'
  )
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

/** @param {unknown} x */
function isProjectFileRecord(x) {
  if (!x || typeof x !== 'object') return false
  const r = /** @type {Record<string, unknown>} */ (x)
  const kindOk =
    r.kind === 'pdf' || r.kind === 'dwg' || r.kind === 'file' || r.kind === 'folder'
  const parentOk =
    r.parentId === undefined || r.parentId === null || typeof r.parentId === 'string'
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    kindOk &&
    parentOk &&
    typeof r.name === 'string' &&
    typeof r.mime === 'string' &&
    typeof r.sizeBytes === 'number' &&
    typeof r.uploadedAtIso === 'string'
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

async function ensureBotUsername() {
  if (cachedBotUsername || !TG_BOT_TOKEN) return cachedBotUsername
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getMe`)
    const json = /** @type {{ ok?: boolean, result?: { username?: string } }} */ (await res.json())
    if (json.ok && json.result?.username) cachedBotUsername = json.result.username
  } catch {
    /* бот недоступен — кабинет просто без кнопки */
  }
  return cachedBotUsername
}

/** @returns {Promise<Array<{ driverName: string, chatId: string, telegramUsername?: string, boundAtIso: string }>>} */
async function readDriverBinds() {
  const list = await readJsonArray(DRIVER_BINDS_FILE())
  return list.filter(
    (x) =>
      x &&
      typeof x === 'object' &&
      typeof /** @type {{driverName?: unknown}} */ (x).driverName === 'string' &&
      typeof /** @type {{chatId?: unknown}} */ (x).chatId === 'string',
  )
}

/**
 * @param {string} driverName
 * @param {string} chatId
 * @param {string} [telegramUsername]
 */
async function upsertDriverBind(driverName, chatId, telegramUsername) {
  const name = driverName.trim()
  const id = String(chatId).trim()
  if (!name || !id) return null
  const prev = await readDriverBinds()
  const next = [
    {
      driverName: name,
      chatId: id,
      telegramUsername: telegramUsername?.trim() || '',
      boundAtIso: new Date().toISOString(),
    },
    ...prev.filter((b) => b.chatId !== id && !namesMatchDriver(b.driverName, name)),
  ]
  await writeJsonArray(DRIVER_BINDS_FILE(), next)
  return next[0]
}

/** @param {string} chatId */
async function removeDriverBindByChat(chatId) {
  const id = String(chatId).trim()
  const prev = await readDriverBinds()
  const next = prev.filter((b) => b.chatId !== id)
  await writeJsonArray(DRIVER_BINDS_FILE(), next)
  return prev.length !== next.length
}

/**
 * @param {unknown} trip
 * @returns {Promise<number>}
 */
async function notifyDriverTripTelegram(trip) {
  if (!TG_BOT_TOKEN) return 0
  if (!trip || typeof trip !== 'object') return 0
  const row = /** @type {Record<string, unknown>} */ (trip)
  const driverName = typeof row.driverName === 'string' ? row.driverName.trim() : ''
  if (!driverName) return 0
  const binds = await readDriverBinds()
  const targets = binds.filter((b) => namesMatchDriver(b.driverName, driverName))
  if (targets.length === 0) return 0
  const text = formatDriverTripNotifyText(row)
  let sent = 0
  for (const b of targets) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: b.chatId, text }),
      })
      if (res.ok) sent += 1
      else console.warn('telegram notify failed', b.chatId, await res.text())
    } catch (e) {
      console.warn('telegram notify error', b.chatId, e)
    }
  }
  return sent
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

    if (parts[0] === 'api' && parts[1] === 'geocode' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim()
      const lat = url.searchParams.get('lat')
      const lng = url.searchParams.get('lng')
      const nom = new URL('https://nominatim.openstreetmap.org/')
      nom.searchParams.set('format', 'jsonv2')
      nom.searchParams.set('accept-language', 'ru')
      nom.searchParams.set('addressdetails', '1')
      if (lat && lng) {
        nom.pathname = '/reverse'
        nom.searchParams.set('lat', lat)
        nom.searchParams.set('lon', lng)
      } else {
        if (q.length < 3) {
          sendJson(res, 200, { hits: [] })
          return
        }
        nom.pathname = '/search'
        nom.searchParams.set('q', q)
        nom.searchParams.set('limit', '6')
        nom.searchParams.set('countrycodes', 'ru')
      }
      const upstream = await fetch(nom.toString(), {
        headers: { 'User-Agent': 'Deloresh-Objects/1.0 (site-forms geocode)' },
      })
      if (!upstream.ok) {
        sendJson(res, 502, { error: 'geocode_upstream' })
        return
      }
      const data = await upstream.json()
      sendJson(res, 200, { data })
      return
    }

    if (parts[0] === 'api' && parts[1] === 'driver-trips' && parts.length === 2) {
      const file = path.join(DATA_ROOT, 'driver-trips.json')
      if (req.method === 'GET') {
        const list = await readJsonArray(file)
        sendJson(res, 200, list)
        return
      }
      if (req.method === 'POST') {
        if (!checkWrite(req, res)) return
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!body || typeof body !== 'object' || typeof body.id !== 'string') {
          sendJson(res, 400, { error: 'invalid_trip' })
          return
        }
        const list = await readJsonArray(file)
        const next = [body, ...list.filter((x) => !x || /** @type {{id?:unknown}} */ (x).id !== body.id)]
        await writeJsonArray(file, next)
        const telegram = await notifyDriverTripTelegram(body)
        sendJson(res, 200, { ok: true, notified: { telegram } })
        return
      }
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'driver-trips' &&
      parts.length === 4 &&
      parts[3] === 'seen' &&
      req.method === 'POST'
    ) {
      const id = parts[2]
      if (!id || id.includes('..')) {
        sendJson(res, 400, { error: 'bad_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'driver-trips.json')
      const list = await readJsonArray(file)
      const idx = list.findIndex((x) => x && /** @type {{id?:unknown}} */ (x).id === id)
      if (idx === -1) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      const row = /** @type {Record<string, unknown>} */ (list[idx] && typeof list[idx] === 'object' ? list[idx] : {})
      const already = typeof row.seenAtIso === 'string' && row.seenAtIso ? String(row.seenAtIso) : ''
      const seenAtIso = already || new Date().toISOString()
      list[idx] = { ...row, seenAtIso }
      await writeJsonArray(file, list)
      sendJson(res, 200, { ok: true, seenAtIso })
      return
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'driver-trips' &&
      parts.length === 4 &&
      parts[3] === 'complete' &&
      req.method === 'POST'
    ) {
      const id = parts[2]
      if (!id || id.includes('..')) {
        sendJson(res, 400, { error: 'bad_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'driver-trips.json')
      const list = await readJsonArray(file)
      const idx = list.findIndex((x) => x && /** @type {{id?:unknown}} */ (x).id === id)
      if (idx === -1) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      const row = /** @type {Record<string, unknown>} */ (list[idx] && typeof list[idx] === 'object' ? list[idx] : {})
      const alreadyDone =
        typeof row.completedAtIso === 'string' && row.completedAtIso ? String(row.completedAtIso) : ''
      const completedAtIso = alreadyDone || new Date().toISOString()
      const alreadySeen =
        typeof row.seenAtIso === 'string' && row.seenAtIso ? String(row.seenAtIso) : ''
      const seenAtIso = alreadySeen || completedAtIso
      list[idx] = { ...row, seenAtIso, completedAtIso }
      await writeJsonArray(file, list)
      sendJson(res, 200, { ok: true, seenAtIso, completedAtIso })
      return
    }

    if (parts[0] === 'api' && parts[1] === 'driver-notify' && parts[2] === 'config' && req.method === 'GET') {
      const botUsername = await ensureBotUsername()
      sendJson(res, 200, {
        telegramEnabled: Boolean(TG_BOT_TOKEN),
        botUsername: botUsername || '',
      })
      return
    }

    if (parts[0] === 'api' && parts[1] === 'driver-notify' && parts[2] === 'status' && req.method === 'GET') {
      const name = (url.searchParams.get('name') || '').trim()
      if (!name) {
        sendJson(res, 200, { bound: false })
        return
      }
      const binds = await readDriverBinds()
      sendJson(res, 200, { bound: binds.some((b) => namesMatchDriver(b.driverName, name)) })
      return
    }

    if (parts[0] === 'api' && parts[1] === 'driver-notify' && parts[2] === 'bind' && req.method === 'POST') {
      if (!checkWrite(req, res)) return
      const raw = await readBody(req)
      const body = JSON.parse(raw)
      const driverName = body && typeof body.driverName === 'string' ? body.driverName : ''
      const chatId =
        body && (typeof body.chatId === 'string' || typeof body.chatId === 'number')
          ? String(body.chatId)
          : ''
      const telegramUsername =
        body && typeof body.telegramUsername === 'string' ? body.telegramUsername : ''
      const saved = await upsertDriverBind(driverName, chatId, telegramUsername)
      if (!saved) {
        sendJson(res, 400, { error: 'invalid_bind' })
        return
      }
      sendJson(res, 200, { ok: true, bind: saved })
      return
    }

    if (parts[0] === 'api' && parts[1] === 'driver-notify' && parts[2] === 'unbind' && req.method === 'POST') {
      if (!checkWrite(req, res)) return
      const raw = await readBody(req)
      const body = JSON.parse(raw)
      const chatId =
        body && (typeof body.chatId === 'string' || typeof body.chatId === 'number')
          ? String(body.chatId)
          : ''
      if (!chatId) {
        sendJson(res, 400, { error: 'invalid_unbind' })
        return
      }
      const removed = await removeDriverBindByChat(chatId)
      sendJson(res, 200, { ok: true, removed })
      return
    }

    if (
      parts[0] === 'api' &&
      parts[1] === 'driver-trips' &&
      parts.length === 3 &&
      req.method === 'DELETE'
    ) {
      if (!checkWrite(req, res)) return
      const id = parts[2]
      if (!id || id.includes('..')) {
        sendJson(res, 400, { error: 'bad_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'driver-trips.json')
      const list = await readJsonArray(file)
      const next = list.filter((x) => !x || /** @type {{id?:unknown}} */ (x).id !== id)
      await writeJsonArray(file, next)
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
        const allowed = ['status', 'urgent', 'neededByIso', 'note', 'items', 'siteName', 'receipt', 'unloadPoint']
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
      // body: { id, name, mime, sizeBytes, dataBase64, kind?, registeredAtIso?, fileModifiedIso? }
      //
      // Пишет blob в brigadier-blobs/{reportId}/{attId} и (если переданы
      // метаданные `kind`+`name`) идемпотентно добавляет/обновляет запись
      // в `attachments[]` соответствующего отчёта в JSON. Идемпотентность
      // важна для импортных скриптов: повторный вызов с тем же `id` не
      // создаёт дубликат, а перезаписывает blob и метаданные.
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

        // Опциональное обновление метаданных. Старый клиент шлёт
        // только {id, dataBase64} — для него ничего не меняется.
        // Импортный скрипт шлёт все поля — добавляем/обновляем
        // запись в JSON отчёта.
        let metadataUpdated = false
        const kind = b.kind === 'photo' || b.kind === 'video' ? b.kind : null
        if (kind) {
          const list = await readJsonArray(file)
          let touched = false
          const next = list.map((row) => {
            if (!isBrigadierReportRow(row)) return row
            const r = /** @type {{ id: string; attachments: Array<Record<string, unknown>> }} */ (row)
            if (r.id !== reportId) return row
            const existing = r.attachments.findIndex(
              (a) => /** @type {{ id?: unknown }} */ (a).id === attId,
            )
            const meta = {
              id: attId,
              kind,
              name: typeof b.name === 'string' && b.name ? b.name : attId,
              previewUrl: '',
              registeredAtIso:
                typeof b.registeredAtIso === 'string' && b.registeredAtIso
                  ? b.registeredAtIso
                  : new Date().toISOString(),
              fileModifiedIso:
                typeof b.fileModifiedIso === 'string' && b.fileModifiedIso
                  ? b.fileModifiedIso
                  : new Date().toISOString(),
              mime:
                typeof b.mime === 'string' && b.mime
                  ? b.mime
                  : kind === 'photo'
                    ? 'image/jpeg'
                    : 'video/mp4',
              sizeBytes:
                typeof b.sizeBytes === 'number' && Number.isFinite(b.sizeBytes)
                  ? b.sizeBytes
                  : buf.length,
            }
            const nextAtt = [...r.attachments]
            if (existing >= 0) nextAtt[existing] = meta
            else nextAtt.push(meta)
            touched = true
            return { ...r, attachments: nextAtt }
          })
          if (touched) {
            await writeJsonArray(file, next)
            metadataUpdated = true
          }
        }
        sendJson(res, 201, { ok: true, metadataUpdated })
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
      parts[3] === 'delivery-point' &&
      parts.length === 4
    ) {
      const siteId = safeSiteId(parts[2])
      if (!siteId) {
        sendJson(res, 400, { error: 'bad_site_id' })
        return
      }
      const file = path.join(DATA_ROOT, 'sites', siteId, 'delivery-point.json')

      if (req.method === 'GET') {
        try {
          const raw = await fs.readFile(file, 'utf8')
          const parsed = JSON.parse(raw)
          sendJson(res, 200, { point: isDeliveryPointRow(parsed) ? parsed : null })
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
            sendJson(res, 200, { point: null })
            return
          }
          throw e
        }
        return
      }

      if (req.method === 'PUT') {
        if (!checkWrite(req, res)) return
        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!isDeliveryPointRow(body)) {
          sendJson(res, 400, { error: 'invalid_delivery_point' })
          return
        }
        await writeJsonFile(file, body)
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'DELETE') {
        if (!checkWrite(req, res)) return
        try {
          await fs.unlink(file)
        } catch (e) {
          if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
        }
        sendJson(res, 200, { ok: true })
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

    if (
      parts[0] === 'api' &&
      parts[1] === 'sites' &&
      parts[2] &&
      parts[3] === 'project-files'
    ) {
      const siteId = safeSiteId(parts[2])
      if (!siteId) {
        sendJson(res, 400, { error: 'bad_site_id' })
        return
      }
      const baseDir = path.join(DATA_ROOT, 'sites', siteId, 'project-files')
      const manifestPath = path.join(baseDir, 'manifest.json')

      if (parts.length === 4 && req.method === 'GET') {
        const list = await readJsonArray(manifestPath)
        const valid = list.filter(isProjectFileRecord)
        sendJson(res, 200, valid)
        return
      }

      if (parts.length === 6 && parts[5] === 'blob' && req.method === 'PUT') {
        if (!checkWrite(req, res)) return
        const fileId = safeMediaId(parts[4])
        if (!fileId) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(manifestPath)
        const meta = list.find((x) => isProjectFileRecord(x) && /** @type {{id:string}} */ (x).id === fileId)
        if (!meta) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        const buf = await readBodyBuffer(req)
        if (!buf.length) {
          sendJson(res, 400, { error: 'empty_payload' })
          return
        }
        await fs.mkdir(path.join(baseDir, 'blobs'), { recursive: true })
        await fs.writeFile(path.join(baseDir, 'blobs', fileId), buf)
        sendJson(res, 200, { ok: true })
        return
      }

      if (parts.length === 6 && parts[5] === 'blob' && req.method === 'GET') {
        const fileId = safeMediaId(parts[4])
        if (!fileId) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(manifestPath)
        const meta = list.find((x) => isProjectFileRecord(x) && /** @type {{id:string}} */ (x).id === fileId)
        if (!meta) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        const blobPath = path.join(baseDir, 'blobs', fileId)
        try {
          const buf = await fs.readFile(blobPath)
          setCors(res)
          res.statusCode = 200
          res.setHeader('Content-Type', /** @type {{mime:string}} */ (meta).mime || 'application/octet-stream')
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(/** @type {{name:string}} */ (meta).name)}"`)
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

        const recordHeader = req.headers['x-project-file-record']
        if (recordHeader) {
          const record = parseProjectFileRecordHeader(recordHeader)
          if (!isProjectFileRecord(record)) {
            sendJson(res, 400, { error: 'invalid_project_file' })
            return
          }
          const typedRecord = /** @type {{ id: string, siteId: string, kind: 'pdf'|'dwg', name: string, mime: string, sizeBytes: number, uploadedAtIso: string }} */ (
            record
          )
          const buf = await readBodyBuffer(req)
          try {
            await saveProjectFileRecord(baseDir, manifestPath, siteId, typedRecord, buf)
            sendJson(res, 201, { ok: true })
          } catch (e) {
            if (/** @type {Error} */ (e).message === 'site_mismatch') {
              sendJson(res, 400, { error: 'site_mismatch' })
            } else if (/** @type {Error} */ (e).message === 'empty_payload') {
              sendJson(res, 400, { error: 'empty_payload' })
            } else {
              throw e
            }
          }
          return
        }

        const raw = await readBody(req)
        const body = JSON.parse(raw)
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'invalid_project_file' })
          return
        }
        const b = /** @type {Record<string, unknown>} */ (body)
        if (isProjectFileRecord(b.record) && typeof b.dataBase64 !== 'string') {
          const record = /** @type {{ id: string, siteId: string, kind: 'pdf'|'dwg', name: string, mime: string, sizeBytes: number, uploadedAtIso: string }} */ (
            b.record
          )
          try {
            await saveProjectFileMetadata(baseDir, manifestPath, siteId, record)
            sendJson(res, 201, { ok: true })
          } catch (e) {
            if (/** @type {Error} */ (e).message === 'site_mismatch') {
              sendJson(res, 400, { error: 'site_mismatch' })
            } else {
              throw e
            }
          }
          return
        }
        if (!isProjectFileRecord(b.record) || typeof b.dataBase64 !== 'string') {
          sendJson(res, 400, { error: 'invalid_project_file' })
          return
        }
        const record = /** @type {{ id: string, siteId: string, kind: 'pdf'|'dwg', name: string, mime: string, sizeBytes: number, uploadedAtIso: string }} */ (b.record)
        const buf = Buffer.from(b.dataBase64, 'base64')
        try {
          await saveProjectFileRecord(baseDir, manifestPath, siteId, record, buf)
          sendJson(res, 201, { ok: true })
        } catch (e) {
          if (/** @type {Error} */ (e).message === 'site_mismatch') {
            sendJson(res, 400, { error: 'site_mismatch' })
          } else if (/** @type {Error} */ (e).message === 'empty_payload') {
            sendJson(res, 400, { error: 'empty_payload' })
          } else {
            throw e
          }
        }
        return
      }

      if (parts.length === 5 && req.method === 'DELETE') {
        if (!checkWrite(req, res)) return
        const fileId = safeMediaId(parts[4])
        if (!fileId) {
          sendJson(res, 400, { error: 'bad_id' })
          return
        }
        const list = await readJsonArray(manifestPath)
        const next = list.filter(
          (x) => !isProjectFileRecord(x) || /** @type {{id:string}} */ (x).id !== fileId,
        )
        await writeJsonArray(manifestPath, next)
        const blobPath = path.join(baseDir, 'blobs', fileId)
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
