const INTRO_SRC = '/login-intro.mp4?v=shorts-full'
const INTRO_POSTER = '/login-intro-poster.jpg?v=shorts-full'

let player: HTMLVideoElement | null = null

export function loginIntroSrc(): string {
  return INTRO_SRC
}

export function loginIntroPoster(): string {
  return INTRO_POSTER
}

/** Один video на всё приложение — стартует по жесту «Войти», без лага звука. */
export function getLoginIntroPlayer(): HTMLVideoElement {
  if (typeof document === 'undefined') {
    throw new Error('login intro player needs DOM')
  }
  if (!player) {
    player = document.createElement('video')
    player.setAttribute('data-login-intro-player', '1')
    player.playsInline = true
    player.setAttribute('playsinline', '')
    player.setAttribute('webkit-playsinline', 'true')
    player.preload = 'auto'
    player.controls = false
    player.disablePictureInPicture = true
    player.src = INTRO_SRC
    player.poster = INTRO_POSTER
    player.style.cssText =
      'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px;z-index:-1'
    document.body.appendChild(player)
  }
  return player
}

/** Синхронно из onClick «Войти»: старт ролика со звуком. */
export function beginLoginIntroPlayback(): void {
  const video = getLoginIntroPlayer()
  video.muted = false
  video.defaultMuted = false
  video.volume = 1
  video.removeAttribute('muted')
  try {
    if (video.currentTime > 0.05) video.currentTime = 0
  } catch {
    /* noop */
  }
  const kick = () => {
    void video.play().catch(() => {
      video.muted = true
      void video.play().then(() => {
        video.muted = false
        video.defaultMuted = false
        video.removeAttribute('muted')
      }).catch(() => {
        /* оверлей ещё попробует */
      })
    })
  }
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    kick()
  } else {
    const onReady = () => {
      video.removeEventListener('canplay', onReady)
      kick()
    }
    video.addEventListener('canplay', onReady)
    try {
      video.load()
    } catch {
      /* noop */
    }
    kick()
  }
}

export function stopLoginIntroPlayback(): void {
  if (!player) return
  try {
    player.pause()
    player.currentTime = 0
  } catch {
    /* noop */
  }
  player.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-99px;z-index:-1'
}

export function preloadLoginIntroPlayer(): void {
  if (typeof document === 'undefined') return
  const video = getLoginIntroPlayer()
  try {
    video.load()
  } catch {
    /* noop */
  }
  if (!document.querySelector(`link[data-login-intro="${INTRO_SRC}"]`)) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'video'
    link.href = INTRO_SRC
    link.setAttribute('data-login-intro', INTRO_SRC)
    document.head.appendChild(link)
  }
  if (!document.querySelector(`link[data-login-intro-poster="${INTRO_POSTER}"]`)) {
    const poster = document.createElement('link')
    poster.rel = 'preload'
    poster.as = 'image'
    poster.href = INTRO_POSTER
    poster.setAttribute('data-login-intro-poster', INTRO_POSTER)
    document.head.appendChild(poster)
  }
}
