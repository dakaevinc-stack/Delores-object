import { useEffect, useId, useState } from 'react'
import type { StoredSiteMedia } from '../../lib/mediaRepository'
import styles from './JournalMediaDayCard.module.css'

type Props = {
  dayKey: string
  dayLabel: string
  items: readonly StoredSiteMedia[]
  previewUrlFor: (mediaId: string) => string
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/**
 * Компактная строка дня: материал слева, короткая дата справа.
 * Клик открывает просмотр.
 */
export function JournalMediaDayCard({
  dayKey,
  dayLabel,
  items,
  previewUrlFor,
}: Props) {
  const uid = useId()
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const photos = items.filter((m) => m.kind === 'photo').length
  const videos = items.filter((m) => m.kind === 'video').length
  const parts: string[] = []
  if (photos > 0) {
    parts.push(`${photos} ${pluralRu(photos, ['фото', 'фото', 'фото'])}`)
  }
  if (videos > 0) {
    parts.push(`${videos} ${pluralRu(videos, ['видео', 'видео', 'видео'])}`)
  }
  const count = parts.join(' · ') || `${items.length}`

  useEffect(() => {
    if (viewerIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerIndex(null)
      if (e.key === 'ArrowRight') {
        setViewerIndex((i) => (i == null ? i : Math.min(items.length - 1, i + 1)))
      }
      if (e.key === 'ArrowLeft') {
        setViewerIndex((i) => (i == null ? i : Math.max(0, i - 1)))
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [viewerIndex, items.length])

  const viewer = viewerIndex != null ? items[viewerIndex] : null
  const viewerSrc = viewer ? previewUrlFor(viewer.id) : ''

  return (
    <>
      <button
        type="button"
        className={styles.line}
        aria-labelledby={`${uid}-title`}
        data-day={dayKey}
        onClick={() => setViewerIndex(0)}
      >
        <span className={styles.copy}>
          <span className={styles.count} id={`${uid}-title`}>
            {count}
          </span>
        </span>
        <time className={styles.date} dateTime={dayKey}>
          {dayLabel}
        </time>
      </button>

      {viewer && viewerSrc ? (
        <div
          className={styles.viewerBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${dayLabel}: ${count}`}
          onClick={() => setViewerIndex(null)}
        >
          <div className={styles.viewerBody} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.viewerClose}
              onClick={() => setViewerIndex(null)}
              aria-label="Закрыть"
            >
              ✕
            </button>
            {items.length > 1 ? (
              <>
                <button
                  type="button"
                  className={`${styles.viewerNav} ${styles.viewerNavPrev}`}
                  disabled={viewerIndex === 0}
                  onClick={() => setViewerIndex((i) => (i == null ? i : Math.max(0, i - 1)))}
                  aria-label="Назад"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${styles.viewerNav} ${styles.viewerNavNext}`}
                  disabled={viewerIndex === items.length - 1}
                  onClick={() =>
                    setViewerIndex((i) =>
                      i == null ? i : Math.min(items.length - 1, i + 1),
                    )
                  }
                  aria-label="Дальше"
                >
                  ›
                </button>
              </>
            ) : null}
            <div className={styles.viewerStage}>
              {viewer.kind === 'photo' ? (
                <img className={styles.viewerMedia} src={viewerSrc} alt="" />
              ) : (
                <video
                  className={styles.viewerMedia}
                  src={viewerSrc}
                  controls
                  autoPlay
                  playsInline
                />
              )}
            </div>
            <p className={styles.viewerCount}>
              {(viewerIndex ?? 0) + 1} / {items.length}
              {viewer.authorCaption ? ` · ${viewer.authorCaption}` : ''}
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
