import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './LoginIntroOverlay.module.css'

type Props = {
  onDone: () => void
}

const INTRO_SRC = '/login-intro.mp4'
const INTRO_POSTER = '/login-intro-poster.jpg'

/** Ждём загрузку; не рвём ролик из‑за краткого buffering. */
const FAILSAFE_MS = 20_000

/**
 * Полноэкранная брендовая анимация после «Войти».
 * Весь кадр (contain). Mute + playsInline — надёжный старт на iOS/Safari.
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

    let cancelled = false

    const onEnded = () => finish()
    const onError = () => {
      // Даём увидеть постер хотя бы мгновение, потом закрываем.
      window.setTimeout(() => {
        if (!cancelled) finish()
      }, 900)
    }

    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    const tryPlay = async () => {
      video.muted = true
      video.defaultMuted = true
      video.setAttribute('muted', '')
      video.playsInline = true
      try {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve) => {
            const ready = () => {
              video.removeEventListener('canplay', ready)
              video.removeEventListener('loadeddata', ready)
              resolve()
            }
            video.addEventListener('canplay', ready)
            video.addEventListener('loadeddata', ready)
            try {
              video.load()
            } catch {
              resolve()
            }
            window.setTimeout(resolve, 4_000)
          })
        }
        if (cancelled || doneRef.current) return
        await video.play()
      } catch {
        // Не закрываем сразу: на части устройств play() отклоняется до canplay.
        // Пользователь видит постер; failsafe / skip / ended закроют.
        try {
          video.muted = true
          await video.play()
        } catch {
          /* оставляем постер */
        }
      }
    }
    void tryPlay()

    const failsafe = window.setTimeout(finish, FAILSAFE_MS)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelled = true
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
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
        autoPlay
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

  // Прогрев буфера через скрытый video (надёжнее link preload на мобилках).
  if (!document.querySelector('video[data-login-intro-warm]')) {
    const warm = document.createElement('video')
    warm.setAttribute('data-login-intro-warm', '1')
    warm.preload = 'auto'
    warm.muted = true
    warm.playsInline = true
    warm.src = INTRO_SRC
    warm.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px'
    document.body.appendChild(warm)
    try {
      warm.load()
    } catch {
      /* noop */
    }
  }
}
