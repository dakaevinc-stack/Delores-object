import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './LoginIntroOverlay.module.css'

type Props = {
  onDone: () => void
}

const INTRO_SRC = '/login-intro.mp4'
const INTRO_POSTER = '/login-intro-poster.jpg'

/** Не держим чёрный экран, если буфер завис. */
const FAILSAFE_MS = 10_000
const STALL_MS = 2_500

/**
 * Полноэкранная брендовая анимация после «Войти».
 * Весь кадр ролика (contain) — без обрезки на телефоне и десктопе.
 */
export function LoginIntroOverlay({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setPhase('out')
    window.setTimeout(() => onDone(), 320)
  }

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      finish()
      return
    }

    const video = videoRef.current
    if (!video) return

    let stallTimer: number | undefined
    const clearStall = () => {
      if (stallTimer !== undefined) window.clearTimeout(stallTimer)
      stallTimer = undefined
    }
    const armStall = () => {
      clearStall()
      stallTimer = window.setTimeout(finish, STALL_MS)
    }

    const onEnded = () => finish()
    const onError = () => finish()
    const onPlaying = () => clearStall()
    const onWaiting = () => armStall()
    const onStalled = () => armStall()

    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)

    const tryPlay = async () => {
      // Mute → play надёжно на iOS, затем включаем звук (жест «Войти» уже был).
      video.muted = true
      video.defaultMuted = true
      try {
        video.currentTime = 0
        await video.play()
        try {
          video.muted = false
        } catch {
          /* остаёмся без звука — ролик всё равно идёт */
        }
      } catch {
        finish()
      }
    }
    void tryPlay()

    const failsafe = window.setTimeout(finish, FAILSAFE_MS)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      clearStall()
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      window.clearTimeout(failsafe)
      document.body.style.overflow = prevOverflow
      try {
        video.pause()
      } catch {
        /* noop */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один показ на mount
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={[styles.screen, phase === 'out' ? styles.screenOut : '']
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Вход в систему"
      onClick={finish}
    >
      <video
        ref={videoRef}
        className={styles.video}
        src={INTRO_SRC}
        poster={INTRO_POSTER}
        playsInline
        preload="auto"
        muted
        controls={false}
        disablePictureInPicture
      />
      <button
        type="button"
        className={styles.skip}
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      >
        Пропустить
      </button>
    </div>,
    document.body,
  )
}

/** Предзагрузка ролика, пока сотрудник смотрит форму входа. */
export function preloadLoginIntro(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`link[data-login-intro="${INTRO_SRC}"]`)) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'video'
  link.href = INTRO_SRC
  link.setAttribute('data-login-intro', INTRO_SRC)
  document.head.appendChild(link)

  const poster = document.createElement('link')
  poster.rel = 'preload'
  poster.as = 'image'
  poster.href = INTRO_POSTER
  document.head.appendChild(poster)
}
