import { useEffect, useId, useRef, useState } from 'react'
import {
  CARGO_REFUSE_REASONS,
  MIN_REFUSE_NOTE_CHARS,
  formatReceiptClockRu,
  makeRefusedReceipt,
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
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
        throw new Error(
          'Видео слишком большое для общей базы (макс. ~5 МБ). Сожмите ролик или приложите фото.',
        )
      } else {
        const dataUrl = await blobToDataUrl(blob)
        if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
        out.push({ ...item, previewUrl: dataUrl })
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('слишком большое')) throw e
      if (item.previewUrl.startsWith('blob:')) {
        throw new Error('Не удалось сохранить медиа для других устройств. Попробуйте ещё раз.')
      }
      out.push(item)
    }
  }
  if (out.some((m) => m.previewUrl.startsWith('blob:'))) {
    throw new Error('Медиа не ушло в общую базу. Попробуйте ещё раз или уменьшите файл.')
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

  useEffect(() => {
    mediaRef.current = media
  }, [media])

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось сохранить. Попробуйте ещё раз.')
      setBusy(false)
    }
  }

  const noteLen = note.trim().length
  const noteOk = noteLen >= MIN_REFUSE_NOTE_CHARS
  const reasonOk = category.trim().length > 0
  const mediaOk = media.length > 0
  const canSubmit = reasonOk && noteOk && mediaOk
  const noteLeft = Math.max(0, MIN_REFUSE_NOTE_CHARS - noteLen)

  return (
    <div className={styles.scrim} role="presentation" onClick={() => !busy && onClose()}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.sheetRail} aria-hidden />

        <header className={styles.head}>
          <div className={styles.headTop}>
            <p className={styles.kicker}>Приёмка на объекте</p>
            <button
              type="button"
              className={styles.closeBtn}
              disabled={busy}
              onClick={onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <h2 className={styles.title} id={titleId}>
            Оформление отказа
          </h2>
          <p className={styles.lead}>
            Материал на объект не принимаем. Зафиксируйте причину, пояснение и доказательство —
            без этого отказ в систему не уйдёт.
          </p>
        </header>

        <div className={styles.metaRow}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>Заявка</span>
            <strong className={styles.metaValue}>№ {request.shortCode}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>Время фиксации</span>
            <strong className={styles.metaValue}>{formatReceiptClockRu(nowIso)}</strong>
          </div>
        </div>

        <section className={styles.cargoCard} aria-label="Материал по заявке">
          <p className={styles.cargoLabel}>Что привезли</p>
          <ul className={styles.items}>
            {request.items.map((it, i) => (
              <li key={`${request.id}-${i}`}>
                <span className={styles.itemTitle}>{it.title}</span>
                <span className={styles.itemQty}>
                  {formatQty(it.quantity)} {unitLabel(it.unitId)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <ol className={styles.checklist} aria-label="Что нужно заполнить">
          <li className={reasonOk ? styles.checkDone : undefined}>
            <span className={styles.checkMark} aria-hidden>
              {reasonOk ? '✓' : '1'}
            </span>
            Причина
          </li>
          <li className={noteOk ? styles.checkDone : undefined}>
            <span className={styles.checkMark} aria-hidden>
              {noteOk ? '✓' : '2'}
            </span>
            Пояснение
          </li>
          <li className={mediaOk ? styles.checkDone : undefined}>
            <span className={styles.checkMark} aria-hidden>
              {mediaOk ? '✓' : '3'}
            </span>
            Фото / видео
          </li>
        </ol>

        <div className={styles.body}>
          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h3 className={styles.blockTitle}>Причина отказа</h3>
              <p className={styles.blockHint}>Выберите одну — это основа акта</p>
            </div>
            <div className={styles.reasons} role="group" aria-label="Причина отказа">
              {CARGO_REFUSE_REASONS.map((r) => {
                const on = category === r
                return (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.reason} ${on ? styles.reasonOn : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      setCategory(r)
                      setError(null)
                    }}
                  >
                    <span className={styles.reasonDot} aria-hidden />
                    {r}
                  </button>
                )
              })}
            </div>
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h3 className={styles.blockTitle}>Пояснение</h3>
              <p className={styles.blockHint}>Своими словами: что именно не так на площадке</p>
            </div>
            <label className={styles.noteField} htmlFor="cargo-refuse-note">
              <textarea
                id="cargo-refuse-note"
                className={styles.note}
                rows={4}
                value={note}
                disabled={busy}
                placeholder="Например: по накладной 20 т щебня, по факту меньше; в грунте глина и строительный мусор."
                onChange={(e) => {
                  setNote(e.target.value)
                  setError(null)
                }}
              />
              <span className={styles.noteMeta}>
                {noteOk
                  ? 'Пояснение достаточно'
                  : noteLen === 0
                    ? `Минимум ${MIN_REFUSE_NOTE_CHARS} символов`
                    : `Ещё ${noteLeft} симв.`}
              </span>
            </label>
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h3 className={styles.blockTitle}>Доказательство</h3>
              <p className={styles.blockHint}>Снимок или короткое видео с площадки — обязательно</p>
            </div>

            <div className={styles.mediaBtns}>
              <button
                type="button"
                className={styles.mediaBtn}
                disabled={busy}
                onClick={() => photoInput.current?.click()}
              >
                <span className={styles.mediaBtnTitle}>Фото</span>
                <span className={styles.mediaBtnSub}>С камеры или галереи</span>
              </button>
              <button
                type="button"
                className={styles.mediaBtn}
                disabled={busy}
                onClick={() => videoInput.current?.click()}
              >
                <span className={styles.mediaBtnTitle}>Видео</span>
                <span className={styles.mediaBtnSub}>До ~5 МБ</span>
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
                    <span className={styles.thumbKind}>{m.kind === 'video' ? 'Видео' : 'Фото'}</span>
                    <button
                      type="button"
                      className={styles.thumbRemove}
                      onClick={() => removeMedia(m.id)}
                      aria-label="Убрать файл"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.mediaEmpty}>Пока нет вложений — добавьте хотя бы одно</p>
            )}
          </section>
        </div>

        <footer className={styles.footer}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {!canSubmit && !error ? (
            <p className={styles.needAll}>
              Чтобы сохранить отказ, заполните все три пункта сверху.
            </p>
          ) : null}

          <button
            type="button"
            className={styles.refuseBtn}
            disabled={busy || !canSubmit}
            onClick={() => void handleRefuse()}
          >
            {busy ? 'Сохраняем…' : 'Подтвердить отказ'}
          </button>
          <button type="button" className={styles.backBtn} disabled={busy} onClick={onClose}>
            Отмена
          </button>
        </footer>
      </div>
    </div>
  )
}
