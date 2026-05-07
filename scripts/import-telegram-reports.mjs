#!/usr/bin/env node
/**
 * Загружает заранее подготовленные отчёты бригадиров (на базе сообщений
 * из Telegram-чата) в наш бэкенд через тот же API, что и форма отчёта.
 *
 * Источник — все *.json в `scripts/data/telegram-imports/`. Каждый файл
 * — массив `BrigadierStoredReport`. Скрипт идемпотентен: сервер сам
 * отбрасывает дубликаты по `id` (см. server/site-forms.mjs), повторный
 * запуск ничего не задвоит.
 *
 * Как запускать (на сервере, где лежит `/etc/deloresh/site-forms.env`
 * с секретом):
 *
 *   set -a; . /etc/deloresh/site-forms.env; set +a
 *   node scripts/import-telegram-reports.mjs
 *
 * Или с явными переменными:
 *
 *   DELORESH_SITE_FORMS_WRITE_SECRET=xxx \
 *   DELORESH_SITE_FORMS_API=http://127.0.0.1:8787 \
 *   node scripts/import-telegram-reports.mjs
 *
 * По умолчанию ходит на `http://127.0.0.1:8787` (как локальный сервис
 * за nginx) — это работает прямо на боевом сервере.
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SECRET =
  process.env.DELORESH_SITE_FORMS_WRITE_SECRET ||
  process.env.VITE_SITE_FORMS_WRITE_SECRET ||
  ''

if (!SECRET) {
  console.error(
    'Не найден DELORESH_SITE_FORMS_WRITE_SECRET (или VITE_SITE_FORMS_WRITE_SECRET) в окружении.',
  )
  console.error(
    'На боевом: `set -a; . /etc/deloresh/site-forms.env; set +a; node scripts/import-telegram-reports.mjs`',
  )
  process.exit(2)
}

const API = (process.env.DELORESH_SITE_FORMS_API || 'http://127.0.0.1:8787').replace(
  /\/+$/,
  '',
)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIR = path.join(__dirname, 'data', 'telegram-imports')

let entries
try {
  entries = await readdir(DIR)
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.log(`Папка ${DIR} не существует — нечего импортировать.`)
    process.exit(0)
  }
  throw err
}

const files = entries.filter((f) => f.endsWith('.json')).sort()
if (files.length === 0) {
  console.log(`Нет .json в ${DIR} — нечего импортировать.`)
  process.exit(0)
}

console.log(`Импорт из ${DIR} → ${API}`)
console.log(`Файлов: ${files.length}`)

let created = 0
let duplicate = 0
let failed = 0
const failures = []

for (const file of files) {
  const full = path.join(DIR, file)
  let reports
  try {
    reports = JSON.parse(await readFile(full, 'utf8'))
  } catch (err) {
    console.error(`✗ ${file}: не валидный JSON — ${err.message}`)
    failed += 1
    failures.push({ file, error: err.message })
    continue
  }

  if (!Array.isArray(reports)) {
    console.error(`✗ ${file}: ожидался массив отчётов`)
    failed += 1
    failures.push({ file, error: 'not-an-array' })
    continue
  }

  console.log(`\n— ${file}: ${reports.length} отчёт(ов)`)
  for (const r of reports) {
    if (!r || typeof r !== 'object' || typeof r.siteId !== 'string' || typeof r.id !== 'string') {
      console.error(`  ✗ пропускаем — нет id/siteId`)
      failed += 1
      failures.push({ file, error: 'missing id/siteId' })
      continue
    }
    const url = `${API}/api/sites/${encodeURIComponent(r.siteId)}/brigadier-reports`
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Deloresh-Write-Secret': SECRET,
        },
        body: JSON.stringify(r),
      })
    } catch (err) {
      console.error(`  ✗ ${r.id}: ${err.message}`)
      failed += 1
      failures.push({ file, id: r.id, error: err.message })
      continue
    }

    let body = ''
    try {
      body = await res.text()
    } catch {
      body = ''
    }

    if (res.status === 201) {
      created += 1
      console.log(`  ✓ ${r.id} создан (${r.reportedAtIso})`)
    } else if (res.status === 200) {
      // сервер отвечает {ok:true, duplicate:true} при повторе
      duplicate += 1
      console.log(`  = ${r.id} уже есть, пропустили`)
    } else {
      failed += 1
      failures.push({ file, id: r.id, status: res.status, body })
      console.error(`  ✗ ${r.id} → HTTP ${res.status} ${body.slice(0, 200)}`)
    }
  }
}

console.log(
  `\nИтого: создано ${created}, дублей ${duplicate}, ошибок ${failed} из ${created + duplicate + failed}`,
)

if (failed > 0) {
  console.error('\nОшибки:')
  for (const f of failures) {
    console.error(JSON.stringify(f))
  }
  process.exit(1)
}
