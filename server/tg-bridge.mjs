/**
 * Мост Telegram-группа → site-forms API.
 *
 * 1. Long-polling от Telegram Bot API: getUpdates с timeout=25s
 *    (без webhook — проще ставить, не нужен HTTPS-домен и сертификат).
 * 2. Каждое полученное сообщение из группы прогоняем через парсер
 *    (см. src/lib/tgReportParser.mjs).
 * 3. Если это похоже на бригадирский отчёт — резолвим siteId по имени
 *    объекта в реестре приложения (см. src/lib/siteIdResolver.mjs).
 * 4. POST в site-forms API: /api/sites/<siteId>/brigadier-reports
 *    (тем же контрактом, что использует браузер).
 * 5. Если в сообщении были фото/видео — скачиваем через Telegram
 *    getFile, кладём в site-forms /api/sites/<siteId>/object-media
 *    как фотофиксацию объекта (отдельный поток, не attachments
 *    самого отчёта — потому что отчёт хранится JSON-ом, а большие
 *    бинари мы держим в каталоге object-media).
 *
 * offset (последний обработанный update_id) сохраняется на диск
 * в DELORESH_TG_BRIDGE_STATE — чтобы при рестарте сервис не задвоил
 * сообщения и не пропустил то, что пришло во время простоя (Telegram
 * хранит апдейты ~24 часа).
 *
 * Запуск: node server/tg-bridge.mjs
 *
 * Переменные окружения (см. /etc/deloresh/tg-bridge.env):
 *   TG_BOT_TOKEN           — токен от @BotFather (обязательно)
 *   TG_ALLOWED_CHAT_ID     — id группы/супергруппы, ОТКУДА слушаем
 *                            отчёты (можно несколько через запятую).
 *                            Если не задан — слушаем все группы, в
 *                            которые добавлен бот.
 *   SITE_FORMS_API_BASE    — URL site-forms API (по умолчанию
 *                            http://127.0.0.1:8787, тот же хост).
 *   SITE_FORMS_WRITE_SECRET — секрет записи (тот же, что встроен
 *                            в фронт во время сборки).
 *   DELORESH_TG_BRIDGE_STATE — файл состояния (по умолчанию
 *                            /var/lib/deloresh/site-forms/tg-bridge.json).
 *   SITES_REGISTRY_FILE    — путь к JSON-реестру объектов
 *                            [{id,name},…]. Если не задан — берём
 *                            из дефолтного места (см. ниже).
 *   TG_DOWNLOAD_MEDIA      — "1" чтобы качать фото/видео из ТГ и
 *                            отправлять их как фотофиксацию.
 *                            Пустое значение = отчёты только текстом.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBrigadierReportText,
  looksLikeBrigadierReport,
} from '../src/lib/tgReportParser.mjs'
import { resolveSiteId } from '../src/lib/siteIdResolver.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TOKEN = (process.env.TG_BOT_TOKEN || '').trim()
const ALLOWED_CHATS = new Set(
  (process.env.TG_ALLOWED_CHAT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
const API_BASE = (process.env.SITE_FORMS_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const WRITE_SECRET = (process.env.SITE_FORMS_WRITE_SECRET || '').trim()
const STATE_PATH =
  process.env.DELORESH_TG_BRIDGE_STATE?.trim() ||
  '/var/lib/deloresh/site-forms/tg-bridge.json'
const SITES_REGISTRY_FILE = process.env.SITES_REGISTRY_FILE?.trim() || ''
const DOWNLOAD_MEDIA = (process.env.TG_DOWNLOAD_MEDIA || '').trim() === '1'

const LONG_POLL_TIMEOUT_S = 25

if (!TOKEN) {
  console.error('TG_BOT_TOKEN is required (см. /etc/deloresh/tg-bridge.env).')
  process.exit(2)
}

const TG_API = `https://api.telegram.org/bot${TOKEN}`
const TG_FILE = `https://api.telegram.org/file/bot${TOKEN}`

/* ---------------------------- состояние ----------------------------- */

/**
 * @typedef {Object} BridgeState
 * @property {number} updateOffset Последний обработанный update_id + 1
 * @property {Record<string, string>} topicSiteIds Маппинг message_thread_id → siteId,
 *           который мы запоминаем при создании топика, чтобы не разбирать
 *           каждое последующее сообщение по тексту.
 */

/** @returns {Promise<BridgeState>} */
async function loadState() {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8')
    const j = JSON.parse(raw)
    return {
      updateOffset: Number(j.updateOffset) || 0,
      topicSiteIds: j.topicSiteIds && typeof j.topicSiteIds === 'object' ? j.topicSiteIds : {},
    }
  } catch (e) {
    if (e?.code === 'ENOENT') return { updateOffset: 0, topicSiteIds: {} }
    throw e
  }
}

/** @param {BridgeState} state */
async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true })
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

/* --------------------------- реестр объектов ------------------------- */

/** @returns {Promise<Array<{id:string, name:string}>>} */
async function loadSitesRegistry() {
  if (SITES_REGISTRY_FILE) {
    const raw = await fs.readFile(SITES_REGISTRY_FILE, 'utf8')
    const j = JSON.parse(raw)
    if (Array.isArray(j)) return j.filter((x) => x && x.id && x.name)
  }
  // Дефолт: статический реестр из репозитория. Парсим mock-файл, потому что
  // отдельного JSON у проекта пока нет; этот путь существует и в проде.
  const mockPath = path.join(__dirname, '..', 'src', 'data', 'constructionSites.mock.ts')
  try {
    const raw = await fs.readFile(mockPath, 'utf8')
    /** @type {Array<{id:string, name:string}>} */
    const sites = []
    const re = /id:\s*['\"]([^'\"]+)['\"][\s\S]{0,200}?name:\s*['\"]([^'\"]+)['\"]/g
    let m
    while ((m = re.exec(raw)) !== null) {
      sites.push({ id: m[1], name: m[2] })
    }
    return sites
  } catch (e) {
    console.warn('Не удалось загрузить реестр объектов из mock — резолв siteId работать не будет:', e?.message)
    return []
  }
}

/* -------------------------- Telegram fetch helpers ------------------- */

/**
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 */
async function tgCall(method, params = {}) {
  const url = `${TG_API}/${method}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    throw new Error(`TG ${method} HTTP ${res.status}: ${await res.text()}`)
  }
  const j = await res.json()
  if (!j.ok) {
    throw new Error(`TG ${method} not ok: ${JSON.stringify(j)}`)
  }
  return j.result
}

/* -------------------------- site-forms POST -------------------------- */

/**
 * @param {string} pathname
 * @param {object} body
 */
async function siteFormsPost(pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(WRITE_SECRET ? { 'X-Deloresh-Write-Secret': WRITE_SECRET } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `site-forms POST ${pathname} HTTP ${res.status}: ${await res.text()}`,
    )
  }
  return res.json()
}

/* ---------------------- сборка отчёта в формат API -------------------- */

/**
 * @param {ReturnType<typeof parseBrigadierReportText>} parsed
 * @param {string} siteId
 * @param {Object} extras
 * @param {string} extras.id
 */
function buildBrigadierStoredReport(parsed, siteId, { id }) {
  if (!parsed) throw new Error('parsed is null')
  const resourcesNote = []
  if (parsed.resources.itr != null) resourcesNote.push(`ИТР: ${parsed.resources.itr}`)
  if (parsed.resources.workers != null) resourcesNote.push(`Рабочих: ${parsed.resources.workers}`)
  if (parsed.resources.equipment != null) resourcesNote.push(`Техники: ${parsed.resources.equipment}`)

  const lines = parsed.workLines.map((text, i) => ({ index: i + 1, text }))

  const comment = [
    parsed.comment,
    resourcesNote.length ? `\nРесурсы: ${resourcesNote.join(', ')}` : '',
    `\n[источник: Telegram]`,
  ].join('').trim()

  return {
    id,
    siteId,
    reportedAtIso: parsed.reportedAtIso,
    lines,
    problems: [],
    responsible: parsed.responsible,
    comment,
    attachments: [],
  }
}

/* -------------------------- обработка сообщения ---------------------- */

/**
 * @param {any} message Telegram Message object
 * @param {ReturnType<typeof loadSitesRegistry> extends Promise<infer T> ? T : never} sites
 * @param {BridgeState} state
 */
async function handleMessage(message, sites, state) {
  if (!message || typeof message !== 'object') return
  const chatId = message.chat?.id?.toString()
  if (!chatId) return
  if (ALLOWED_CHATS.size > 0 && !ALLOWED_CHATS.has(chatId)) {
    // Сообщение из чата, который мы не слушаем — игнор
    return
  }

  // Отдельный кейс: создан новый топик в форум-группе.
  // Запоминаем mapping: thread_id ↔ имя топика (которое подскажет siteId).
  if (message.forum_topic_created) {
    const threadId = message.message_thread_id?.toString()
    const topicName = message.forum_topic_created.name
    if (threadId && topicName) {
      const siteId = resolveSiteId(topicName, sites)
      if (siteId) {
        state.topicSiteIds[threadId] = siteId
        console.log(`▸ топик #${threadId} «${topicName}» → siteId=${siteId}`)
        await saveState(state)
      } else {
        console.log(`! топик «${topicName}» не сопоставлен ни с одним объектом`)
      }
    }
    return
  }

  const text = String(message.text ?? message.caption ?? '')
  if (!looksLikeBrigadierReport(text)) return

  const responsible =
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ').trim() ||
    message.from?.username ||
    'Telegram'

  const reportedAtIso = new Date(((message.date ?? 0) | 0) * 1000).toISOString()
  const sourceMessageId = `${chatId}:${message.message_id}`

  const parsed = parseBrigadierReportText(text, {
    responsible,
    reportedAtIso,
    sourceMessageId,
  })
  if (!parsed) return

  // siteId: сначала по топику, иначе по тексту «Объект: …».
  const threadId = message.message_thread_id?.toString()
  const siteIdFromTopic = threadId ? state.topicSiteIds[threadId] : null
  const siteId =
    siteIdFromTopic || resolveSiteId(parsed.siteName, sites)

  if (!siteId) {
    console.warn(
      `! не удалось сопоставить «${parsed.siteName}» с объектом, сообщение ${sourceMessageId} пропущено`,
    )
    return
  }

  const id = `tg-${chatId.replace(/^-?/, '')}-${message.message_id}`

  const stored = buildBrigadierStoredReport(parsed, siteId, { id })

  try {
    const r = await siteFormsPost(
      `/api/sites/${encodeURIComponent(siteId)}/brigadier-reports`,
      stored,
    )
    if (r.duplicate) {
      console.log(`= дубль ${id} (siteId=${siteId})`)
    } else {
      console.log(`+ отчёт ${id} → siteId=${siteId} (${stored.lines.length} стр.)`)
    }
  } catch (e) {
    console.error(`✖ POST отчёта ${id} провалился: ${e?.message ?? e}`)
  }

  if (DOWNLOAD_MEDIA) {
    await maybeUploadMedia(message, siteId)
  }
}

/* -------------------------- скачивание медиа ------------------------- */

/**
 * @param {any} message
 * @param {string} siteId
 */
async function maybeUploadMedia(message, siteId) {
  const mediaCandidates = []
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    // Берём самый большой размер (последний в массиве — Telegram отдаёт по возрастанию).
    const last = message.photo[message.photo.length - 1]
    mediaCandidates.push({ kind: 'photo', file_id: last.file_id, name: 'photo.jpg', mime: 'image/jpeg' })
  }
  if (message.video) {
    mediaCandidates.push({
      kind: 'video',
      file_id: message.video.file_id,
      name: message.video.file_name || 'video.mp4',
      mime: message.video.mime_type || 'video/mp4',
    })
  }
  for (const m of mediaCandidates) {
    try {
      const file = await tgCall('getFile', { file_id: m.file_id })
      const fileRes = await fetch(`${TG_FILE}/${file.file_path}`)
      if (!fileRes.ok) throw new Error(`getFile ${fileRes.status}`)
      const arr = new Uint8Array(await fileRes.arrayBuffer())
      const dataBase64 = Buffer.from(arr).toString('base64')
      const id = `tg-media-${message.chat.id}-${message.message_id}-${m.kind}`
      const record = {
        id,
        siteId,
        kind: m.kind,
        name: m.name,
        mime: m.mime,
        sizeBytes: arr.length,
        capturedAtIso: new Date(((message.date ?? 0) | 0) * 1000).toISOString(),
        uploadedAtIso: new Date().toISOString(),
        authorCaption:
          message.from?.first_name ||
          message.from?.username ||
          'Telegram',
      }
      await siteFormsPost(`/api/sites/${encodeURIComponent(siteId)}/object-media`, {
        record,
        dataBase64,
      })
      console.log(`+ медиа ${id} (${(arr.length / 1024 / 1024).toFixed(1)}МБ)`)
    } catch (e) {
      console.error(`✖ медиа ${m.kind} ${m.file_id}: ${e?.message ?? e}`)
    }
  }
}

/* -------------------------- main loop -------------------------------- */

async function main() {
  const sites = await loadSitesRegistry()
  console.log(`✓ реестр: ${sites.length} объектов`)
  if (sites.length === 0) {
    console.warn('! реестр пуст — резолв siteId работать не будет')
  }

  let state = await loadState()
  console.log(`✓ старт с offset=${state.updateOffset}, известных топиков: ${Object.keys(state.topicSiteIds).length}`)

  // graceful shutdown
  let stopping = false
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`\n▸ получил ${sig}, останавливаюсь...`)
      stopping = true
    })
  }

  // Подтверждаем, что бот валидный — ругнёмся на старте, а не в первом апдейте.
  const me = await tgCall('getMe')
  console.log(`✓ бот: @${me.username} (${me.first_name})`)

  while (!stopping) {
    try {
      const updates = await tgCall('getUpdates', {
        offset: state.updateOffset,
        timeout: LONG_POLL_TIMEOUT_S,
        allowed_updates: ['message', 'edited_message', 'channel_post'],
      })
      if (!Array.isArray(updates) || updates.length === 0) continue

      for (const upd of updates) {
        try {
          const msg = upd.message || upd.edited_message || upd.channel_post
          if (msg) await handleMessage(msg, sites, state)
        } catch (e) {
          console.error('обработка update', upd.update_id, 'провалилась:', e?.message ?? e)
        }
        if (typeof upd.update_id === 'number') {
          state.updateOffset = Math.max(state.updateOffset, upd.update_id + 1)
        }
      }
      await saveState(state)
    } catch (e) {
      console.error('long-poll error:', e?.message ?? e)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  console.log('▸ остановлено')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
