/**
 * CadView рисует HATCH с globalAlpha=0.3 — при зуме полупрозрачные
 * заливки дают «блики». Делаем плотнее и без лишнего stroke на solid.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  'node_modules/@cadview/core/dist/index.js',
  'node_modules/@cadview/core/dist/index.cjs',
]

const from = `  if (entity.solidFill) {
    ctx.globalAlpha = 0.3;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
}`

const to = `  if (entity.solidFill) {
    ctx.globalAlpha = 0.72;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}`

let patched = 0
for (const rel of targets) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  if (src.includes('ctx.globalAlpha = 0.72')) {
    console.log(`✓ already patched ${rel}`)
    continue
  }
  if (!src.includes(from)) {
    console.warn(`⚠ hatch pattern not found in ${rel}`)
    continue
  }
  fs.writeFileSync(file, src.replace(from, to))
  patched += 1
  console.log(`✓ patched hatch alpha in ${rel}`)
}

if (patched === 0 && !targets.some((rel) => {
  const file = path.join(root, rel)
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('ctx.globalAlpha = 0.72')
})) {
  console.warn('⚠ cadview hatch patch skipped')
}
