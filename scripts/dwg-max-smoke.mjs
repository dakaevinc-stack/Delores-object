/**
 * Максимальный smoke/E2E по чертежу: viewport-лок, CSS размеров зума,
 * логин → объекты → открытие DWG (если есть) → размеры +/- и меню.
 *
 * Run: node scripts/dwg-max-smoke.mjs
 * Env: DELORESH_URL (default prod), DELORESH_LOGIN, DELORESH_PASSWORD
 */
import { chromium } from 'playwright-core'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.DELORESH_URL || 'http://94.242.58.24/'
const LOGIN = process.env.DELORESH_LOGIN || 'Dakaev'
const PASSWORD = process.env.DELORESH_PASSWORD || ''
if (!PASSWORD) {
  console.error('Set DELORESH_PASSWORD for live smoke (not committed).')
  process.exit(2)
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEVICES = [
  { name: 'iPhone SE', w: 375, h: 667, mobile: true, dpr: 2 },
  { name: 'iPhone 13 mini', w: 375, h: 812, mobile: true, dpr: 3 },
  { name: 'iPhone 14', w: 390, h: 844, mobile: true, dpr: 3 },
  { name: 'iPhone 15', w: 393, h: 852, mobile: true, dpr: 3 },
  { name: 'iPhone 16 Pro', w: 402, h: 874, mobile: true, dpr: 3 },
  { name: 'iPhone 16 Pro Max', w: 440, h: 956, mobile: true, dpr: 3 },
  { name: 'iPhone landscape', w: 844, h: 390, mobile: true, dpr: 3 },
  { name: 'iPad mini', w: 768, h: 1024, mobile: true, dpr: 2 },
  { name: 'iPad Air', w: 820, h: 1180, mobile: true, dpr: 2 },
  { name: 'iPad Pro 11', w: 834, h: 1194, mobile: true, dpr: 2 },
  { name: 'iPad landscape', w: 1180, h: 820, mobile: true, dpr: 2 },
  { name: 'Galaxy S24', w: 360, h: 780, mobile: true, dpr: 3 },
  { name: 'Galaxy S24 Ultra', w: 412, h: 915, mobile: true, dpr: 3.5 },
  { name: 'Pixel 8', w: 412, h: 915, mobile: true, dpr: 2.625 },
  { name: 'Pixel 7a', w: 412, h: 915, mobile: true, dpr: 2.625 },
  { name: 'Xiaomi 14', w: 393, h: 873, mobile: true, dpr: 2.75 },
  { name: 'Fold cover', w: 344, h: 882, mobile: true, dpr: 2.5 },
  { name: 'Laptop 13', w: 1280, h: 800, mobile: false, dpr: 1 },
  { name: 'Laptop 14', w: 1366, h: 768, mobile: false, dpr: 1 },
  { name: 'Desktop HD', w: 1440, h: 900, mobile: false, dpr: 1 },
  { name: 'Desktop FHD', w: 1920, h: 1080, mobile: false, dpr: 1 },
  { name: 'Desktop QHD', w: 2560, h: 1440, mobile: false, dpr: 1 },
]

function checkBuiltAssets() {
  const fails = []
  const cssDir = join(ROOT, 'dist/assets')
  if (!existsSync(cssDir)) return ['dist missing']
  let blob = ''
  for (const f of readdirSync(cssDir).filter((x) => x.endsWith('.css'))) {
    blob += readFileSync(join(cssDir, f), 'utf8')
  }
  if (!/max-width:\s*48px/.test(blob)) fails.push('zoom dock max-width')
  if (!/(?:min-width|width):\s*36px/.test(blob)) fails.push('zoomBtn 36')
  if (!/(?:min-width|width):\s*34px/.test(blob)) fails.push('zoomBtn mobile 34')
  const indexHtml = readFileSync(join(ROOT, 'dist/index.html'), 'utf8')
  if (!/maximum-scale=1/.test(indexHtml)) fails.push('maximum-scale')
  if (!/user-scalable=no/.test(indexHtml)) fails.push('user-scalable')
  if (!existsSync(join(ROOT, 'dist/sw.js'))) fails.push('sw.js')
  return fails
}

async function fetchStaffToken() {
  const res = await fetch(new URL('/api/auth/login', BASE).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.token || !json?.login) throw new Error('login response missing token')
  return {
    token: String(json.token),
    login: String(json.login),
    fullName: String(json.fullName || ''),
    duty: String(json.duty || 'deputy'),
    dutyLabel: String(json.dutyLabel || ''),
  }
}

async function loginViaUi(page, session) {
  // Прямая сессия v2 + Bearer — без интро-ролика и формы (стабильнее для CI/smoke).
  await page.addInitScript((s) => {
    try {
      sessionStorage.removeItem('deloresh-pending-login-intro:v1')
      localStorage.removeItem('deloresh-local-session:v1')
      localStorage.setItem(
        'deloresh-local-session:v2',
        JSON.stringify({
          login: s.login,
          fullName: s.fullName,
          duty: s.duty,
          dutyLabel: s.dutyLabel,
          token: s.token,
          signedInAt: new Date().toISOString(),
        }),
      )
    } catch {
      /* private mode */
    }
  }, session)

  await page.goto(new URL('/objects', BASE).href, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('#root', { timeout: 20000 })
  await page.waitForTimeout(700)

  // Если всё же форма входа — заполняем.
  const loginInput = page.locator('input[name="login"], input[autocomplete="username"]').first()
  if (await loginInput.isVisible().catch(() => false)) {
    await loginInput.fill(LOGIN)
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD)
    await page.getByRole('button', { name: /войти/i }).first().click()
    await page.waitForTimeout(1000)
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem('deloresh-pending-login-intro:v1')
        window.dispatchEvent(new Event('deloresh-login-intro-finished'))
      } catch {
        /* */
      }
    })
    await page.goto(new URL('/objects', BASE).href, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
  }
}

async function waitDrawingPanelReady(page, timeoutMs = 45000) {
  const panel = page.locator('[aria-label="Чертёж и файлы проекта"]')
  await panel.waitFor({ state: 'attached', timeout: 15000 }).catch(() => null)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const text = ((await panel.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
    if (text && !/Загружаем/i.test(text)) return text
    await page.waitForTimeout(500)
  }
  return ((await panel.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
}

async function openObjectsAndMaybeDwg(page, mobile) {
  const result = {
    openedObjects: false,
    openedSite: false,
    openedDwg: false,
    zoomOk: null,
    sheetOk: null,
    toolsOk: null,
  }

  // Сайт с известным featured DWG (быстрее и стабильнее первого в списке).
  await page.goto(new URL('/objects/brusilova', BASE).href, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(800)
  result.openedObjects = true
  result.openedSite = /\/objects\/[^/]+/.test(page.url())
  if (!result.openedSite) return result

  const panelText = await waitDrawingPanelReady(page)
  const openBtn = page
    .locator('[aria-label="Чертёж и файлы проекта"] button')
    .filter({ hasText: /^Открыть$/i })
    .first()

  if (await openBtn.count()) {
    await openBtn.click({ timeout: 8000 }).catch(() => {})
  } else if (/\.dwg/i.test(panelText)) {
    // Документы → строка .dwg → Открыть
    await page
      .locator('[aria-label="Чертёж и файлы проекта"] button')
      .filter({ hasText: /^Документы$/i })
      .first()
      .click()
      .catch(() => {})
    await page.waitForTimeout(600)
    const dwgRow = page.locator('[aria-label="Документы объекта"] button, li').filter({ hasText: /\.dwg/i }).first()
    if (await dwgRow.count()) await dwgRow.click().catch(() => {})
  }

  const viewer = page.locator('[role="dialog"][aria-label="Просмотр DWG"]')
  await viewer.waitFor({ state: 'visible', timeout: 25000 }).catch(() => null)
  if (!(await viewer.count())) return result

  result.openedDwg = true
  // Дождаться зума / тулбара после растра
  await page.getByTestId('dwg-zoom-dock').waitFor({ state: 'visible', timeout: 20000 }).catch(() => null)

  const plan = page.getByRole('button', { name: /^план$/i }).first()
  const measure = page.getByRole('button', { name: /замер/i }).first()
  const marks = page.getByRole('button', { name: /метк/i }).first()
  const marker = page.getByRole('button', { name: /маркер/i }).first()
  result.toolsOk =
    (await plan.count()) + (await measure.count()) + (await marks.count()) + (await marker.count()) >= 2

  if (await plan.count()) {
    await plan.click().catch(() => {})
    await page.waitForTimeout(400)
  }

  const dock = page.getByTestId('dwg-zoom-dock')
  if (await dock.count()) {
    const btnBox = await page.getByTestId('dwg-zoom-in').boundingBox()
    const maxBtn = mobile ? 48 : 52
    result.zoomOk = Boolean(btnBox && btnBox.width <= maxBtn && btnBox.height <= maxBtn)
  } else {
    result.zoomOk = true
  }

  const sheet = page.getByTestId('dwg-mobile-sheet')
  if (await sheet.count()) {
    const sb = await sheet.boundingBox()
    result.sheetOk = Boolean(sb && sb.height < (mobile ? 520 : 600) && sb.width > 100)
  } else {
    result.sheetOk = true
  }

  for (const btn of [measure, marks, marker, plan]) {
    if (await btn.count()) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(250)
    }
  }

  return result
}

async function main() {
  const assetFails = checkBuiltAssets()
  if (assetFails.length) {
    console.error('Built asset checks FAILED:', assetFails.join(', '))
    process.exit(1)
  }
  console.log('Built assets (viewport+zoom CSS): OK')

  const session = await fetchStaffToken()
  console.log(`Auth token OK for ${session.login}`)

  const browser = await chromium.launch({ headless: true })
  const rows = []
  let deepOk = 0
  let deepTried = 0

  for (const d of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      isMobile: d.mobile,
      hasTouch: d.mobile,
      deviceScaleFactor: d.dpr,
    })
    const page = await context.newPage()
    let status = 'ok'
    const details = []
    try {
      await loginViaUi(page, session)

      const vp = await page.evaluate(() => {
        const m = document.querySelector('meta[name="viewport"]')
        return m?.getAttribute('content') || ''
      })
      if (!vp.includes('maximum-scale=1') || !vp.includes('user-scalable=no')) {
        status = 'fail'
        details.push(`viewport:${vp.slice(0, 60)}`)
      }

      const root = await page.locator('#root').boundingBox()
      if (!root || root.width < d.w * 0.8) {
        status = status === 'ok' ? 'warn' : status
        details.push(`rootW=${Math.round(root?.width || 0)}`)
      }

      // Deep path on a subset of devices to save time
      const deep =
        d.name === 'iPhone 16 Pro' ||
        d.name === 'iPhone SE' ||
        d.name === 'iPad Air' ||
        d.name === 'Galaxy S24' ||
        d.name === 'Laptop 14' ||
        d.name === 'Desktop FHD' ||
        d.name === 'iPhone landscape'

      if (deep) {
        deepTried++
        const r = await openObjectsAndMaybeDwg(page, d.mobile)
        if (r.openedObjects) details.push('objects')
        if (r.openedSite) details.push('site')
        if (r.openedDwg) {
          details.push('dwg')
          deepOk++
          if (r.zoomOk === false) {
            status = 'fail'
            details.push('zoom-size')
          }
          if (r.sheetOk === false) {
            status = 'fail'
            details.push('sheet-size')
          }
          if (r.toolsOk === false) {
            details.push('tools?')
          }
        } else if (r.openedSite) {
          details.push('no-dwg')
        }
      }
    } catch (e) {
      status = 'fail'
      details.push(e instanceof Error ? e.message.slice(0, 80) : String(e))
    }
    rows.push({
      name: d.name,
      w: d.w,
      h: d.h,
      status,
      detail: details.join(', '),
    })
    await context.close()
  }

  await browser.close()
  console.table(rows)
  const failed = rows.filter((r) => r.status === 'fail')
  console.log(`Devices: ${rows.length - failed.length}/${rows.length} ok; deep DWG opened on ${deepOk}/${deepTried}`)
  if (failed.length) {
    console.error(`FAIL ${failed.length}`)
    process.exit(1)
  }
  console.log('MAX SMOKE OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
