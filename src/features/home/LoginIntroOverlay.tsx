import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './LoginIntroOverlay.module.css'

type Props = {
  /** Путь к ролику, например `/login-intro.mp4`. */
  src?: string
  onDone: () => void
}

const DEFAULT_SRC = '/login-intro.mp4'
/** Если видео не стартовало — не держим сотрудника на чёрном экране. */
const FAILSAFE_MS = 12_000

/**
 * Полноэкранная брендовая анимация после успешного «Войти».
 * Подгоняется под любое устройство через object-fit: cover.
 */
export function LoginIntroOverlay({ src = DEFAULT_SRC, onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setPhase('out')
    window.setTimeout(() => onDone(), 420)
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

    const onEnded = () => finish()
    const onError = () => finish()
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    const tryPlay = async () => {
      try {
        video.currentTime = 0
        await video.play()
      } catch {
        try {
          video.muted = true
          await video.play()
        } catch {
          finish()
        }
      }
    }
    void tryPlay()

    const failsafe = window.setTimeout(finish, FAILSAFE_MS)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      window.clearTimeout(failsafe)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один показ на mount
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`${styles.screen} ${phase === 'out' ? styles.screenOut : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Вход в систему"
      onClick={finish}
    >
      <video
        ref={videoRef}
        className={styles.video}
        src={src}
        playsInline
        preload="auto"
        // После клика «Войти» жест уже есть — пробуем со звуком.
        muted={false}
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
