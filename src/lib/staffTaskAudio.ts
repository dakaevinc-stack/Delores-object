/** Подбор MIME и упаковка голосовых сообщений для чата задач. */

export const MAX_VOICE_BYTES = 2.5 * 1024 * 1024
export const MAX_VOICE_SEC = 90

const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

export function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }
  for (const mime of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

export function canRecordVoice(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(blob)
  })
}

export function formatVoiceDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function voiceFileExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  return 'webm'
}
