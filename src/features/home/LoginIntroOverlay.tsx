import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './LoginIntroOverlay.module.css'
import {
  getLoginIntroPlayer,
  preloadLoginIntroPlayer,
  stopLoginIntroPlayback,
} from './loginIntroPlayer'

type Props = {
  onDone: () => void
}

const FAILSAFE_MS = 12_000

/**
 * Вход как YouTube Shorts / Reels / TikTok:
 * вертикальный 9:16 ролик на весь экран (cover, edge-to-edge), со звуком.
 */
export function LoginIntroOverlay({ onDone }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setPhase('out')
    window.setTimeout(() => {
      stopLoginIntroPlayback()
      onDone()
    }, 280)
  }

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      finish()
      return
    }

    const stage = stageRef.current
    if (!stage) return

    const video = getLoginIntroPlayer()
    video.className = styles.video
    video.style.cssText = ''
    video.muted = false
    video.defaultMuted = false
    video.volume = 1
    video.removeAttribute('muted')
    stage.appendChild(video)

    let cancelled = false
    const onEnded = () => finish()
    const onError = () => {
      window.setTimeout(() => {
        if (!cancelled) finish()
      }, 600)
    }
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    if (video.paused) {
      void video.play().catch(() => {
        video.muted = true
        void video
          .play()
          .then(() => {
            video.muted = false
          })
          .catch(() => {
            /* poster */
          })
      })
    }

    const failsafe = window.setTimeout(finish, FAILSAFE_MS)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelled = true
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      window.clearTimeout(failsafe)
      document.body.style.overflow = prevOverflow
      video.className = ''
      if (video.parentElement === stage) {
        document.body.appendChild(video)
      }
      video.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px;z-index:-1'
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
      <div ref={stageRef} className={styles.stage} />
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

export function preloadLoginIntro(): void {
  preloadLoginIntroPlayer()
}

export function unlockLoginIntroAudio(): void {
  /* alias — старт через beginLoginIntroPlayback */
}
