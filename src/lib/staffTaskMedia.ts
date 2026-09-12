import { blobToDataUrl } from './staffTaskAudio'
import { fetchStaffTaskBlob, uploadStaffTaskBlob } from './siteFormsApi'

const objectUrlCache = new Map<string, string>()

export function isStaffBlobRef(ref: string): boolean {
  return ref.startsWith('/api/staff-tasks/blobs/')
}

export function newStaffBlobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `stb-${crypto.randomUUID()}`
  }
  return `stb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob)
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}

/** Загрузка на сервер; возвращает путь `/api/staff-tasks/blobs/…` или null. */
export async function uploadStaffMediaBlob(
  file: Blob,
  opts: { name: string; mime: string },
): Promise<string | null> {
  const id = newStaffBlobId()
  const dataBase64 = await blobToBase64(file)
  const up = await uploadStaffTaskBlob({
    id,
    mime: opts.mime || file.type || 'application/octet-stream',
    name: opts.name,
    dataBase64,
  })
  return up?.url ?? null
}

/** src для img/audio/a: data/blob сразу; server path — через fetch+objectURL. */
export async function resolveStaffMediaSrc(ref: string): Promise<string> {
  if (!ref) return ''
  if (ref.startsWith('data:') || ref.startsWith('blob:') || /^https?:/i.test(ref)) {
    return ref
  }
  if (!isStaffBlobRef(ref)) return ref
  const cached = objectUrlCache.get(ref)
  if (cached) return cached
  const blob = await fetchStaffTaskBlob(ref)
  if (!blob) return ''
  const url = URL.createObjectURL(blob)
  objectUrlCache.set(ref, url)
  return url
}

/** Убрать тяжёлые data URL из локального снимка (квота). */
export function slimMediaRef(ref: string): string {
  if (!ref) return ''
  if (isStaffBlobRef(ref)) return ref
  if (ref.startsWith('data:') && ref.length > 4000) return ''
  return ref
}
