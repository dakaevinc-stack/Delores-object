#!/usr/bin/env node
/**
 * Живой аудит API + кросс-device сценарий задач.
 * Пароли только с сервера через SSH (не печатаем).
 *
 *   node scripts/live-audit-smoke.mjs
 *   DELORESH_URL=http://94.242.58.24 node scripts/live-audit-smoke.mjs
 */
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const BASE = (process.env.DELORESH_URL || 'http://94.242.58.24').replace(/\/$/, '')
const SSH = process.env.DELORESH_SSH || 'root@94.242.58.24'

/** @type {{ok: string[], warn: string[], fail: string[]}} */
const report = { ok: [], warn: [], fail: [] }

function pass(msg) {
  report.ok.push(msg)
  console.log(`  ✓ ${msg}`)
}
function warn(msg) {
  report.warn.push(msg)
  console.log(`  ! ${msg}`)
}
function fail(msg) {
  report.fail.push(msg)
  console.log(`  ✖ ${msg}`)
}

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body, text }
}

function sshPy(code) {
  const b64 = Buffer.from(code, 'utf8').toString('base64')
  return execSync(
    `ssh -o ConnectTimeout=12 ${SSH} "echo ${b64} | base64 -d | python3"`,
    { encoding: 'utf8', maxBuffer: 2_000_000 },
  ).trim()
}

function getPassword(login) {
  const safe = String(login).replace(/[^A-Za-z0-9._-]/g, '')
  const code = [
    'import re',
    "t=open('/home/deploy/Delores-object/server/staff-passwords.mjs').read()",
    `m=re.search(r"${safe}:\\s*'([^']+)'", t)`,
    "print(m.group(1) if m else '')",
  ].join('\n')
  return sshPy(code)
}

async function main() {
  console.log(`\n=== Live audit ${BASE} ===\n`)

  // 1. Health / front / SW
  console.log('1) Surface')
  {
    const h = await json('/api/health')
    if (h.res.ok && h.body?.ok) pass('GET /api/health')
    else fail(`GET /api/health → ${h.res.status}`)

    const home = await fetch(`${BASE}/`)
    if (home.ok) pass('GET /')
    else fail(`GET / → ${home.status}`)

    const sw = await fetch(`${BASE}/sw.js`)
    const swText = await sw.text()
    if (sw.ok && /deloresh-shell-v\d+/.test(swText)) {
      const ver = swText.match(/deloresh-shell-(v\d+)/)?.[1]
      pass(`sw.js ${ver}`)
    } else fail('sw.js missing/broken')

    const brand = await fetch(`${BASE}/brand-mark.png`)
    if (brand.ok) pass('brand-mark.png')
    else warn(`brand-mark.png → ${brand.status}`)
  }

  // 2. Bundle hygiene
  console.log('\n2) Bundle hygiene (no passwords in JS)')
  {
    const out = sshPy(`
from pathlib import Path
import re
p = Path('/var/www/delores-object/assets')
pw_file = Path('/home/deploy/Delores-object/server/staff-passwords.mjs')
needles = []
if pw_file.exists():
    text = pw_file.read_text(errors='ignore')
    m = re.search(r'export const STAFF_PASSWORDS\\s*=\\s*\\{([\\s\\S]*?)\\n\\}', text)
    block = m.group(1) if m else ''
    needles = re.findall(r":\\s*'([^']+)'", block)
    needles = [n for n in needles if len(n) >= 6][:60]
passwords = []
t_all = ''
for f in p.glob('*.js'):
    t = f.read_text(errors='ignore')
    t_all += t
    for needle in needles:
        if needle in t:
            passwords.append(f'{f.name}:leak')
print('PASS_LEAKS=' + (','.join(passwords) if passwords else 'none'))
print('HAS_8501=' + ('yes' if '8501' in t_all else 'no'))
print('HAS_STREAMLIT_HINT=' + ('yes' if ('Streamlit' in t_all or 'не подключена' in t_all or 'Приёмка' in t_all) else 'no'))
print('HAS_WRITE_SECRET=' + ('yes' if 'd990329fdd717ffe' in t_all else 'no'))
`)
    for (const line of out.split('\n')) {
      if (line.startsWith('PASS_LEAKS=')) {
        const v = line.slice('PASS_LEAKS='.length)
        if (v === 'none') pass('passwords not in client JS')
        else fail(`passwords leaked in JS: ${v}`)
      } else if (line.startsWith('HAS_8501=')) {
        if (line.endsWith('yes')) pass('inspection URL (8501) in bundle')
        else warn('inspection URL 8501 NOT in bundle — card may show unavailable')
      } else if (line.startsWith('HAS_WRITE_SECRET=')) {
        if (line.endsWith('yes')) fail('write secret still baked into client JS')
        else pass('write secret not in client JS')
      }
    }
  }

  // 3. Streamlit
  console.log('\n3) Приёмка (Streamlit :8501)')
  {
    try {
      const r = await fetch('http://94.242.58.24:8501/', { signal: AbortSignal.timeout(5000) })
      if (r.ok || r.status === 200) pass(`Streamlit responds ${r.status}`)
      else warn(`Streamlit status ${r.status}`)
    } catch (e) {
      fail(`Streamlit unreachable: ${e instanceof Error ? e.message : e}`)
    }
  }

  // 4. Auth + cross-device tasks
  console.log('\n4) Auth + tasks cross-device')
  const passIsaev = getPassword('Isaev')
  const passGev = getPassword('Gevenyan')
  if (!passIsaev || !passGev) {
    fail('could not read test passwords from server file')
  } else {
    const loginA = await json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'Isaev', password: passIsaev }),
    })
    const loginB = await json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'Gevenyan', password: passGev }),
    })
    if (loginA.res.ok && loginA.body?.token) pass('login Isaev (device A)')
    else fail(`login Isaev → ${loginA.res.status}`)
    if (loginB.res.ok && loginB.body?.token) pass('login Gevenyan (device B)')
    else fail(`login Gevenyan → ${loginB.res.status}`)

    const bad = await json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'Isaev', password: 'wrong' }),
    })
    if (bad.res.status === 401 || bad.res.status === 403 || !bad.res.ok) pass('bad password rejected')
    else fail('bad password accepted')

    const noAuth = await json('/api/staff-tasks')
    if (noAuth.res.status === 401) pass('GET staff-tasks without token → 401')
    else fail(`GET staff-tasks without token → ${noAuth.res.status}`)

    if (loginA.body?.token && loginB.body?.token) {
      const tokenA = loginA.body.token
      const tokenB = loginB.body.token
      const hdrA = {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      }
      const hdrB = {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      }

      const taskId = `task-audit-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
      const now = new Date().toISOString()
      const due = now.slice(0, 10)
      const task = {
        id: taskId,
        title: 'Аудит кросс-device',
        body: 'smoke',
        dueDate: due,
        dueTime: '18:00',
        status: 'new',
        assigneeLogin: 'Gevenyan',
        assigneeName: 'Гевенян',
        creatorLogin: 'Isaev',
        creatorName: 'Исаев',
        siteId: null,
        siteName: null,
        attachments: [],
        comments: [],
        createdAtIso: now,
        updatedAtIso: now,
        seenByAssignee: false,
      }

      const create = await json('/api/staff-tasks', {
        method: 'POST',
        headers: hdrA,
        body: JSON.stringify(task),
      })
      if (create.res.ok) pass('device A creates task')
      else fail(`create task → ${create.res.status} ${JSON.stringify(create.body)}`)

      const listB = await json('/api/staff-tasks', { headers: hdrB })
      const foundB = Array.isArray(listB.body) && listB.body.some((t) => t.id === taskId)
      if (foundB) pass('device B sees task from A')
      else fail('device B does not see task')

      // blob upload as A
      const blobId = `blob-${randomBytes(8).toString('hex')}`
      const tinyPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      )
      const up = await json('/api/staff-tasks/blobs', {
        method: 'POST',
        headers: hdrA,
        body: JSON.stringify({
          id: blobId,
          mime: 'image/png',
          name: 'dot.png',
          dataBase64: tinyPng.toString('base64'),
        }),
      })
      if (up.res.ok && up.body?.url) pass('upload staff-task blob')
      else fail(`blob upload → ${up.res.status}`)

      const blobGet = await fetch(`${BASE}${up.body.url}`, { headers: { Authorization: `Bearer ${tokenB}` } })
      if (blobGet.ok) pass('device B downloads blob with auth')
      else fail(`blob GET → ${blobGet.status}`)

      const blobNo = await fetch(`${BASE}${up.body.url}`)
      if (blobNo.status === 401) pass('blob without auth → 401')
      else warn(`blob without auth → ${blobNo.status}`)

      // comment from B
      const withComment = {
        ...task,
        updatedAtIso: new Date().toISOString(),
        comments: [
          {
            id: `c-${randomBytes(4).toString('hex')}`,
            authorLogin: 'Gevenyan',
            authorName: 'Гевенян',
            text: 'принял с устройства B',
            createdAtIso: new Date().toISOString(),
          },
        ],
      }
      const commentRes = await json('/api/staff-tasks', {
        method: 'POST',
        headers: hdrB,
        body: JSON.stringify(withComment),
      })
      if (commentRes.res.ok) pass('device B posts comment')
      else fail(`comment → ${commentRes.res.status}`)

      const listA = await json('/api/staff-tasks', { headers: hdrA })
      const rowA = Array.isArray(listA.body) && listA.body.find((t) => t.id === taskId)
      if (rowA?.comments?.some((c) => c.text?.includes('устройства B'))) pass('device A sees B comment (merge)')
      else fail('comment merge failed on device A')

      // seen
      const seen = await json(`/api/staff-tasks/${encodeURIComponent(taskId)}/seen`, {
        method: 'POST',
        headers: hdrB,
      })
      if (seen.res.ok) pass('device B marks seen')
      else fail(`seen → ${seen.res.status}`)

      // delete as creator A
      const del = await json(`/api/staff-tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: hdrA,
      })
      if (del.res.ok) pass('device A deletes task')
      else fail(`delete → ${del.res.status} ${JSON.stringify(del.body)}`)

      const listB2 = await json('/api/staff-tasks', { headers: hdrB })
      const gone =
        Array.isArray(listB2.body) &&
        listB2.body.some((t) => t.id === taskId && t.deletedAtIso)
      const hidden =
        Array.isArray(listB2.body) && !listB2.body.some((t) => t.id === taskId && !t.deletedAtIso)
      if (gone || hidden) pass('tombstone visible / task soft-deleted for B')
      else fail('delete not visible to device B')

      // assignee cannot delete
      const task2 = {
        ...task,
        id: `task-audit-${Date.now().toString(36)}-x`,
        deletedAtIso: undefined,
        comments: [],
        updatedAtIso: new Date().toISOString(),
        createdAtIso: new Date().toISOString(),
      }
      await json('/api/staff-tasks', { method: 'POST', headers: hdrA, body: JSON.stringify(task2) })
      const delForbidden = await json(`/api/staff-tasks/${encodeURIComponent(task2.id)}`, {
        method: 'DELETE',
        headers: hdrB,
      })
      if (delForbidden.res.status === 403) pass('assignee cannot delete (403)')
      else warn(`assignee delete → ${delForbidden.res.status} (expected 403)`)
      await json(`/api/staff-tasks/${encodeURIComponent(task2.id)}`, {
        method: 'DELETE',
        headers: hdrA,
      })
    }
  }

  // 5. Other APIs used on devices
  console.log('\n5) Shared data APIs')
  {
    const fleet = await json('/api/fleet/registry')
    if (fleet.res.ok) pass('fleet registry')
    else warn(`fleet registry → ${fleet.res.status}`)

    const trips = await json('/api/driver-trips')
    if (trips.res.ok || trips.res.status === 401) pass(`driver-trips ${trips.res.status}`)
    else warn(`driver-trips → ${trips.res.status}`)

    const sites = await json('/api/user-sites')
    if (sites.res.ok) pass('user-sites')
    else warn(`user-sites → ${sites.res.status}`)
  }

  // 6. Backup cron
  console.log('\n6) Backups')
  {
    const out = sshPy(`
from pathlib import Path
p = Path('/var/backups/deloresh')
files = sorted(p.glob('deloresh-forms-*.tgz')) if p.exists() else []
print('COUNT=' + str(len(files)))
if files:
    f = files[-1]
    print('LATEST=' + f.name + ' size=' + str(f.stat().st_size))
cron = Path('/etc/cron.d/deloresh-site-forms-backup')
print('CRON=' + ('yes' if cron.exists() else 'no'))
`)
    if (out.includes('CRON=yes')) pass('backup cron installed')
    else fail('backup cron missing')
    if (/COUNT=[1-9]/.test(out)) pass('backup archives present')
    else warn('no backup archives yet')
  }

  // 7. Disk
  console.log('\n7) Server capacity')
  {
    const out = sshPy(`
import shutil
total, used, free = shutil.disk_usage('/')
pct = used * 100 // total
print(f'DISK={pct}% free_gb={free//(1024**3)}')
`)
    const m = out.match(/DISK=(\d+)%/)
    const pct = m ? Number(m[1]) : 0
    if (pct >= 90) fail(out)
    else if (pct >= 80) warn(out)
    else pass(out.replace('DISK=', 'disk '))
  }

  console.log('\n=== Summary ===')
  console.log(`OK: ${report.ok.length}  WARN: ${report.warn.length}  FAIL: ${report.fail.length}`)
  if (report.warn.length) {
    console.log('Warnings:')
    for (const w of report.warn) console.log('  -', w)
  }
  if (report.fail.length) {
    console.log('Failures:')
    for (const f of report.fail) console.log('  -', f)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
