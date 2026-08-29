import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'node_modules/@cadview/dwg/dist/libredwg.wasm')
const dest = path.join(root, 'public/libredwg.wasm')

if (!fs.existsSync(src)) {
  console.warn('[copy-dwg-wasm] skip: @cadview/dwg not installed')
  process.exit(0)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
const buf = fs.readFileSync(src)
if (fs.existsSync(dest)) {
  const cur = fs.readFileSync(dest)
  if (cur.length === buf.length && cur.equals(buf)) process.exit(0)
}
fs.writeFileSync(dest, buf)
console.log('[copy-dwg-wasm] public/libredwg.wasm')
