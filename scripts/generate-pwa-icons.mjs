import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const publicDir = path.join(root, 'public')

/** Brand purple from favicon.svg (#863bff) */
const BRAND = { r: 134, g: 59, b: 255 }

function solidPng(size) {
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      png.data[idx] = BRAND.r
      png.data[idx + 1] = BRAND.g
      png.data[idx + 2] = BRAND.b
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

function writeIfChanged(filePath, buf) {
  if (fs.existsSync(filePath)) {
    const cur = fs.readFileSync(filePath)
    if (cur.length === buf.length && cur.equals(buf)) return
  }
  fs.writeFileSync(filePath, buf)
}

fs.mkdirSync(publicDir, { recursive: true })
writeIfChanged(path.join(publicDir, 'pwa-192.png'), solidPng(192))
writeIfChanged(path.join(publicDir, 'pwa-512.png'), solidPng(512))
