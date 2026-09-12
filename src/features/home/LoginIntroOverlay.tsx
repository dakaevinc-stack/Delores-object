import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { loadLocalSession } from '../../lib/localSession'
import styles from './LoginIntroOverlay.module.css'
import {
  getLoginIntroPlayer,
  stopLoginIntroPlayback,
} from './loginIntroPlayer'
import { notifyLoginIntroFinished } from './loginIntroPending'

type Props = {
  onDone: () => void
}

const FAILSAFE_MS = 12_000
const HANDOFF_MS = 1_200
const OUT_MS = 420

type Phase = 'video' | 'handoff' | 'out'

/**
 * Интро: вертикальный 9:16 ролик → бренд-мост 1,2 с → плавный выход в кабинет.
 */
export function LoginIntroOverlay({ onDone }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('video')
  const doneRef = useRef(false)
  const transitionRef = useRef<'idle' | 'handoff' | 'out' | 'done'>('idle')
  const handoffTimerRef = useRef<number | null>(null)
  const outTimerRef = useRef<number | null>(null)
  const session = loadLocalSession()

  const clearTimers = () => {
    if (handoffTimerRef.current != null) {
      window.clearTimeout(handoffTimerRef.current)
      handoffTimerRef.current = null
    }
    if (outTimerRef.current != null) {
      window.clearTimeout(outTimerRef.current)
      outTimerRef.current = null
    }
  }

  const complete = () => {
    if (doneRef.current) return
    doneRef.current = true
    transitionRef.current = 'done'
    clearTimers()
    notifyLoginIntroFinished()
    stopLoginIntroPlayback()
    onDone()
  }

  const beginOut = () => {
    if (transitionRef.current === 'out' || transitionRef.current === 'done') return
    transitionRef.current = 'out'
    clearTimers()
    setPhase('out')
    outTimerRef.current = window.setTimeout(complete, OUT_MS)
  }

  const beginHandoff = () => {
    if (transitionRef.current !== 'idle') return
    transitionRef.current = 'handoff'
    setPhase('handoff')
    handoffTimerRef.current = window.setTimeout(beginOut, HANDOFF_MS)
  }

  const finish = () => {
    if (doneRef.current) return
    if (transitionRef.current === 'out' || transitionRef.current === 'done') return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      beginOut()
      return
    }
    if (transitionRef.current === 'handoff') {
      beginOut()
      return
    }
    beginHandoff()
  }

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      beginOut()
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
      clearTimers()
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

  const screenClass = [
    styles.screen,
    phase === 'handoff' ? styles.screenHandoff : '',
    phase === 'out' ? styles.screenOut : '',
  ]
    .filter(Boolean)
    .join(' ')

  const videoClass = [
    styles.video,
    phase === 'handoff' || phase === 'out' ? styles.videoHandoff : '',
  ]
    .filter(Boolean)
    .join(' ')

  return createPortal(
    <div
      className={screenClass}
      role="dialog"
      aria-modal="true"
      aria-label="Вход в систему"
      onClick={() => {
        if (phase === 'video') finish()
        else if (phase === 'handoff') beginOut()
      }}
    >
      <div className={styles.stage}>
        <div ref={stageRef} className={styles.frame}>
          {/* video вставляется в frame; класс обновляем на элементе при handoff */}
        </div>
        <div
          className={[
            styles.handoff,
            phase === 'handoff' || phase === 'out' ? styles.handoffVisible : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={phase === 'video'}
        >
          <img className={styles.handoffMark} src="/brand-chevron.svg" alt="" />
          <p className={styles.handoffKicker}>Добро пожаловать</p>
          <p className={styles.handoffName}>{session?.fullName ?? session?.login ?? ''}</p>
          {session?.dutyLabel ? (
            <p className={styles.handoffRole}>{session.dutyLabel}</p>
          ) : null}
        </div>
      </div>
      {phase === 'video' ? (
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
      ) : null}
      <HandoffVideoClassSync phase={phase} videoClass={videoClass} stageRef={stageRef} />
    </div>,
    document.body,
  )
}

/** Синхронизируем класс видео после смены фазы (элемент живёт в ref). */
function HandoffVideoClassSync({
  phase,
  videoClass,
  stageRef,
}: {
  phase: Phase
  videoClass: string
  stageRef: RefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    const video = stageRef.current?.querySelector('video')
    if (video) video.className = videoClass
  }, [phase, videoClass, stageRef])
  return null
}
