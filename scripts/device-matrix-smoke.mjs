/**
 * Layout + viewport lock smoke across phone / tablet / desktop.
 * Run after build+deploy: node scripts/device-matrix-smoke.mjs
 */
import { chromium } from 'playwright-core'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.DELORESH_URL || 'http://94.242.58.24/'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEVICES = [
  { name: 'iPhone 16 Pro', w: 402, h: 874, mobile: true },
  { name: 'iPhone SE', w: 375, h: 667, mobile: true },
  { name: 'iPhone landscape', w: 667, h: 375, mobile: true },
  { name: 'iPad Air', w: 820, h: 1180, mobile: true },
  { name: 'iPad Pro 11', w: 834, h: 1194, mobile: true },
  { name: 'Samsung S24', w: 360, h: 780, mobile: true },
  { name: 'Pixel 8', w: 412, h: 915, mobile: true },
  { name: 'Laptop', w: 1366, h: 768, mobile: false },
  { name: 'Desktop HD', w: 1440, h: 900, mobile: false },
  { name: 'Desktop FHD', w: 1920, h: 1080, mobile: false },
]

async function main() {
  const cssDir = join(ROOT, 'dist/assets')
  if (!existsSync(cssDir)) {
    console.error('FAIL: dist missing — npm run build first')
    process.exit(1)
  }
  let blob = ''
  for (const f of readdirSync(cssDir).filter((x) => x.endsWith('.css'))) {
    blob += readFileSync(join(cssDir, f), 'utf8')
  }
  const cssFails = []
  if (!/max-width:\s*48px/.test(blob)) cssFails.push('zoom dock max-width')
  if (!/(?:min-width|width):\s*36px/.test(blob)) cssFails.push('zoomBtn 36px')
  if (!/(?:min-width|width):\s*34px/.test(blob)) cssFails.push('mobile zoomBtn 34px')
  const indexHtml = readFileSync(join(ROOT, 'dist/index.html'), 'utf8')
  if (!/maximum-scale=1/.test(indexHtml)) cssFails.push('maximum-scale')
  if (!/user-scalable=no/.test(indexHtml)) cssFails.push('user-scalable')

  if (cssFails.length) {
    console.error('CSS/index checks FAILED:', cssFails.join(', '))
    process.exit(1)
  }
  console.log('CSS/index viewport+zoom locks: OK')

  const browser = await chromium.launch({ headless: true })
  const rows = []
  for (const d of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      isMobile: d.mobile,
      hasTouch: d.mobile,
      deviceScaleFactor: d.mobile ? 2 : 1,
    })
    const page = await context.newPage()
    let status = 'ok'
    let detail = ''
    try {
      const res = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (!res?.ok()) {
        status = 'fail'
        detail = `HTTP ${res?.status()}`
      } else {
        await page.waitForSelector('#root', { timeout: 15000 })
        const vp = await page.evaluate(() => {
          const m = document.querySelector('meta[name="viewport"]')
          return m?.getAttribute('content') || ''
        })
        if (!vp.includes('maximum-scale=1') || !vp.includes('user-scalable=no')) {
          status = 'fail'
          detail = `viewport meta: ${vp}`
        }
        const box = await page.locator('#root').boundingBox()
        if (!box || box.width < d.w * 0.85) {
          status = status === 'ok' ? 'warn' : status
          detail = (detail ? `${detail}; ` : '') + `root w=${box?.width}`
        }
      }
    } catch (e) {
      status = 'fail'
      detail = e instanceof Error ? e.message : String(e)
    }
    rows.push({ name: d.name, w: d.w, h: d.h, status, detail })
    await context.close()
  }
  await browser.close()

  console.table(rows)
  const failed = rows.filter((r) => r.status === 'fail')
  if (failed.length) {
    console.error(`FAIL ${failed.length}/${rows.length}`)
    process.exit(1)
  }
  console.log(`OK ${rows.length} viewports`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
