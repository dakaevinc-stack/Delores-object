#!/usr/bin/env node
/**
 * Прикрепляет медиа-файлы (фото/видео) к существующим отчётам бригадира
 * на сервере. Идемпотентно: повторный запуск с тем же набором файлов
 * перезапишет blob и метаданные, дубликат в `attachments[]` не появится
 * (см. POST /attachments в server/site-forms.mjs).
 *
 * Источник — папки вида `scripts/data/photo-imports/{siteId}/{YYYY-MM-DD}/`.
 * Для каждой даты скрипт находит на сервере отчёт того же объекта,
 * чей `reportedAtIso` приходится на эту календарную дату (UTC), и
 * прикрепляет к нему все файлы из папки.
 *
 * Внутри одной даты порядок прикрепления — алфавитный по имени файла,
 * чтобы превью в карточке отчёта шло предсказуемо (IMG_001, IMG_002…).
 *
 * Запуск (на сервере, где есть `/etc/deloresh/site-forms.env`):
 *
 *   set -a; . /etc/deloresh/site-forms.env; set +a
 *   node scripts/attach-report-media.mjs                     # все объекты, все даты
 *   node scripts/attach-report-media.mjs brusilova           # только один объект
 *   node scripts/attach-report-media.mjs brusilova 2026-04-29 # объект + конкретная дата
 *
 * MIME и kind определяются по расширению. Поддерживаются:
 *   фото:  .jpg .jpeg .png .heic .heif .webp .gif
 *   видео: .mp4 .mov .m4v .webm
 *
 * Имена файлов на сервере используются как `attachment.id` —
 * потому требование `^[a-zA-Z0-9._-]+$`. Пробелы и кириллицу скрипт
 * заменяет на `_` и логирует исходное имя в `attachment.name`.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'

const SECRET =
  process.env.DELORESH_SITE_FORMS_WRITE_SECRET ||
  process.env.VITE_SITE_FORMS_WRITE_SECRET ||
  ''

if (!SECRET) {
  console.error(
    'Не найден DELORESH_SITE_FORMS_WRITE_SECRET (или VITE_SITE_FORMS_WRITE_SECRET) в окружении.',
  )
  console.error(
    'На боевом: `set -a; . /etc/deloresh/site-forms.env; set +a; node scripts/attach-report-media.mjs`',
  )
  process.exit(2)
}

const API = (process.env.DELORESH_SITE_FORMS_API || 'http://127.0.0.1:8787').replace(
  /\/+$/,
  '',
)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, 'data', 'photo-imports')

const argSiteId = process.argv[2] || null
const argDate = process.argv[3] || null

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm'])
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
}

/** Превращает любое имя файла в безопасный attachment.id. */
function safeAttId(rawName) {
  const base = path.basename(rawName)
  const sanitized = base.replace(/[^a-zA-Z0-9._-]+/g, '_')
  // Гарантия уникальности: префикс из 8 hex (sha1 от полного имени).
  // Без него два разных файла «фото 1.jpg» и «Фото 1.jpg» дали бы
  // одинаковый id → второй переписал бы первый.
  const hash = crypto.createHash('sha1').update(rawName).digest('hex').slice(0, 8)
  return `${hash}-${sanitized}`
}

function classify(name) {
  const ext = path.extname(name).toLowerCase()
  if (PHOTO_EXTS.has(ext)) return { kind: 'photo', mime: MIME[ext] }
  if (VIDEO_EXTS.has(ext)) return { kind: 'video', mime: MIME[ext] }
  return null
}

/**
 * Календарная UTC-дата ISO-метки. Совпадает с тем, как формируются
 * `reportedAtIso` в `scripts/data/telegram-imports/*.json` (UTC).
 */
function utcDateOf(iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function listSites() {
  const entries = await readdir(ROOT, { withFileTypes: true }).catch((err) => {
    if (err && err.code === 'ENOENT') return []
    throw err
  })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function listDates(siteId) {
  const dir = path.join(ROOT, siteId)
  const entries = await readdir(dir, { withFileTypes: true }).catch((err) => {
    if (err && err.code === 'ENOENT') return []
    throw err
  })
  return entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
}

async function listFiles(siteId, date) {
  const dir = path.join(ROOT, siteId, date)
  const entries = await readdir(dir).catch((err) => {
    if (err && err.code === 'ENOENT') return []
    throw err
  })
  return entries.filter((f) => !f.startsWith('.')).sort()
}

async function fetchReports(siteId) {
  const url = `${API}/api/sites/${encodeURIComponent(siteId)}/brigadier-reports`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status}`)
  }
  return res.json()
}

async function postAttachment(siteId, reportId, payload) {
  const url = `${API}/api/sites/${encodeURIComponent(siteId)}/brigadier-reports/${encodeURIComponent(reportId)}/attachments`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Deloresh-Write-Secret': SECRET,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return body
}

const sitesToProcess = argSiteId ? [argSiteId] : await listSites()
if (sitesToProcess.length === 0) {
  console.log(`Нет папок в ${ROOT} — нечего загружать.`)
  process.exit(0)
}

let attached = 0
let skipped = 0
let failed = 0
const failures = []

for (const siteId of sitesToProcess) {
  const dates = argDate ? [argDate] : await listDates(siteId)
  if (dates.length === 0) {
    console.log(`— ${siteId}: нет подкаталогов с датой, пропускаем`)
    continue
  }

  let reports
  try {
    reports = await fetchReports(siteId)
  } catch (err) {
    console.error(`✗ ${siteId}: не удалось получить список отчётов — ${err.message}`)
    failed += 1
    failures.push({ siteId, error: err.message })
    continue
  }

  for (const date of dates) {
    const files = await listFiles(siteId, date)
    if (files.length === 0) {
      console.log(`  · ${siteId} ${date}: папка пуста`)
      continue
    }

    const matching = reports.filter((r) => utcDateOf(r.reportedAtIso) === date)
    if (matching.length === 0) {
      console.error(
        `  ✗ ${siteId} ${date}: отчёта на эту дату нет — пропускаем ${files.length} файл(а/ов)`,
      )
      failed += files.length
      failures.push({ siteId, date, error: 'no-report-for-date' })
      continue
    }
    if (matching.length > 1) {
      console.error(
        `  ✗ ${siteId} ${date}: несколько отчётов (${matching.length}) — нужна точная привязка, скрипт пока умеет только 1-к-1`,
      )
      failed += files.length
      failures.push({ siteId, date, error: 'multiple-reports' })
      continue
    }
    const report = matching[0]

    console.log(
      `\n— ${siteId} ${date} → reportId=${report.id}: ${files.length} файл(а/ов)`,
    )

    for (const fname of files) {
      const cls = classify(fname)
      if (!cls) {
        console.error(`  · пропускаем ${fname}: незнакомое расширение`)
        skipped += 1
        continue
      }
      const full = path.join(ROOT, siteId, date, fname)
      let buf
      let st
      try {
        buf = await readFile(full)
        st = await stat(full)
      } catch (err) {
        console.error(`  ✗ ${fname}: не удалось прочитать — ${err.message}`)
        failed += 1
        failures.push({ siteId, date, file: fname, error: err.message })
        continue
      }

      const attId = safeAttId(fname)
      const dataBase64 = buf.toString('base64')
      const payload = {
        id: attId,
        kind: cls.kind,
        name: fname,
        mime: cls.mime,
        sizeBytes: st.size,
        registeredAtIso: report.reportedAtIso,
        fileModifiedIso: st.mtime.toISOString(),
        dataBase64,
      }
      try {
        await postAttachment(siteId, report.id, payload)
        attached += 1
        const sizeMb = (st.size / 1024 / 1024).toFixed(1)
        console.log(`  ✓ ${cls.kind} · ${fname} (${sizeMb} МБ)`)
      } catch (err) {
        failed += 1
        failures.push({ siteId, date, file: fname, error: err.message })
        console.error(`  ✗ ${fname}: ${err.message}`)
      }
    }
  }
}

console.log(
  `\nИтого: прицеплено ${attached}, пропущено ${skipped}, ошибок ${failed}`,
)

if (failed > 0) {
  console.error('\nОшибки:')
  for (const f of failures) console.error(JSON.stringify(f))
  process.exit(1)
}
