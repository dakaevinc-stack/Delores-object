/** PNG-план почти однотонный — ACadSharp.Image не нарисовал геометрию. */
export function isRasterPreviewBlank(
  canvas: HTMLCanvasElement,
  sampleW = 256,
  sampleH = 256,
  bg = { r: 43, g: 43, b: 43 },
): boolean {
  const w = canvas.width
  const h = canvas.height
  if (w < 8 || h < 8) return true

  const sample = document.createElement('canvas')
  sample.width = sampleW
  sample.height = sampleH
  const ctx = sample.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false

  ctx.drawImage(canvas, 0, 0, sampleW, sampleH)
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data
  let sampled = 0
  let nonBg = 0

  for (let i = 0; i < data.length; i += 4) {
    const dr = Math.abs(data[i] - bg.r)
    const dg = Math.abs(data[i + 1] - bg.g)
    const db = Math.abs(data[i + 2] - bg.b)
    if (Math.max(dr, dg, db) > 18) nonBg += 1
    sampled += 1
  }

  return sampled > 0 && nonBg / sampled < 0.002
}

export async function probeRasterPreviewBlank(url: string): Promise<boolean> {
  const sampleW = 256
  const sampleH = 256
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = sampleW
      canvas.height = sampleH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(false)
        return
      }
      ctx.drawImage(img, 0, 0, sampleW, sampleH)
      resolve(isRasterPreviewBlank(canvas, sampleW, sampleH))
    }
    img.onerror = () => resolve(true)
    img.src = url
  })
}
