import { useEffect, useId, useRef, useState } from 'react'
import {
  CARGO_REFUSE_REASONS,
  MIN_REFUSE_NOTE_CHARS,
  formatReceiptClockRu,
  makeRefusedReceipt,
  refuseCargoError,
  type CargoReceipt,
  type CargoReceiptMedia,
} from '../../domain/cargoReceipt'
import { formatQty, unitLabel, type ProcurementRequest } from '../../domain/procurementRequest'
import styles from './CargoReceiptSheet.module.css'

type Props = {
  request: ProcurementRequest
  onClose: () => void
  onSubmit: (receipt: CargoReceipt) => void | Promise<void>
}

function newMediaId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read'))
    r.readAsDataURL(blob)
  })
}

async function compressPhoto(blob: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob)
    const maxEdge = 1280
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return blobToDataUrl(blob)
    }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return blobToDataUrl(blob)
  }
}

const MAX_VIDEO_BYTES = 5.5 * 1024 * 1024

async function persistMedia(items: readonly CargoReceiptMedia[]): Promise<CargoReceiptMedia[]> {
  const out: CargoReceiptMedia[] = []
  for (const item of items) {
    try {
      const res = await fetch(item.previewUrl)
      const blob = await res.blob()
      if (item.kind === 'photo') {
        const dataUrl = await compressPhoto(blob)
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
        out.push({ ...item, previewUrl: dataUrl })
      } else if (blob.size > MAX_VIDEO_BYTES) {
        out.push(item)
      } else {
        const dataUrl = await blobToDataUrl(blob)
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
        out.push({ ...item, previewUrl: dataUrl })
      }
    } catch {
      out.push(item)
    }
  }
  return out
}

export function CargoReceiptSheet({ request, onClose, onSubmit }: Props) {
  const titleId = useId()
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [media, setMedia] = useState<CargoReceiptMedia[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mediaRef = useRef(media)
  mediaRef.current = media

  useEffect(() => {
    const t = window.setInterval(() => setNowIso(new Date().toISOString()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  useEffect(() => {
    return () => {
      for (const m of mediaRef.current) {
        if (m.previewUrl.startsWith('blob:')) URL.revokeObjectURL(m.previewUrl)
      }
    }
  }, [])

  const addFiles = (files: FileList | null, forceKind?: 'photo' | 'video') => {
    if (!files?.length) return
    const next: CargoReceiptMedia[] = []
    for (let i = 0; i < files.length; i += 1) {
      const file = files.item(i)
      if (!file) continue
      const kind: 'photo' | 'video' =
        forceKind ?? (file.type.startsWith('video/') ? 'video' : 'photo')
      next.push({
        id: newMediaId(),
        kind,
        name: file.name || (kind === 'video' ? 'видео' : 'фото'),
        previewUrl: URL.createObjectURL(file),
      })
    }
    if (next.length === 0) return
    setMedia((prev) => [...prev, ...next])
    setError(null)
  }

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const row = prev.find((m) => m.id === id)
      if (row?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((m) => m.id !== id)
    })
  }

  const handleRefuse = async () => {
    const made = makeRefusedReceipt(new Date().toISOString(), category, note, media)
    if (!made.ok) {
      setError(made.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const persisted = await persistMedia(made.receipt.media)
      await onSubmit({ ...made.receipt, media: persisted })
    } catch {
      setError('Не получилось сохранить. Попробуй ещё раз.')
      setBusy(false)
    }
  }

  const formError = refuseCargoError(category, note, media.length)
  const canSubmit = formError === null

  return (
    <div className={styles.scrim} role="presentation" onClick={() => !busy && onClose()}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.kicker}>Приёмка материала</p>
        <h2 className={styles.title} id={titleId}>
          Отказ в приёмке
        </h2>
        <p className={styles.lead}>
          Поставка на объект не принимается. Нужны причина, письменное пояснение и фото
          или видео. Без этого отказ сохранить нельзя.
        </p>
        <p className={styles.clock}>
          Сейчас {formatReceiptClockRu(nowIso)}.
          <br />
          Дата и время фиксируются автоматически.
        </p>

        <ul className={styles.items}>
          {request.items.map((it, i) => (
            <li key={`${request.id}-${i}`}>
              {it.title} — {formatQty(it.quantity)} {unitLabel(it.unitId)}
            </li>
          ))}
        </ul>

        <p className={styles.step}>1. Причина отказа</p>
        <div className={styles.reasons}>
          {CARGO_REFUSE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.reason} ${category === r ? styles.reasonOn : ''}`}
              onClick={() => {
                setCategory(r)
                setError(null)
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <label className={styles.noteField} htmlFor="cargo-refuse-note">
          <span className={styles.step}>2. Что именно не так</span>
          <span className={styles.hint}>
            Напишите своими словами. Короткой кнопки недостаточно.
          </span>
          <textarea
            id="cargo-refuse-note"
            className={styles.note}
            rows={4}
            value={note}
            disabled={busy}
            placeholder="Например: щебня меньше, чем в накладной; грунт с глиной и строительным мусором."
            onChange={(e) => {
              setNote(e.target.value)
              setError(null)
            }}
          />
        </label>

        <p className={styles.step}>3. Фото или видео</p>
        <p className={styles.hint}>Фиксация обязательна. Без снимка отказ не сохранится.</p>

        <div className={styles.mediaBtns}>
          <button
            type="button"
            className={styles.mediaBtn}
            onClick={() => photoInput.current?.click()}
          >
            Сделать фото
          </button>
          <button
            type="button"
            className={styles.mediaBtn}
            onClick={() => videoInput.current?.click()}
          >
            Снять видео
          </button>
          <input
            ref={photoInput}
            className={styles.file}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              addFiles(e.target.files, 'photo')
              e.target.value = ''
            }}
          />
          <input
            ref={videoInput}
            className={styles.file}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={(e) => {
              addFiles(e.target.files, 'video')
              e.target.value = ''
            }}
          />
        </div>

        {media.length > 0 ? (
          <ul className={styles.thumbs}>
            {media.map((m) => (
              <li key={m.id} className={styles.thumb}>
                {m.kind === 'video' ? (
                  <video src={m.previewUrl} muted playsInline />
                ) : (
                  <img src={m.previewUrl} alt="" />
                )}
                <button
                  type="button"
                  className={styles.thumbRemove}
                  onClick={() => removeMedia(m.id)}
                  aria-label="Убрать"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {!canSubmit && !error ? (
          <p className={styles.needAll}>
            Отказ без объяснения сохранить нельзя. Нужны причина, пояснение
            {note.trim().length > 0 && note.trim().length < MIN_REFUSE_NOTE_CHARS
              ? ` (ещё ${MIN_REFUSE_NOTE_CHARS - note.trim().length} симв.)`
              : ''}{' '}
            и фото или видео.
          </p>
        ) : null}

        <button
          type="button"
          className={styles.refuseBtn}
          disabled={busy || !canSubmit}
          onClick={() => void handleRefuse()}
        >
          {busy ? 'Сохраняем…' : 'Подтвердить отказ в приёмке'}
        </button>
        <button type="button" className={styles.backBtn} disabled={busy} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  )
}
